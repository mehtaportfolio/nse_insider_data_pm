import axios from "axios";
import { XMLParser } from "fast-xml-parser";

export async function parseShareholdingXML(xmlUrl) {
    console.log("Downloading XML...");
    console.log(xmlUrl);

    const response = await axios.get(xmlUrl, {
        responseType: "text",
        timeout: 120000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36",
            Referer: "https://www.nseindia.com/",
            Accept: "application/xml,text/xml,*/*",
        },
    });

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
    });

    const parsed = parser.parse(response.data);

    const root = parsed["xbrli:xbrl"];

function getText(field) {

    if (!field) return null;

    if (typeof field === "object" && "#text" in field) {
        return field["#text"];
    }

    return field;
}

    function getContextValue(fieldName, contextRef, multiplyBy100 = false) {
        const field = root[fieldName];

        const rows = Array.isArray(field) ? field : field ? [field] : [];

        const row = rows.find(
            (item) => item && item["@_contextRef"] === contextRef
        );

        if (!row) return null;

        let value = Number(row["#text"]);

        if (isNaN(value)) return null;

        if (multiplyBy100) {
            value = value * 100;
        }

        return Number(value.toFixed(2));
    }

    const result = {
        symbol: getText(root["in-bse-shp:Symbol"]),

        companyName: getText(root["in-bse-shp:NameOfTheCompany"]),

        isin: getText(root["in-bse-shp:ISIN"]),

        reportDate: getText(root["in-bse-shp:DateOfReport"]),

    promoterPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "ShareholdingOfPromoterAndPromoterGroup_ContextI",
        true
    ),

    publicPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "PublicShareholding_ContextI",
        true
    ),

    fiiPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "InstitutionsForeign_ContextI",
        true
    ),

    diiPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "InstitutionsDomestic_ContextI",
        true
    ),

    bankPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "Banks_ContextI",
        true
    ),

    aifPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "AlternativeInvestmentFunds_ContextI",
        true
    ),

    nriPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "NonResidentIndians_ContextI",
        true
    ),

    bodiesCorporatePct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "BodiesCorporate_ContextI",
        true
    ),

    retailBelow2L: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "ResidentIndividualShareholdersHoldingNominalShareCapitalUpToRsTwoLakh_ContextI",
        true
    ),

    retailAbove2L: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "ResidentIndividualShareholdersHoldingNominalShareCapitalInExcessOfRsTwoLakh_ContextI",
        true
    ),

    otherNonInstitutionPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "OtherNonInstitutions_ContextI",
        true
    ),

    totalShareholdingPct: getContextValue(
        "in-bse-shp:ShareholdingAsAPercentageOfTotalNumberOfShares",
        "ShareholdingPattern_ContextI",
        true
    ),

    totalShares: getContextValue(
        "in-bse-shp:NumberOfShares",
        "ShareholdingPattern_ContextI"
    ),

    totalShareholders: getContextValue(
        "in-bse-shp:NumberOfShareholders",
        "ShareholdingPattern_ContextI"
    ),
};

console.log("Parsed XML:", {
    symbol: result.symbol,
    companyName: result.companyName,
    isin: result.isin
});

return result;
}