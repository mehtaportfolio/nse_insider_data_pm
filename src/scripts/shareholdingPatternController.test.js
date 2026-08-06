import test from "node:test";
import assert from "node:assert/strict";
import { getStockSuggestions, getShareholdingPattern } from "../controllers/shareholdingPatternController.js";

test("getStockSuggestions uses a 1000-row default limit when no search is provided", async () => {
  const requests = [];
  const fakeSupabase = {
    from(table) {
      requests.push({ action: "from", table });
      return {
        select() {
          requests.push({ action: "select" });
          const query = {
            or() {
              requests.push({ action: "or" });
              return query;
            },
            order() {
              return query;
            },
            limit(limit) {
              requests.push({ action: "limit", limit });
              return Promise.resolve({
                data: [{ symbol: "INFY", stock_name: "Infosys" }],
                error: null,
              });
            },
          };
          return query;
        },
      };
    },
  };

  const req = { query: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  await getStockSuggestions(req, res, {
    getSupabaseClient: () => fakeSupabase,
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{ symbol: "INFY", stock_name: "Infosys" }]);
  assert.equal(requests[requests.length - 1].limit, 1000);
});

test("getShareholdingPattern returns summary items for the matching stock symbol", async () => {
  const req = { query: { stock_name: "Infosys", limit: "2" } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  const fakeSupabase = {
    from(table) {
      if (table === "stock_master") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({
                      data: { stock_name: "INFY", symbol: "NSE:INFY" },
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }

      if (table === "shareholding_screener") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit(limit) {
                        return Promise.resolve({
                          data: [{ stock_name: "Infosys", report_date: "2024-03-31" }],
                          error: null,
                          count: 1,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      if (table === "shareholding_summary") {
        return {
          select() {
            return {
              eq() {
                return {
                  order() {
                    return {
                      limit(limit) {
                        return Promise.resolve({
                          data: [{ symbol: "INFY", report_date: "2024-03-31", promoter_pct: 52.1 }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  await getShareholdingPattern(req, res, { getSupabaseClient: () => fakeSupabase });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.summaryItems, [{ symbol: "INFY", report_date: "2024-03-31", promoter_pct: 52.1 }]);
  assert.equal(res.body.symbol, "INFY");
});
