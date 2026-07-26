import { fetchShareholding } from "./screenerShareholdingService.js";
import {
    getStocksBatch,
    getLastProcessedStock,
    updateLastProcessedStock,
    saveShareholding,
    cleanupOldRows
} from "./screenerSupabaseService.js";

const REQUEST_DELAY_MS = 1500;

export async function syncScreenerShareholding() {

    const lastStock = await getLastProcessedStock();

const stocks = await getStocksBatch(lastStock, 400);

if (!stocks.length) {

    console.log("======================================");
    console.log("All stocks completed.");
    console.log("Restarting from beginning...");
    console.log("======================================");

    await updateLastProcessedStock(null);

    return {
        success: true,
        total: 0,
        failed: 0
    };

}

console.log("Starting after:", lastStock ?? "BEGINNING");
    

    console.log(`Found ${stocks.length} stocks`);

let success = 0;
let failed = 0;
let processed = 0;
const failedStocks = [];

for (const stock of stocks) {

const stockName = stock.stock_name;

    try {

        console.log(`[${success + failed + 1}/${stocks.length}] ${stockName}`);

        const rows = await fetchShareholding(
    stock.stock_name,
    stock.exchange,
    stock.symbol_token
);

        await saveShareholding(rows);

        await cleanupOldRows(stockName);

processed++;

// Save progress every 25 stocks
if (processed % 25 === 0) {

    await updateLastProcessedStock(stockName);

    console.log(`Progress saved at ${stockName}`);

}

        success++;

    } catch (err) {

        failed++;

console.error(`[FAILED] ${stockName}`);
console.error(err.message);

failedStocks.push({
    stock: stockName,
    exchange: stock.exchange,
    error: err.message
});

    }

    // Wait before processing the next stock
    await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));

}
if (stocks.length) {

    await updateLastProcessedStock(
        stocks[stocks.length - 1].stock_name
    );

}

console.log("======================================");
console.log("Failed Stocks");
console.log("======================================");

console.table(failedStocks);

return {
    total: stocks.length,
    success,
    failed,
    failedStocks
};

}