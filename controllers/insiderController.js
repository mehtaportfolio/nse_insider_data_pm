import axios from "axios";
import { fetchInsiderFilings } from "../src/services/nseService.js";
import { parseDetail } from "../src/services/detailParser.js";
import { isNseInsiderFilingUrl, parseInsiderCsv } from "../src/services/insiderCsvService.js";
import { filterInsiderFilingsBySymbol, normalizeInsiderSymbol } from "../src/services/insiderSymbolService.js";
import { getSupabaseClient, normalizeTransactionForSupabase, upsertTransactions, pruneTransactionsToMonthWindow } from "../src/services/supabaseService.js";

const MAX_CSV_FILINGS = 10000;

function isWithinCurrentOrPreviousMonth(value, referenceDate = new Date()) {
  const match = `${value || ""}`.match(/(\d{1,2})[-/](\w{3,9})[-/](\d{4})/i);
  if (!match) return true;

  const day = Number(match[1]);
  const monthName = match[2].toLowerCase();
  const year = Number(match[3]);
  const monthMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4, jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };

  const month = monthMap[monthName];
  if (month === undefined) return true;

  const parsedDate = new Date(year, month, day);
  const currentDate = new Date(referenceDate);
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const previousMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
  const previousYear = previousMonthDate.getFullYear();
  const previousMonth = previousMonthDate.getMonth();

  const transactionYear = parsedDate.getFullYear();
  const transactionMonth = parsedDate.getMonth();

  return (
    (transactionYear === currentYear && transactionMonth === currentMonth) ||
    (transactionYear === previousYear && transactionMonth === previousMonth)
  );
}

export async function getTransactions(req, res) {
  try {
    const supabase = getSupabaseClient();
    let query = supabase.from("nse_insider_transactions").select("*", { count: "exact" });

    const symbol = `${req.query.symbol || ""}`.trim();
    if (symbol) {
      query = query.ilike("symbol", `%${symbol}%`);
    }

    const category = `${req.query.category || ""}`.trim();
    if (category) {
      const values = category.split(",").map((value) => value.trim()).filter(Boolean);
      if (values.length === 1) {
        query = query.eq("category_of_person", values[0]);
      } else {
        query = query.in("category_of_person", values);
      }
    }

    const transactionType = `${req.query.transactionType || ""}`.trim();
    if (transactionType) {
      query = query.eq("transaction_type", transactionType);
    }

    const mode = `${req.query.mode || ""}`.trim();
    if (mode) {
      query = query.eq("mode", mode);
    }

    const view = `${req.query.view || "nse"}`.trim().toLowerCase();
    if (view === "holdings") {
      const { data: stockData, error: stockError } = await supabase
        .from("stock_transactions")
        .select("stock_name")
        .is("sell_date", null);

      if (stockError) {
        throw stockError;
      }

      const holdingNames = [...new Set((stockData || []).map((row) => `${row.stock_name || ""}`.trim()).filter(Boolean))];
      if (holdingNames.length > 0) {
        query = query.in("symbol", holdingNames);
      } else {
        query = query.eq("symbol", "__NO_MATCH__");
      }
    }

    const sortBy = `${req.query.sortBy || "transaction_date"}`.trim();
    const allowedSortFields = ["symbol", "category_of_person", "transaction_date", "quantity", "mode", "transaction_type"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "transaction_date";
    const sortOrder = `${req.query.sortOrder || "desc"}`.toLowerCase() === "asc" ? true : false;

    query = query.order(sortField, { ascending: sortOrder });

    const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
    const limit = req.query.limit ? Math.max(1, Number.parseInt(req.query.limit, 10)) : null;
    const offset = limit ? (page - 1) * limit : 0;

    let dataQuery = query;
    if (limit) {
      dataQuery = query.range(offset, offset + limit - 1);
    }
    const { data, error, count } = await dataQuery;
    if (error) throw error;

    const total = count ?? (data ? data.length : 0);
    res.json({
      items: data || [],
      pagination: {
        page,
        limit,
        total,
        totalPages: limit ? Math.max(1, Math.ceil(total / limit)) : 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getFilterOptions(req, res) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from("nse_insider_transactions").select("category_of_person, mode, transaction_type");
    if (error) throw error;

    const categories = [...new Set((data || []).map((item) => item.category_of_person).filter(Boolean))].sort();
    const modes = [...new Set((data || []).map((item) => item.mode).filter(Boolean))].sort();
    const transactionTypes = [...new Set((data || []).map((item) => item.transaction_type).filter(Boolean))].sort();

    res.json({ categories, modes, transactionTypes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getStockMasterByName(req, res) {
  try {
    const stockName = `${req.query.stock_name || ""}`.trim();
    if (!stockName) {
      return res.status(400).json({ error: "Missing stock_name query parameter." });
    }

    const supabase = getSupabaseClient();
    const [{ data: masterData, error: masterError }, { data: mappingData, error: mappingError }] = await Promise.all([
      supabase
        .from("stock_master")
        .select("stock_name, industry, sector, category, macro_sector, known_sector, basic_industry")
        .eq("stock_name", stockName)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("stock_mapping")
        .select("cmp, lcp")
        .eq("stock_name", stockName)
        .limit(1)
        .maybeSingle()
    ]);

    if (masterError) {
      throw masterError;
    }
    if (mappingError && mappingError.code !== "PGRST116") {
      throw mappingError;
    }

    const result = {
      stock_name: masterData?.stock_name ?? stockName,
      cmp: mappingData?.cmp ?? null,
      lcp: mappingData?.lcp ?? null,
      ltp: masterData?.ltp ?? null,
      industry: masterData?.industry ?? null,
      sector: masterData?.sector ?? null,
      category: masterData?.category ?? null,
      macro_sector: masterData?.macro_sector ?? null,
      known_sector: masterData?.known_sector ?? null,
      basic_industry: masterData?.basic_industry ?? null
    };

    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getInsiderStockSuggestions(req, res, deps = {}) {
  try {
    const search = `${req.query.search || ""}`.trim();
    if (search.length < 2) return res.json([]);

    const getClient = deps.getSupabaseClient || getSupabaseClient;
    const supabase = getClient();
    const stockNames = new Set();
    const pageSize = 1000;

    for (let offset = 0; offset < 10000 && stockNames.size < 15; offset += pageSize) {
      let query = supabase
        .from("stock_transactions")
        .select("stock_name")
        .not("stock_name", "is", null)
        .ilike("stock_name", `%${search}%`)
        .order("stock_name", { ascending: true });
      const { data, error } = await query.range(offset, offset + pageSize - 1);
      if (error) throw error;

      for (const row of data || []) {
        const stockName = `${row.stock_name || ""}`.trim();
        if (stockName) stockNames.add(stockName);
        if (stockNames.size >= 15) break;
      }
      if (!data || data.length < pageSize) break;
    }

    const names = [...stockNames];
    if (names.length === 0) return res.json([]);

    const { data: masterRows, error: masterError } = await supabase
      .from("stock_master")
      .select("symbol, stock_name")
      .in("stock_name", names);
    if (masterError) throw masterError;

    const symbolsByName = new Map((masterRows || []).map((row) => [row.stock_name, row.symbol]));
    res.json(names.map((stockName) => ({
      stock_name: stockName,
      symbol: normalizeInsiderSymbol(symbolsByName.get(stockName) || stockName)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function syncTransactions(req, res) {
  const isEventStream = req.headers.accept === "text/event-stream";
  if (isEventStream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
  }

  try {
    const rawData = await fetchInsiderFilings();
    const requestedSymbol = normalizeInsiderSymbol(req.body?.symbol);
    const allFilings = rawData?.data || [];
    const filings = requestedSymbol
      ? filterInsiderFilingsBySymbol(allFilings, requestedSymbol)
      : allFilings;
    // Debug mode: do not filter filings by broadcast date here.
    // const filings = (rawData?.data || []).filter((filing) => isWithinCurrentOrPreviousMonth(filing.broadcastDateTime || filing.exchdisstime || ""));

    let totalTransactionsParsed = 0;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let processedFilings = 0;

    const sendProgress = (payload) => {
      if (req.headers.accept === "text/event-stream") {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    for (const filing of filings) {
      try {
        const currentIndex = processedFilings + 1;
        sendProgress({
          message: `Processing ${filing.symbol || "filing"}`,
          processed: currentIndex,
          total: filings.length,
          filing: filing.symbol || filing.companyName || "filing"
        });

        const response = await axios.get(filing.ixbrl, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Accept: "text/html"
          },
          timeout: 20000
        });

        const parsedTransactions = parseDetail(response.data, {
          companyName: filing.companyName,
          broadcastDateTime: filing.broadcastDateTime,
          filingUrl: filing.ixbrl,
          regulation: filing.regulation,
          typeOfSubmission: filing.typeOfSubmission
        });



        totalTransactionsParsed += parsedTransactions.length;
        sendProgress({
          message: `Parsed ${parsedTransactions.length} transactions from ${filing.symbol || "filing"}`,
          processed: currentIndex,
          total: filings.length,
          parsed: parsedTransactions.length
        });

        const normalizedTransactions = parsedTransactions
          .map((transaction) => normalizeTransactionForSupabase(transaction))
          .filter(Boolean);


        const result = await upsertTransactions(normalizedTransactions);
        totalInserted += result.inserted;
        totalSkipped += result.skipped;
        sendProgress({
          message: `Inserted ${result.inserted} rows, skipped ${result.skipped} duplicates for ${filing.symbol || "filing"}`,
          processed: currentIndex,
          total: filings.length,
          inserted: result.inserted,
          skipped: result.skipped
        });
        processedFilings += 1;
      } catch (error) {
        processedFilings += 1;
        totalFailed += 1;
        console.error(`Failed to sync filing ${filing.symbol}:`, error.message);
        sendProgress({
          message: `Failed for ${filing.symbol || "filing"}: ${error.message}`,
          processed: processedFilings,
          total: filings.length,
          error: error.message
        });
      }
    }

    const cleanup = requestedSymbol ? { deleted: 0 } : await pruneTransactionsToMonthWindow();
    if (!requestedSymbol) {
      sendProgress(`Removed ${cleanup.deleted} rows outside the current and previous month window`);
    }

    if (req.headers.accept === "text/event-stream") {
      res.write(`data: ${JSON.stringify({
        done: true,
        symbol: requestedSymbol || null,
        noData: Boolean(requestedSymbol && totalTransactionsParsed === 0 && totalFailed === 0),
        failed: totalFailed,
        totalFilingsProcessed: filings.length,
        totalTransactionsParsed,
        totalInserted,
        totalSkipped,
        deleted: cleanup.deleted
      })}\n\n`);
      res.end();
      return;
    }

    res.json({
      totalFilingsProcessed: filings.length,
      totalTransactionsParsed,
      totalInserted,
      totalSkipped,
      deleted: cleanup.deleted
    });
  } catch (error) {
    if (isEventStream) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
      return;
    }
    res.status(500).json({ error: error.message });
  }
}

export async function uploadInsiderCsv(req, res) {
  let filings;
  try {
    if (typeof req.body !== "string") {
      throw new Error("Upload a CSV file to import filings.");
    }
    filings = parseInsiderCsv(req.body);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (filings.length === 0) {
    return res.status(400).json({ error: "CSV contains no filing URLs in the DETAILS column." });
  }
  if (filings.length > MAX_CSV_FILINGS) {
    return res.status(413).json({ error: `CSV exceeds the ${MAX_CSV_FILINGS}-filing upload limit.` });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendProgress = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };
  const failures = [];
  let processed = 0;
  let totalParsed = 0;
  let totalUpserted = 0;
  let totalSkipped = 0;
  let nextFilingIndex = 0;

  const processFiling = async (filing) => {
    try {
      if (!isNseInsiderFilingUrl(filing.filingUrl)) {
        throw new Error("DETAILS must link to an NSE insider-trading HTML filing.");
      }

      const response = await axios.get(filing.filingUrl, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        timeout: 20000
      });
      const parsedTransactions = parseDetail(response.data, {
        companyName: filing.companyName,
        broadcastDateTime: filing.broadcastDateTime,
        filingUrl: filing.filingUrl,
        regulation: filing.regulation,
        typeOfSubmission: filing.typeOfSubmission
      });
      const normalizedTransactions = parsedTransactions
        .map((transaction) => normalizeTransactionForSupabase(transaction))
        .filter(Boolean);
      const result = await upsertTransactions(normalizedTransactions);

      totalParsed += parsedTransactions.length;
      totalUpserted += result.inserted;
      totalSkipped += result.skipped;
    } catch (error) {
      failures.push({ row: filing.rowNumber, symbol: filing.symbol, message: error.message });
      console.error(`Failed to import CSV filing on row ${filing.rowNumber}: ${error.message}`);
    }

    processed += 1;
    sendProgress({
      processed,
      total: filings.length,
      message: `${filing.symbol || filing.companyName || `CSV row ${filing.rowNumber}`}: ${totalParsed} parsed, ${totalUpserted} upserted`
    });
  };

  const worker = async () => {
    while (nextFilingIndex < filings.length) {
      const filing = filings[nextFilingIndex];
      nextFilingIndex += 1;
      await processFiling(filing);
    }
  };

  await Promise.all(Array.from({ length: Math.min(4, filings.length) }, worker));
  sendProgress({
    done: true,
    totalFilings: filings.length,
    totalParsed,
    totalUpserted,
    totalSkipped,
    failed: failures.length,
    errors: failures.slice(0, 5)
  });
  res.end();
}
