import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

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
