import client from "../utils/axiosClient.js";

function formatDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

export async function fetchInsiderFilings() {
    try {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        const endDate = today;

        const fromDate = formatDate(startDate);
        const toDate = formatDate(endDate);

        const url = `https://www.nseindia.com/api/corporates-pit-gg?index=equities&from_date=${fromDate}&to_date=${toDate}`;

        console.log("Fetching insider filings from NSE...", url);

        await client.get("https://www.nseindia.com/companies-listing/corporate-filings-insider-trading", {
            timeout: 60000
        });

        const response = await client.get(url, {
            timeout: 60000
        });

        console.log("NSE data fetched successfully");
        return response.data;
    } catch (err) {
        const status = err.response?.status;
        const message = status === 403
            ? "NSE returned 403 Forbidden. Its anti-bot protection may be blocking this server; try again later."
            : err.message;
        console.error(`Failed to fetch insider filings${status ? ` (HTTP ${status})` : ""}: ${message}`);
        throw new Error(message, { cause: err });
    }
}