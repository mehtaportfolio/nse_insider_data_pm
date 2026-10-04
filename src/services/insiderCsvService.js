function parseCsvRows(input) {
    const text = `${input || ""}`.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];

        if (character === '"') {
            if (insideQuotes && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (insideQuotes) {
                insideQuotes = false;
            } else if (field.length === 0) {
                insideQuotes = true;
            } else {
                field += character;
            }
        } else if (!insideQuotes && character === ",") {
            row.push(field);
            field = "";
        } else if (!insideQuotes && (character === "\n" || character === "\r")) {
            row.push(field);
            if (row.some((value) => value.trim())) rows.push(row);
            row = [];
            field = "";
            if (character === "\r" && text[index + 1] === "\n") index += 1;
        } else {
            field += character;
        }
    }

    if (insideQuotes) {
        throw new Error("CSV contains an unterminated quoted field.");
    }

    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    return rows;
}

function normalizeHeader(value) {
    return `${value || ""}`.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers, names) {
    const aliases = new Set(names.map(normalizeHeader));
    return headers.findIndex((header) => aliases.has(normalizeHeader(header)));
}

export function parseInsiderCsv(input) {
    const rows = parseCsvRows(input);
    if (rows.length < 2) {
        throw new Error("CSV has no filing rows.");
    }

    const headers = rows[0];
    const detailsIndex = findColumn(headers, ["details", "html", "html link", "filing details", "ixbrl"]);
    if (detailsIndex < 0) {
        throw new Error("CSV is missing the DETAILS column containing filing HTML links.");
    }

    const columns = {
        symbol: findColumn(headers, ["symbol", "nse symbol"]),
        companyName: findColumn(headers, ["company name", "company"]),
        regulation: findColumn(headers, ["regulation"]),
        typeOfSubmission: findColumn(headers, ["type of submission", "submission type"]),
        broadcastDateTime: findColumn(headers, ["broadcast date/time", "broadcast date time", "broadcast date"])
    };

    return rows.slice(1).map((values, index) => {
        const getValue = (columnIndex) => columnIndex < 0 ? "" : `${values[columnIndex] || ""}`.trim();
        return {
            rowNumber: index + 2,
            symbol: getValue(columns.symbol),
            companyName: getValue(columns.companyName),
            regulation: getValue(columns.regulation),
            typeOfSubmission: getValue(columns.typeOfSubmission),
            broadcastDateTime: getValue(columns.broadcastDateTime),
            filingUrl: getValue(detailsIndex)
        };
    }).filter((filing) => filing.filingUrl);
}

export function isNseInsiderFilingUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === "https:" &&
            url.hostname === "nsearchives.nseindia.com" &&
            url.pathname.startsWith("/corporate/ixbrl/");
    } catch {
        return false;
    }
}