import assert from "node:assert/strict";
import { normalizeTransactionForSupabase } from "../../services/supabaseService.js";

const transaction = {
  symbol: "ABC",
  companyName: "ABC Corp",
  personName: "Jane Doe",
  designation: "CEO",
  categoryOfPerson: "Promoter",
  instrument: "Equity",
  transactionType: "Buy",
  quantity: "100",
  value: "1000",
  holdingBefore: "10",
  holdingBeforePercent: "20%",
  holdingAfter: "110",
  holdingAfterPercent: "22%",
  transactionDate: "17/07/2026",
  modeOfAcquisitionOrDisposal: "Market Purchase",
  intimationDate: "17/07/2026",
  broadcastDate: "2026-07-17",
  filingUrl: "https://example.com/filing"
};

const normalized = normalizeTransactionForSupabase(transaction);

assert.equal(normalized.symbol, "ABC");
assert.equal(normalized.transaction_type, "Buy");
assert.equal(normalized.mode, "Market Purchase");
assert.equal(normalized.quantity, 100);
assert.equal(normalized.value, 1000);
assert.equal(normalized.transaction_date, "2026-07-17");


