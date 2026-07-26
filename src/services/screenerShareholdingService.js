import axios from "axios";
import * as cheerio from "cheerio";

const MONTH_MAP = {
    Mar: "03-31",
    Jun: "06-30",
    Sep: "09-30",
    Dec: "12-31"
};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function convertQuarterToDate(quarter) {

    const [month, year] = quarter.split(" ");

    return `${year}-${MONTH_MAP[month]}`;

}

function cleanPercent(value) {

    if (!value) return 0;

    return Number(
        value
            .replace("%", "")
            .replace(/,/g, "")
            .trim()
    );

}

function cleanNumber(value) {

    if (!value) return 0;

    return Number(
        value
            .replace(/,/g, "")
            .trim()
    );

}

function findRow(rows, keyword) {

    return rows.find(row => {

        if (!row.length) {
            return false;
        }

        const text = row[0]
            .replace(/\u00a0/g, " ")
            .replace(/\+/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .toLowerCase();

        return text.includes(keyword.toLowerCase());

    });

}

export async function fetchShareholding(
    stockName,
    exchange,
    symbolToken
) {



let url;

const exchangeName = exchange?.trim().toLowerCase();

if (exchangeName === "bse") {

    url = `https://www.screener.in/company/${symbolToken}/`;

} else {

    url = `https://www.screener.in/company/${stockName}/consolidated/`;

}

console.log(url);

let response;

for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

    try {

        response = await axios.get(url, {
            timeout: 30000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
                "Accept":
                    "text/html,application/xhtml+xml",
                "Accept-Language":
                    "en-US,en;q=0.9"
            }
        });

        break;

    } catch (err) {

        const status = err.response?.status;

        console.log(
            `Attempt ${attempt}/${MAX_RETRIES} failed for ${stockName}` +
            (status ? ` (HTTP ${status})` : "")
        );

    // Don't retry permanent errors
    if (status === 404) {
        throw new Error(`Screener page not found for ${stockName}`);
    }


if (attempt === MAX_RETRIES) {
    throw err;
}

        console.log(
            `Retrying in ${RETRY_DELAY_MS / 1000} seconds...`
        );

        await new Promise(resolve =>
            setTimeout(resolve, RETRY_DELAY_MS)
        );

    }

}

console.log(`Downloaded ${stockName} successfully`);
    const $ = cheerio.load(response.data);

    const heading = $("h2,h3").filter((i, el) =>
        $(el).text().trim() === "Shareholding Pattern"
    );

    if (!heading.length) {

        throw new Error("Shareholding section not found");

    }

    const section = heading.closest("section");

    const table = section.find("table").first();

    if (!table.length) {

        throw new Error("Shareholding table not found");

    }

    const rows = [];

    table.find("tr").each((i, row) => {

        const columns = [];

        $(row).find("th,td").each((j, cell) => {

            columns.push(
                $(cell)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim()
            );

        });

        if (columns.length) {

            rows.push(columns);

        }

    });

    if (!rows.length) {

        throw new Error("No rows found");

    }

    const quarters = rows[0].slice(1);

    const promotersRow = findRow(rows, "Promoters");
    const fiiRow = findRow(rows, "FIIs");
    const diiRow = findRow(rows, "DIIs");
    const publicRow = findRow(rows, "Public");
    const shareholdersRow = findRow(rows, "No. of Shareholders");

    if (!publicRow || !shareholdersRow) {

        throw new Error("Required rows missing");

    }

    const promoters = promotersRow ? promotersRow.slice(1) : [];
    const fii = fiiRow ? fiiRow.slice(1) : [];
    const dii = diiRow ? diiRow.slice(1) : [];
    const publicHolding = publicRow ? publicRow.slice(1) : [];
    const shareholders = shareholdersRow ? shareholdersRow.slice(1) : [];

    const result = [];

    const start = Math.max(0, quarters.length - 4);

    for (let i = start; i < quarters.length; i++) {

        const quarter = quarters[i];

        // Skip invalid quarter names
        if (!quarter || !MONTH_MAP[quarter.split(" ")[0]]) {
            continue;
        }

        result.push({

            symbol: stockName,
stock_name: stockName,

            report_date: convertQuarterToDate(quarter),

            promoters_pct: cleanPercent(
                promoters[i] ?? "0%"
            ),

            fii_pct: cleanPercent(
                fii[i] ?? "0%"
            ),

            dii_pct: cleanPercent(
                dii[i] ?? "0%"
            ),

            public_pct: cleanPercent(
                publicHolding[i] ?? "0%"
            ),

            shareholders: cleanNumber(
                shareholders[i] ?? "0"
            ),

            source: "screener"

        });

    }

    if (!result.length) {

        throw new Error("No quarterly data found");

    }

    return result;

}