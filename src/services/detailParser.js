import * as cheerio from "cheerio";

function monthNameToNumber(month) {
    const months = {
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        sept: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12
    };

    return months[month.toLowerCase()] || null;
}

function normalizeDate(value) {
    if (!value) return null;

    const trimmed = `${value}`.trim();
    const patterns = [
        /^(\d{1,2})[-/](\w{3,9})[-/](\d{4})$/i,
        /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/,
        /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/,
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
    ];

    for (const pattern of patterns) {
        const match = trimmed.match(pattern);
        if (!match) continue;

        let day;
        let month;
        let year;

        if (pattern.source.includes("\\w")) {
            day = Number(match[1]);
            month = monthNameToNumber(match[2]);
            year = Number(match[3]);
        } else if (pattern.source.startsWith("^(\\d{4}")) {
            year = Number(match[1]);
            month = Number(match[2]);
            day = Number(match[3]);
        } else {
            day = Number(match[1]);
            month = Number(match[2]);
            year = Number(match[3]);
        }

        if (!month) continue;

        const parsedDate = new Date(year, month - 1, day);
        if (
            parsedDate.getFullYear() === year &&
            parsedDate.getMonth() === month - 1 &&
            parsedDate.getDate() === day
        ) {
            return parsedDate;
        }
    }

    return null;
}

function isWithinAllowedDateRange(value, referenceDate = new Date()) {
    const parsedDate = normalizeDate(value);
    if (!parsedDate) return false;

    const currentDate = new Date(referenceDate);
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const previousMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const previousYear = previousMonthDate.getFullYear();
    const previousMonth = previousMonthDate.getMonth();

    const transactionYear = parsedDate.getFullYear();
    const transactionMonth = parsedDate.getMonth();

    return (
        (transactionYear === currentYear && transactionMonth === currentMonth) ||
        (transactionYear === previousYear && transactionMonth === previousMonth)
    );
}

function normalizeText(value) {
    return `${value || ""}`.trim();
}

function normalizeKey(value) {
    return `${value || ""}`
        .trim()
        .toLowerCase()
        .replace(/[\s\u00A0]+/g, " ")
        .replace(/[\/\\:\.\-\_]+/g, "")
        .replace(/[^a-z0-9]/g, "");
}

function normalizeHeader(value) {
    return normalizeKey(value);
}

function headerIndexMap(headerCells) {
    const map = {};
    headerCells.forEach((text, index) => {
        const key = normalizeHeader(text);
        if (key) {
            map[key] = index;
        }
    });
    return map;
}

function findHeaderIndex(map, synonyms) {
    for (const name of synonyms) {
        const key = normalizeHeader(name);
        if (key in map) return map[key];
    }
    return -1;
}

function getField(cols, headerMap, synonyms, fallbackIndices = []) {
    const normalizedSynonyms = synonyms.map(normalizeKey);
    for (const col of cols) {
        if (col.ixName) {
            const ixName = normalizeKey(col.ixName);
            const ixShort = normalizeKey(col.ixName.split(":").pop());
            if (normalizedSynonyms.includes(ixName) || normalizedSynonyms.includes(ixShort)) {
                return col.text;
            }
        }
    }

    const headerIndex = findHeaderIndex(headerMap, synonyms);
    if (headerIndex >= 0 && headerIndex < cols.length) {
        return cols[headerIndex].text || "";
    }

    for (const fallback of fallbackIndices) {
        if (fallback >= 0 && fallback < cols.length) {
            return cols[fallback].text || "";
        }
    }

    return "";
}

function isAllowedInstrument(value) {
    return normalizeText(value).toLowerCase() === "equity";
}

function isAllowedTransactionType(value) {
    const normalized = normalizeText(value).toLowerCase();
    return normalized === "buy" || normalized === "sell";
}

function isAllowedMode(value) {
  const allowed = ['market purchase','market sale', 'block deal'];
  const v = normalizeText(value).toLowerCase();
  return allowed.some((a) => v.includes(a));
}

function parseNumeric(value) {
    const cleaned = normalizeText(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
    return Number(cleaned);
}

export function parseDetail(html, context = {}) {

    const $ = cheerio.load(html);

    let symbol = "";
    let signatory = "";
    let designation = "";

    $("table").eq(0).find("tr").each((_, row) => {

        const cells = [];

        $(row).find("td").each((_, td) => {
            cells.push($(td).text().trim());
        });

        if (cells.length < 2) return;

        switch (cells[0]) {

            case "NSE Symbol":
                symbol = cells[1];
                break;

            case "Name of the Signatory":
                signatory = cells[1];
                break;

            case "Designation of Signatory":
                designation = cells[1];
                break;
        }
    });

    const transactions = [];

    const transactionRows = $("table").eq(1).find("tr");
    const headerCells = [];
    transactionRows.first().find("th, td").each((_, cell) => {
        headerCells.push($(cell).text().trim());
    });

    function isLikelyHeaderRow(cells) {
        const knownHeaders = [
            "sr. no",
            "type of instrument",
            "description of type of instrument",
            "category of person",
            "name of the person",
            "cin / din",
            "date of allotment advice",
            "mode of acquisition",
            "transaction type",
            "exchange on which the trade was executed",
            "notes"
        ].map(normalizeHeader);

        return cells.some((text) => {
            const normalized = normalizeHeader(text);
            return knownHeaders.some((header) => normalized.includes(header));
        });
    }

    const hasHeaderRow = headerCells.length > 0 && isLikelyHeaderRow(headerCells);
    const headerMap = hasHeaderRow ? headerIndexMap(headerCells) : {};
    const bodyRows = hasHeaderRow ? transactionRows.slice(1) : transactionRows;

    bodyRows.each((_, row) => {

        const cols = [];

        $(row).find("td").each((_, td) => {
            const element = $(td);
const ixChild = element.find("*[name]").first();

            cols.push({
                text: element.text().trim(),
                ixName: ixChild.attr("name") || ""
            });
        });

        if (cols.length === 0) return;

        const instrument = getField(cols, headerMap, [
            "typeofinstrument",
            "type of instrument",
            "security",
            "instrument/trade",
            "class of security"
        ], [1, 0]);

        const categoryOfPerson = getField(cols, headerMap, [
            "categoryofperson",
            "category of person",
            "category",
            "person category"
        ], [3]);

        const personName = getField(cols, headerMap, [
            "nameoftheperson",
            "name of the person",
            "name of the signatory",
            "person name",
            "name"
        ], [4]);

        const holdingBefore = getField(cols, headerMap, [
            "securitiesheldpriortoacquisitionordisposalnumberofsecurity",
            "securities held prior to acquisition / disposal",
            "holding before",
            "holdings before"
        ], [6]);

        const holdingBeforePercent = getField(cols, headerMap, [
            "securitiesheldpriortoacquisitionordisposalpercentageofshareholding",
            "holding before %",
            "holding before percentage",
            "holding before percent"
        ], [7]);

        const quantity = getField(cols, headerMap, [
            "securitiesacquiredordisposednumberofsecurity",
            "quantity",
            "no of shares acquired/disposed",
            "no. of shares acquired/disposed",
            "qty"
        ], [8]);

        const value = getField(cols, headerMap, [
            "securitiesacquiredordisposedvalueofsecurity",
            "value",
            "transaction value",
            "value of transaction",
            "consideration value"
        ], [9]);

        const transactionType = getField(cols, headerMap, [
            "securitiesacquiredordisposedtransactiontype",
            "transaction type",
            "type of transaction",
            "nature of transaction",
            "trade type"
        ], [10]);

        const holdingAfter = getField(cols, headerMap, [
            "securitiesheldpostacquistionordisposalnumberofsecurity",
            "securitiesheldpostacquisitionordisposalnumberofsecurity",
            "holding after",
            "holdings after"
        ], [11]);

        const holdingAfterPercent = getField(cols, headerMap, [
            "securitiesheldpostacquistionordisposalpercentageofshareholding",
            "securitiesheldpostacquisitionordisposalpercentageofshareholding",
            "holding after %",
            "holding after percentage",
            "holding after percent"
        ], [12]);

        const transactionDate = getField(cols, headerMap, [
            "dateofallotmentadviceoracquisitionofsharesorsaleofsharesspecifyfromdate",
            "dateofallotmentadviceoracquisitionofsharesorsaleofsharesspecifytodate",
            "transaction date",
            "date of transaction",
            "date"
        ], [13, 14]);

        const modeOfAcquisitionOrDisposal = getField(cols, headerMap, [
            "modeofacquisitionordisposal",
            "mode of acquisition / disposal",
            "mode of acquisition/disposal",
            "mode",
            "acquisition disposal mode"
        ], [15]);

        const intimationDate = getField(cols, headerMap, [
            "dateofintimationtocompany",
            "date of intimation"
        ], [16]);

        const notes = getField(cols, headerMap, [
            "exchangeonwhichthetradewasexecuted",
            "notes",
            "remarks",
            "other information"
        ], [23, 24]);

        const transaction = {
            symbol,
            companyName: context.companyName || "",
            personName,
            designation,
            categoryOfPerson,
            instrument,
            transactionType,
            quantity,
            value,
            holdingBefore,
            holdingBeforePercent,
            holdingAfter,
            holdingAfterPercent,
            transactionDate,
            modeOfAcquisitionOrDisposal,
            intimationDate,
            broadcastDate: context.broadcastDateTime || "",
            filingUrl: context.filingUrl || "",
            notes
        };

        // filter transactions by instrument, transaction type, mode, or date.
        if (!isAllowedInstrument(transaction.instrument)) return;
        if (!isAllowedTransactionType(transaction.transactionType)) return;
        if (!isAllowedMode(transaction.modeOfAcquisitionOrDisposal)) return;
        if (!isWithinAllowedDateRange(transaction.transactionDate)) return;

        const quantityValue = parseNumeric(transaction.quantity);
        const valueValue = parseNumeric(transaction.value);

        transaction.avgPrice = quantityValue ? (valueValue / quantityValue).toFixed(2) : "";
        

        transactions.push(transaction);

    });

    return transactions;
}