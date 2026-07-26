import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

let supabaseClient = null;

function parseNumeric(value) {
  if (value === null || value === undefined) return null;
  const cleaned = `${value}`.trim().replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDate(value) {
  if (!value) return null;
  const trimmed = `${value}`.trim();
  const patterns = [
    /^(\d{1,2})[-/](\w{3,9})[-/](\d{4})$/i,
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    let day;
    let month;
    let year;

    if (pattern.source.includes("\\w")) {
      day = Number(match[1]);
      month = Number(new Date(`${match[2]} 1, 2000`).getMonth() + 1);
      year = Number(match[3]);
    } else if (pattern.source.startsWith("^(\\d{4}")) {
      year = Number(match[1]);
      month = Number(match[2]);
      day = Number(match[3]);
    } else {
      day = Number(match[1]);
      month = Number(match[2]);
      year = Number(match[3]);
    }

    if (!month || !day || !year) continue;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey || supabaseUrl.includes("your_supabase") || supabaseServiceRoleKey.includes("your_service")) {
    throw new Error("Supabase environment variables are not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.");
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseClient;
}

export function normalizeTransactionForSupabase(transaction) {
  if (!transaction) return null;

  const quantity = parseNumeric(transaction.quantity);
  const value = parseNumeric(transaction.value);
  const holdingBefore = parseNumeric(transaction.holdingBefore);
  const holdingBeforePercent = parseNumeric(transaction.holdingBeforePercent);
  const holdingAfter = parseNumeric(transaction.holdingAfter);
  const holdingAfterPercent = parseNumeric(transaction.holdingAfterPercent);

  return {
    symbol: `${transaction.symbol || ""}`.trim(),
    company_name: `${transaction.companyName || ""}`.trim(),
    person_name: `${transaction.personName || ""}`.trim(),
    designation: `${transaction.designation || ""}`.trim(),
    category_of_person: `${transaction.categoryOfPerson || ""}`.trim(),
    instrument: `${transaction.instrument || ""}`.trim(),
    transaction_type: `${transaction.transactionType || ""}`.trim(),
    quantity: quantity ?? null,
    value: value ?? null,
    holding_before: holdingBefore ?? null,
    holding_before_percent: holdingBeforePercent ?? null,
    holding_after: holdingAfter ?? null,
    holding_after_percent: holdingAfterPercent ?? null,
    transaction_date: normalizeDate(transaction.transactionDate),
    mode: `${transaction.modeOfAcquisitionOrDisposal || ""}`.trim(),
    intimation_date: normalizeDate(transaction.intimationDate),
    broadcast_date: transaction.broadcastDate ? new Date(transaction.broadcastDate).toISOString() : null,
    filing_url: `${transaction.filingUrl || ""}`.trim(),
    created_at: new Date().toISOString()
  };
}

export async function upsertTransactions(transactions) {
  const supabase = getSupabaseClient();

  // Transactions are already normalized by the controller.
  const normalizedRows = (transactions || []).filter(Boolean);

  const dedupedRows = [];
  const seen = new Set();

  for (const row of normalizedRows) {
    const key = `${row.symbol || ""}|${row.person_name || ""}|${row.transaction_date || ""}|${row.transaction_type || ""}|${row.quantity ?? ""}|${row.mode || ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedRows.push(row);
  }

  if (dedupedRows.length === 0) {
    return { inserted: 0, skipped: normalizedRows.length };
  }

const { data, error } = await supabase
  .from("nse_insider_transactions")
  .upsert(dedupedRows, {
    onConflict: "symbol,person_name,transaction_date,transaction_type,quantity,mode"
  })
  .select();

if (error) {
  console.error(error);
}


  return {
    inserted: dedupedRows.length,
    skipped: normalizedRows.length - dedupedRows.length
  };
}

export async function pruneTransactionsToMonthWindow(referenceDate = new Date()) {
  const supabase = getSupabaseClient();
  const currentYear = referenceDate.getFullYear();
  const currentMonth = referenceDate.getMonth();
  const previousMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth();

  const allowedMonths = new Set([`${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`, `${previousYear}-${String(previousMonth + 1).padStart(2, "0")}`]);

  const { data, error } = await supabase.from("nse_insider_transactions").select("id, transaction_date");
  if (error) throw error;

  const staleIds = (data || [])
    .filter((row) => {
      const dateString = row.transaction_date;
      if (!dateString) return true;
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return true;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return !allowedMonths.has(monthKey);
    })
    .map((row) => row.id);

  if (staleIds.length === 0) {
    return { deleted: 0 };
  }

  const { error: deleteError } = await supabase.from("nse_insider_transactions").delete().in("id", staleIds);
  if (deleteError) throw deleteError;

  return { deleted: staleIds.length };
}


export function normalizeShareholdingForSupabase(data) {
  if (!data) return null;

  return {
    symbol: (data.symbol || "").trim(),
    company_name: (data.companyName || "").trim(),
    isin: (data.isin || "").trim(),
    report_date: normalizeDate(data.reportDate),

    promoter_pct: parseNumeric(data.promoterPct),
    public_pct: parseNumeric(data.publicPct),

    fii_pct: parseNumeric(data.fiiPct),
    dii_pct: parseNumeric(data.diiPct),

    bank_pct: parseNumeric(data.bankPct),
    aif_pct: parseNumeric(data.aifPct),

    nri_pct: parseNumeric(data.nriPct),

    bodies_corporate_pct: parseNumeric(data.bodiesCorporatePct),

    retail_below_2l_pct: parseNumeric(data.retailBelow2L),
    retail_above_2l_pct: parseNumeric(data.retailAbove2L),

    other_non_institution_pct: parseNumeric(data.otherNonInstitutionPct),

    total_shareholding_pct: parseNumeric(data.totalShareholdingPct),

    total_shares: parseNumeric(data.totalShares),

    total_shareholders: parseNumeric(data.totalShareholders),

    created_at: new Date().toISOString()
  };
}

export async function upsertShareholdingSummary(summary) {

  const supabase = getSupabaseClient();

  const row = normalizeShareholdingForSupabase(summary);

  const { error } = await supabase
    .from("shareholding_summary")
    .upsert(row, {
      onConflict: "symbol,report_date"
    });

  if (error) {
    console.error(error);
    throw error;
  }

  return true;
}

export function normalizeShareholdingFilingForSupabase(filing, fallbackSymbol = "") {

  if (!filing) return null;

  return {
    symbol: `${filing.symbol || filing.stock_name || fallbackSymbol || ""}`.trim(),
    company_name: `${filing.company_name || filing.companyName || filing.name || ""}`.trim(),
    isin: `${filing.isin || ""}`.trim(),

    report_date: normalizeDate(filing.report_date || filing.reportDate || filing.date || filing.reportDate || filing.submissionDate),
    submission_date: normalizeDate(filing.submission_date || filing.submissionDate),

    promoter_pct: parseNumeric(filing.pr_and_prgrp || filing.promoterPct),
    public_pct: parseNumeric(filing.public_val || filing.publicPct),

    xbrl_url: `${filing.xbrl_url || filing.xbrlUrl || filing.xbrl || ""}`.trim(),

    created_at: new Date().toISOString()
  };
}

export function prepareShareholdingFilingsForUpsert(filings) {
  const rawFilings = Array.isArray(filings) ? filings : [];

  const normalizedRows = [];

  for (const filing of rawFilings) {
    const row = normalizeShareholdingFilingForSupabase(filing);

    if (!row) continue;

    normalizedRows.push(row);
  }

  const dedupedRows = [];
  const seen = new Map();

  for (const row of normalizedRows) {
    const key = `${row.symbol}|${row.report_date}`;

    // If the same symbol/report_date appears multiple times,
    // keep the last occurrence.
    seen.set(key, row);
  }

  for (const row of seen.values()) {
    dedupedRows.push(row);
  }

  return {
    rawFilings,
    normalizedRows,
    dedupedRows
  };
}

export async function upsertShareholdingFilings(filings) {

  const supabase = getSupabaseClient();
  const { dedupedRows } = prepareShareholdingFilingsForUpsert(filings);

  if (dedupedRows.length === 0) {
    return {
      inserted: 0
    };
  }

  const { error } = await supabase
    .from("shareholding_filings")
    .upsert(dedupedRows, {
      onConflict: "symbol,report_date"
    });

  if (error) {
    console.error(error);
    throw error;
  }

  return {
    inserted: dedupedRows.length
  };
}

export async function getNseStocksFromMaster() {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;
    const allRows = [];

    while (true) {
        const { data, error } = await supabase
            .from("stock_master")
            .select("stock_name, exchange")
            .range(from, from + pageSize - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
            break;
        }

        allRows.push(...data);

        if (data.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return allRows
        .map((row) => ({
            stock_name: `${row.stock_name || ""}`.trim(),
            exchange: `${row.exchange || ""}`.trim().toUpperCase()
        }))
        .filter((row) => row.stock_name && row.exchange === "NSE")
        .map((row) => row.stock_name);
}

export async function getShareholdingFilingsForSymbol(symbol) {
    const supabase = getSupabaseClient();
    const normalizedSymbol = `${symbol || ""}`.trim().toUpperCase();

    const { data, error } = await supabase
        .from("shareholding_filings")
        .select("symbol, report_date")
        .ilike("symbol", normalizedSymbol);

    if (error) throw error;

    return (data || [])
        .filter((row) => `${row.symbol || ""}`.trim().toUpperCase() === normalizedSymbol)
        .sort((left, right) => `${right.report_date || ""}`.localeCompare(`${left.report_date || ""}`));
}

export async function deleteShareholdingRowsForSymbol(symbol, reportDates) {
    const supabase = getSupabaseClient();

    const normalizedDates = Array.from(new Set((reportDates || []).filter(Boolean)));

    if (!symbol || normalizedDates.length === 0) {
        return { deletedFilings: 0, deletedSummaries: 0 };
    }

    const { error: filingError } = await supabase
        .from("shareholding_filings")
        .delete()
        .eq("symbol", symbol)
        .in("report_date", normalizedDates);

    if (filingError) throw filingError;

    const { error: summaryError } = await supabase
        .from("shareholding_summary")
        .delete()
        .eq("symbol", symbol)
        .in("report_date", normalizedDates);

    if (summaryError) throw summaryError;

    return {
        deletedFilings: normalizedDates.length,
        deletedSummaries: normalizedDates.length
    };
}

export async function getShareholdingFilings(limit = null) {

    const supabase = getSupabaseClient();

    // If a limit is explicitly requested
    if (limit) {

        const { data, error } = await supabase
            .from("shareholding_filings")
            .select("*")
            .order("report_date", { ascending: false })
            .limit(limit);

        if (error) throw error;

        return data;
    }

    // Fetch all rows in batches
    const pageSize = 1000;
    let from = 0;
    let allRows = [];

    while (true) {

        const { data, error } = await supabase
            .from("shareholding_filings")
            .select("*")
            .order("report_date", { ascending: false })
            .range(from, from + pageSize - 1);

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            break;
        }

        allRows.push(...data);

        console.log(
            `Fetched ${allRows.length} rows so far...`
        );

        if (data.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    console.log(`Total rows fetched: ${allRows.length}`);

    return allRows;
}