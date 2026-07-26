import client from "../utils/axiosClient.js";
import {
    deleteShareholdingRowsForSymbol,
    getNseStocksFromMaster,
    getShareholdingFilingsForSymbol,
    normalizeShareholdingFilingForSupabase,
    upsertShareholdingFilings,
    upsertShareholdingSummary,
    getSupabaseClient
} from "./supabaseService.js";
import { parseShareholdingXML } from "./shareholdingParser.js";

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseShareholdingXMLWithRetry(xbrlUrl, maxAttempts = 3) {
    if (!xbrlUrl) {
        throw new Error("Missing XBRL URL for summary parsing.");
    }

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await parseShareholdingXML(xbrlUrl);
        } catch (error) {
            lastError = error;
            console.warn(`Failed to parse XBRL (attempt ${attempt}/${maxAttempts}) for ${xbrlUrl}: ${error.message}`);
            if (attempt < maxAttempts) {
                await sleep(2000 * attempt);
            }
        }
    }

    throw lastError || new Error("Failed to parse XBRL summary after retries.");
}

async function isSummaryComplete(symbol, reportDates) {
    if (!symbol || !Array.isArray(reportDates) || reportDates.length === 0) {
        return false;
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from("shareholding_summary")
        .select("report_date")
        .eq("symbol", symbol)
        .in("report_date", reportDates);

    if (error) {
        console.error(error);
        return false;
    }

    const existingSummaryDates = (data || []).map((row) => `${row.report_date || ""}`.trim());
    return reportDates.every((date) => existingSummaryDates.includes(date));
}

export function shouldRefreshShareholdingWindow(existingRows = [], filingsToRetain = []) {
    if (!Array.isArray(existingRows)) {
        existingRows = [];
    }

    if (!Array.isArray(filingsToRetain)) {
        filingsToRetain = [];
    }

    if (!existingRows.length) {
        return true;
    }

    if (!filingsToRetain.length) {
        return false;
    }

    const existingDates = (existingRows || [])
        .map((row) => row.report_date)
        .filter(Boolean);

    const retainedDates = (filingsToRetain || [])
        .map((row) => row.report_date)
        .filter(Boolean);

    const targetCount = filingsToRetain.length;

    if (existingRows.length < targetCount) {
        return true;
    }

    const latestExistingDate = existingRows[0]?.report_date || null;
    const latestIncomingDate = filingsToRetain[0]?.report_date || null;
    const datesMatch = existingDates.length === retainedDates.length && existingDates.every((date) => retainedDates.includes(date));
    const hasNewer = !latestExistingDate || !latestIncomingDate || latestIncomingDate > latestExistingDate;

    return !datesMatch || hasNewer;
}

export function selectLatestQuarterlyFilings(filings, limit = 4) {
    if (!Array.isArray(filings)) {
        return [];
    }

    const normalized = (filings || [])
        .map((filing) => normalizeShareholdingFilingForSupabase(filing))
        .filter(Boolean)
        .filter((row) => row.symbol && row.report_date)
        .map((row) => ({ ...row, date: row.report_date }));

    normalized.sort((left, right) => {
        const leftDate = left.report_date || "";
        const rightDate = right.report_date || "";
        return rightDate.localeCompare(leftDate);
    });

    return normalized.slice(0, Math.max(1, limit));
}

export async function fetchShareholdingFilings(symbol) {
    const url = symbol
        ? `https://www.nseindia.com/api/corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(symbol)}`
        : "https://www.nseindia.com/api/corporate-share-holdings-master?index=equities";

    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
        try {
            console.log(`Fetching shareholding filings from NSE for ${symbol || "all symbols"} (attempt ${attempt}/${maxRetries})...`);

            const response = await client.get(url, {
                timeout: 60000
            });

            console.log(`Shareholding data fetched successfully for ${symbol || "all symbols"}`);

            return response.data;
        } catch (err) {
            const isLastAttempt = attempt === maxRetries;
            console.error(`Failed to fetch shareholding filings for ${symbol || "all symbols"} (attempt ${attempt}/${maxRetries}):`, err.message);

            if (isLastAttempt) {
                throw err;
            }

            const retryDelayMs = 2000 * attempt;
            console.log(`Retrying in ${retryDelayMs}ms...`);
            await sleep(retryDelayMs);
        }
    }

    throw new Error(`Unable to fetch shareholding filings for ${symbol || "all symbols"}`);
}

async function processShareholdingWindowForSymbol(symbol, options = {}) {
    const { forceRefresh = false } = options;
    const supabase = getSupabaseClient();
    const modeLabel = forceRefresh ? "shareholding-backfill" : "shareholding-sync";

    const existingRows = await getShareholdingFilingsForSymbol(symbol);

    console.log(`[${modeLabel}] processing ${symbol}`);

    const rawFilings = await fetchShareholdingFilings(symbol);
    const filingsToRetain = selectLatestQuarterlyFilings(rawFilings, 4);

    if (!filingsToRetain.length) {
        return {
            symbol,
            refreshed: false,
            insertedOrUpdatedFilings: 0,
            insertedOrUpdatedSummaries: 0,
            prunedFilings: 0
        };
    }

    const retainedDates = filingsToRetain
        .map((row) => row.report_date)
        .filter(Boolean);
    const shouldRefreshWindow = forceRefresh || shouldRefreshShareholdingWindow(existingRows, filingsToRetain);
    const summaryComplete = await isSummaryComplete(symbol, retainedDates);

    if (!shouldRefreshWindow && summaryComplete) {
        console.log(`No newer filing for ${symbol}; keeping the current four-quarter window and summaries`);
        return {
            symbol,
            refreshed: false,
            insertedOrUpdatedFilings: 0,
            insertedOrUpdatedSummaries: 0,
            prunedFilings: 0
        };
    }

    await upsertShareholdingFilings(filingsToRetain);
    let insertedOrUpdatedFilings = filingsToRetain.length;
    let insertedOrUpdatedSummaries = 0;
    let prunedFilings = 0;

    for (const filing of filingsToRetain) {
        const summaryExists = await supabase
            .from("shareholding_summary")
            .select("symbol, report_date")
            .eq("symbol", filing.symbol)
            .eq("report_date", filing.report_date)
            .maybeSingle();

        if (summaryExists.data) {
            continue;
        }

        if (!filing.xbrl_url) {
            console.warn(`Skipping summary creation for ${filing.symbol} ${filing.report_date}: missing XBRL URL`);
            continue;
        }

        try {
            const summary = await parseShareholdingXMLWithRetry(filing.xbrl_url);
            await upsertShareholdingSummary(summary);
            insertedOrUpdatedSummaries += 1;
            console.log(`Recreated missing shareholding_summary for ${filing.symbol} ${filing.report_date}`);
        } catch (error) {
            console.warn(`Failed to parse XBRL for ${filing.symbol} ${filing.report_date}: ${error.message}`);
        }

        await sleep(250);
    }

    const existingToPrune = existingRows
        .filter((row) => !retainedDates.includes(row.report_date))
        .map((row) => row.report_date)
        .filter(Boolean);

    if (existingToPrune.length) {
        const pruneResult = await deleteShareholdingRowsForSymbol(symbol, existingToPrune);
        prunedFilings += pruneResult.deletedFilings;
    }

    await sleep(300);

    return {
        symbol,
        refreshed: true,
        insertedOrUpdatedFilings,
        insertedOrUpdatedSummaries,
        prunedFilings
    };
}

export async function syncShareholdingFilingsFromNse(symbols = null) {
    const symbolsToProcess = Array.isArray(symbols) && symbols.length > 0
        ? symbols.filter(Boolean).map((symbol) => `${symbol || ""}`.trim()).filter(Boolean)
        : await getNseStocksFromMaster();

    if (!symbolsToProcess.length) {
        return {
            processedSymbols: 0,
            insertedOrUpdatedFilings: 0,
            insertedOrUpdatedSummaries: 0,
            prunedFilings: 0
        };
    }

    let insertedOrUpdatedFilings = 0;
    let insertedOrUpdatedSummaries = 0;
    let prunedFilings = 0;

    for (let index = 0; index < symbolsToProcess.length; index += 1) {
        const symbol = symbolsToProcess[index];
        console.log(`[shareholding-sync] ${index + 1}/${symbolsToProcess.length} processing ${symbol}`);

        const result = await processShareholdingWindowForSymbol(symbol, {
            forceRefresh: false
        });

        if ((index + 1) % 100 === 0) {
            console.log(`Pausing for 30 seconds after ${index + 1} stocks to reduce NSE pressure...`);
            await sleep(10000);
        }

        insertedOrUpdatedFilings += result.insertedOrUpdatedFilings;
        insertedOrUpdatedSummaries += result.insertedOrUpdatedSummaries;
        prunedFilings += result.prunedFilings;
    }

    return {
        processedSymbols: symbolsToProcess.length,
        insertedOrUpdatedFilings,
        insertedOrUpdatedSummaries,
        prunedFilings
    };
}

export async function backfillShareholdingFilingsFromNse() {
    const symbols = await getNseStocksFromMaster();

    if (!symbols.length) {
        return {
            processedSymbols: 0,
            insertedOrUpdatedFilings: 0,
            insertedOrUpdatedSummaries: 0,
            prunedFilings: 0
        };
    }

    let insertedOrUpdatedFilings = 0;
    let insertedOrUpdatedSummaries = 0;
    let prunedFilings = 0;
    let skippedStocks = 0;

    for (let index = 0; index < symbols.length; index += 1) {
        const symbol = symbols[index];
        const existingRows = await getShareholdingFilingsForSymbol(symbol);

        if (existingRows.length >= 4) {
            skippedStocks += 1;
            continue;
        }

        console.log(`[shareholding-backfill] ${index + 1}/${symbols.length} processing ${symbol}`);

        const result = await processShareholdingWindowForSymbol(symbol, {
            forceRefresh: true
        });

        if ((index + 1) % 100 === 0) {
            console.log(`Pausing for 30 seconds after ${index + 1} stocks to reduce NSE pressure...`);
            await sleep(10000);
        }

        insertedOrUpdatedFilings += result.insertedOrUpdatedFilings;
        insertedOrUpdatedSummaries += result.insertedOrUpdatedSummaries;
        prunedFilings += result.prunedFilings;
    }

    return {
        processedSymbols: symbols.length,
        insertedOrUpdatedFilings,
        insertedOrUpdatedSummaries,
        prunedFilings
    };
}