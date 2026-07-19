import assert from "node:assert/strict";
import { parseDetail } from "./detailParser.js";

const html = `
  <html>
    <body>
      <table>
        <tr><td>NSE Symbol</td><td>ABC</td></tr>
      </table>
      <table>
        <tr>
          <th>Type of Instrument</th>
          <th>Transaction Type</th>
          <th>Date</th>
          <th>Mode of Acquisition / Disposal</th>
        </tr>
        <tr>
          <td>Equity</td>
          <td>Buy</td>
          <td>17/07/2026</td>
          <td>Off Market Transfer</td>
        </tr>
      </table>
    </body>
  </html>
`;

const transactions = parseDetail(html, { companyName: "ABC Corp" });
assert.equal(transactions.length, 0, "mode should be filtered before insertion");
