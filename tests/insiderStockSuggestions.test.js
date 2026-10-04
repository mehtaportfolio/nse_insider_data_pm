import test from "node:test";
import assert from "node:assert/strict";
import { getInsiderStockSuggestions } from "../controllers/insiderController.js";

test("insider stock suggestions use stock_transactions and map to NSE symbols", async () => {
  const requests = [];
  const fakeSupabase = {
    from(table) {
      requests.push({ action: "from", table });
      return {
        select(columns) {
          requests.push({ action: "select", columns });
          const query = {
            not() { return query; },
            ilike(column, value) {
              requests.push({ action: "ilike", column, value });
              return query;
            },
            order() { return query; },
            async range(start, end) {
              requests.push({ action: "range", start, end });
              return { data: [{ stock_name: "INFY" }, { stock_name: "INFY" }], error: null };
            },
            in(column, values) {
              requests.push({ action: "in", column, values });
              return Promise.resolve({ data: [{ stock_name: "INFY", symbol: "NSE:INFY" }], error: null });
            }
          };
          return query;
        }
      };
    }
  };
  const req = { query: { search: "infy" } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };

  await getInsiderStockSuggestions(req, res, { getSupabaseClient: () => fakeSupabase });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ stock_name: "INFY", symbol: "INFY" }]);
  assert.ok(requests.some((request) => request.table === "stock_transactions"));
  assert.ok(requests.some((request) => request.table === "stock_master"));
});