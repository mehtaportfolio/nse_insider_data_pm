import express from "express";

import {
    getSupabaseClient,
    getShareholdingFilings,
    upsertShareholdingSummary
} from "../services/supabaseService.js";

import { parseShareholdingXML } from "../services/shareholdingParser.js";
import { backfillShareholdingFilingsFromNse, syncShareholdingFilingsFromNse } from "../services/nseShareService.js";
import { isAuthorizedSyncRequest } from "../utils/syncAuth.js";

const router = express.Router();

async function resolveStockSymbol(stockNameOrSymbol) {
    const value = `${stockNameOrSymbol || ""}`.trim();

    if (!value) {
        return "";
    }

    const normalizedValue = value.includes(" - ") ? value.split(" - ")[0] : value;
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
        .from("stock_master")
        .select("symbol, stock_name")
        .or(`symbol.eq.${normalizedValue},stock_name.eq.${normalizedValue}`)
        .maybeSingle();

    if (error) {
        console.error(error);
        return normalizedValue.toUpperCase();
    }

    const resolvedSymbol = data?.stock_name || data?.symbol || normalizedValue;
    if (typeof resolvedSymbol !== "string") {
        return normalizedValue.toUpperCase();
    }

    const cleaned = resolvedSymbol.trim();
    const symbolParts = cleaned.split(":");
    return symbolParts[symbolParts.length - 1].toUpperCase();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

router.get("/api/shareholding-sync-trigger", async (req, res) => {
    const stockName = `${req.query.stock_name || ""}`.trim();

    if (!stockName) {
        res.status(400).json({
            success: false,
            error: "Missing stock_name query parameter."
        });
        return;
    }

    const secret = process.env.SYNC_SECRET || "";
    const targetUrl = `${req.protocol}://${req.get("host")}/shareholding-master-sync?mode=sync&stock_name=${encodeURIComponent(stockName)}&key=${encodeURIComponent(secret)}`;

    try {
        const response = await fetch(targetUrl);
        const payload = await response.json().catch(() => null);

        res.status(response.status).json(payload || {
            success: response.ok,
            error: "Sync trigger failed"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.all("/shareholding-master-sync", async (req, res) => {

    if (!isAuthorizedSyncRequest(req, process.env.SYNC_SECRET)) {
        res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
        return;
    }

    try {
        const shouldBackfill = `${req.query.mode || req.body?.mode || ""}`.toLowerCase() === "backfill";
        const stockName = `${req.query.stock_name || req.body?.stock_name || ""}`.trim();
        const resolvedSymbol = stockName ? await resolveStockSymbol(stockName) : "";
        const result = shouldBackfill
            ? await backfillShareholdingFilingsFromNse()
            : resolvedSymbol
                ? await syncShareholdingFilingsFromNse([resolvedSymbol])
                : await syncShareholdingFilingsFromNse();

        res.json({
            success: true,
            mode: shouldBackfill ? "backfill" : "sync",
            stockName: stockName || null,
            symbol: resolvedSymbol || null,
            ...result
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

router.get("/shareholding-sync", async (req, res) => {

    const start = Date.now();
    const supabase = getSupabaseClient();

    let processed = 0;
    let success = 0;
    let failed = 0;

    try {

        const { data: filings, error } = await supabase
    .from("missing_shareholding_summary")
    .select("*");


        console.log(`Found ${filings.length} filings`);

        for (const filing of filings) {

            processed++;

            console.log(`[${processed}/${filings.length}] ${filing.symbol}`);

            try {

                const summary = await parseShareholdingXML(filing.xbrl_url);
                await supabase
    .from("shareholding_filings")
    .update({
        symbol: summary.symbol || filing.symbol,
        company_name: summary.companyName || filing.company_name,
        isin: summary.isin || filing.isin
    })
    .eq("id", filing.id);

                await upsertShareholdingSummary(summary);

                success++;

                console.log("✓ Saved");

            } catch (err) {

                failed++;

                console.error(`✗ ${filing.symbol}: ${err.message}`);

            }

            // Small delay between requests to avoid hammering NSE
            await sleep(250);

            // Progress update every 50 filings
            if (processed % 50 === 0) {
                console.log(
                    `Progress: ${processed}/${filings.length} | Success: ${success} | Failed: ${failed}`
                );
            }

        }

        const seconds = ((Date.now() - start) / 1000).toFixed(1);

        console.log("\n========== SYNC COMPLETE ==========");
        console.log(`Processed : ${processed}`);
        console.log(`Success   : ${success}`);
        console.log(`Failed    : ${failed}`);
        console.log(`Duration  : ${seconds} sec`);
        console.log("===================================\n");

        res.json({
            success: true,
            processed,
            successCount: success,
            failed,
            duration: `${seconds} sec`
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

export default router;