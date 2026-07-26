import { getSupabaseClient } from "./supabaseService.js";

const supabase = getSupabaseClient();

/**
 * Fetch all symbols from stock_master
 */
export async function getAllStocks() {

    const allStocks = [];

    let from = 0;
    const batchSize = 1000;

    while (true) {

        const { data, error } = await supabase
            .from("stock_master")
            .select("stock_name, exchange, symbol_token")
 	    .eq("equity_type", "stock")
            .not("stock_name", "is", null)
            .order("stock_name", { ascending: true })
            .range(from, from + batchSize - 1);

        if (error) {
            throw error;
        }

        if (!data.length) {
            break;
        }

        allStocks.push(...data);

        console.log(`Loaded ${allStocks.length} stocks`);

        from += batchSize;

    }

    return allStocks;

}

export async function getStocksBatch(lastStockName, limit = 400) {

    let query = supabase
        .from("stock_master")
        .select("stock_name")
        .eq("equity_type", "stock")
        .order("stock_name", { ascending: true })
        .limit(limit);

    if (lastStockName) {
        query = query.gt("stock_name", lastStockName);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data;

}

/**
 * Insert or update shareholding rows
 */
export async function saveShareholding(rows) {

    if (!rows.length) return;

    const { error } = await supabase
        .from("shareholding_screener")
        .upsert(rows, {
            onConflict: "symbol,report_date"
        });

    if (error) {
        throw error;
    }
}

/**
 * Keep only latest 4 quarters for a symbol
 */
export async function cleanupOldRows(symbol) {

    const { data, error } = await supabase
        .from("shareholding_screener")
        .select("id")
        .eq("symbol", symbol)
        .order("report_date", { ascending: false });

    if (error) {
        throw error;
    }

    if (data.length <= 4) {
        return;
    }

    const idsToDelete = data
        .slice(4)
        .map(row => row.id);

    const { error: deleteError } = await supabase
        .from("shareholding_screener")
        .delete()
        .in("id", idsToDelete);

    if (deleteError) {
        throw deleteError;
    }
}

export async function getLastProcessedStock() {

    const { data, error } = await supabase
        .from("screener_sync_status")
        .select("last_stock_name")
        .eq("id", 1)
        .maybeSingle();

    if (error) throw error;

    return data?.last_stock_name ?? null;

}

export async function updateLastProcessedStock(stockName) {

    const { error } = await supabase
        .from("screener_sync_status")
        .update({
            last_stock_name: stockName,
            last_run_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq("id", 1);

    if (error) throw error;

}


/**
 * Get one stock by stock_name
 */
export async function getStock(stockName) {

    const { data, error } = await supabase
        .from("stock_master")
        .select("stock_name, exchange, symbol_token")
        .eq("stock_name", stockName)
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return data;

}