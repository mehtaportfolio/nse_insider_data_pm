import assert from "node:assert/strict";
import { filterInsiderFilingsBySymbol, normalizeInsiderSymbol } from "./insiderSymbolService.js";

assert.equal(normalizeInsiderSymbol("NSE:infy"), "INFY");
assert.deepEqual(
    filterInsiderFilingsBySymbol([
        { symbol: "INFY" },
        { symbol: "TCS" },
        { symbol: "NSE:INFY" }
    ], "NSE:infy"),
    [{ symbol: "INFY" }, { symbol: "NSE:INFY" }]
);