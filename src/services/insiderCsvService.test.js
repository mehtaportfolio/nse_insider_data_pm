import assert from "node:assert/strict";
import { parseInsiderCsv, isNseInsiderFilingUrl } from "./insiderCsvService.js";

const csv = [
    '"SYMBOL \n","COMPANY NAME \n","DETAILS \n","BROADCAST DATE/TIME \n"',
    '"ABC","A Company, Limited","https://nsearchives.nseindia.com/corporate/ixbrl/filing.html","03-Oct-2026 19:52:03"'
].join("\r\n");

const [filing] = parseInsiderCsv(csv);
assert.equal(filing.symbol, "ABC");
assert.equal(filing.companyName, "A Company, Limited");
assert.equal(filing.filingUrl, "https://nsearchives.nseindia.com/corporate/ixbrl/filing.html");
assert.equal(filing.broadcastDateTime, "03-Oct-2026 19:52:03");
assert.equal(isNseInsiderFilingUrl(filing.filingUrl), true);
assert.equal(isNseInsiderFilingUrl("https://example.com/corporate/ixbrl/filing.html"), false);
assert.throws(() => parseInsiderCsv('"SYMBOL","DETAILS\n"ABC","unterminated'), /unterminated quoted field/);