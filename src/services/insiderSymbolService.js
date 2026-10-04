export function normalizeInsiderSymbol(value) {
    return `${value || ""}`.trim().replace(/^NSE:/i, "").toUpperCase();
}

export function filterInsiderFilingsBySymbol(filings, symbol) {
    const targetSymbol = normalizeInsiderSymbol(symbol);
    if (!targetSymbol || !Array.isArray(filings)) return [];

    return filings.filter((filing) => normalizeInsiderSymbol(filing?.symbol) === targetSymbol);
}