import express from "express";
import { fetchShareholding } from "../services/screenerShareholdingService.js";
import {
    getStock,
    saveShareholding,
    cleanupOldRows
} from "../services/screenerSupabaseService.js";

const router = express.Router();

/**
 * Test a single symbol
 * Example:
 * http://localhost:3000/screener-shareholding/AVANTEL
 */
router.get("/screener-shareholding/:symbol", async (req, res) => {
    try {

        const symbol = req.params.symbol.toUpperCase();

        console.log(`Fetching shareholding for ${symbol}`);

        const data = await fetchShareholding(symbol);

        res.json({
            success: true,
            symbol,
            totalQuarters: data.length,
            data
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
});

router.get("/screener-stock/:stockName", async (req, res) => {

    if (req.query.key !== process.env.SYNC_SECRET) {

        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });

    }

    try {

        const stockName = decodeURIComponent(req.params.stockName).trim();

        const stock = await getStock(stockName);

        if (!stock) {

            return res.status(404).json({
                success: false,
                error: "Stock not found"
            });

        }

        const rows = await fetchShareholding(
            stock.stock_name,
            stock.exchange,
            stock.symbol_token
        );

        await saveShareholding(rows);

        await cleanupOldRows(stock.stock_name);

        res.json({
            success: true,
            stock: stock.stock_name,
            exchange: stock.exchange,
            quarters: rows.length,
            data: rows
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