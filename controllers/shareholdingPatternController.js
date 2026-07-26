import { getSupabaseClient } from "../src/services/supabaseService.js";

export function buildStockSuggestionsQuery(supabase, search, limit) {
  let query = supabase.from("stock_master").select("symbol, stock_name");

  if (search) {
    query = query.or(`symbol.ilike.%${search}%,stock_name.ilike.%${search}%`);
  }

  return query.order("stock_name", { ascending: true }).limit(limit);
}

export async function getStockSuggestions(req, res, deps = {}) {
  try {
    const search = `${req.query.search || ""}`.trim();
    const getClient = deps.getSupabaseClient || getSupabaseClient;
    const supabase = getClient();
    const limit = Math.min(1000, Math.max(1, Number.parseInt(req.query.limit || "1000", 10)));

    const { data, error } = await buildStockSuggestionsQuery(supabase, search, limit);

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function getShareholdingPattern(req, res, deps = {}) {
  try {
    const stockName = `${req.query.stock_name || ""}`.trim();
    if (!stockName) {
      return res.status(400).json({ error: "Missing stock_name query parameter." });
    }

    const getClient = deps.getSupabaseClient || getSupabaseClient;
    const supabase = getClient();
    const sortBy = `${req.query.sort_by || "report_date"}`.trim();
    const sortOrder = `${req.query.sort_order || "desc"}`.toLowerCase() === "asc" ? true : false;
    const limit = Math.min(4, Math.max(1, Number.parseInt(req.query.limit || "4", 10)));

    const { data: stockData, error: stockError } = await supabase
      .from("stock_master")
      .select("stock_name, symbol")
      .eq("stock_name", stockName)
      .maybeSingle();

    if (stockError) throw stockError;

    const stockSymbol = `${stockData?.stock_name || stockData?.symbol || ""}`.trim().toUpperCase();

    let query = supabase
      .from("shareholding_screener")
      .select("*", { count: "exact" })
      .eq("stock_name", stockName)
      .order(sortBy, { ascending: sortOrder });

    const { data, error, count } = await query.limit(limit);

    if (error) throw error;

    const summaryQuery = stockSymbol
      ? supabase
          .from("shareholding_summary")
          .select("*")
          .eq("symbol", stockSymbol)
          .order(sortBy, { ascending: sortOrder })
      : null;

    let summaryItems = [];
    if (summaryQuery) {
      const { data: summaryData, error: summaryError } = await summaryQuery.limit(limit);
      if (summaryError) throw summaryError;
      summaryItems = summaryData || [];
    }

    res.json({
      data: data && data.length > 0 ? data[0] : null,
      items: data || [],
      summaryItems,
      symbol: stockSymbol || null,
      pagination: {
        total: count || 0,
        limit,
        returned: data ? data.length : 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
