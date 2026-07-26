import { getSupabaseClient } from "./supabaseService.js";
import { parseShareholdingXML } from "./shareholdingParser.js";

export async function repairMissingShareholding() {

    const supabase = getSupabaseClient();

    // Get records to repair
const { data: missing, error } = await supabase
    .from("shareholding_filings")
    .select("*")
    .or("isin.is.null,isin.eq.");


    if (error) {
        throw error;
    }

    console.log(`Found ${missing.length} missing shareholding records`);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    for (const filing of missing) {

        try {

            console.log(
                `Processing ${filing.symbol} ${filing.report_date}`
            );

            const xbrlUrl = filing.xbrl_url?.trim();

            // Skip invalid URLs
            if (
                !xbrlUrl ||
                xbrlUrl.endsWith("/-")
            ) {
                console.log(
                    "Skipping invalid XBRL URL:",
                    filing.symbol,
                    xbrlUrl
                );

                skipped++;
                continue;
            }

            let parsed;

            try {

                parsed = await parseShareholdingXML(xbrlUrl);

            } catch (parserError) {

                console.log(
                    "Parser error:",
                    filing.symbol,
                    parserError.message
                );

                failed++;
                continue;
            }

            if (!parsed) {

                console.log(
                    "Parser returned empty:",
                    filing.symbol
                );

                failed++;
                continue;
            }

            const summary = {

                symbol: parsed.symbol || filing.symbol,

                report_date: parsed.reportDate || filing.report_date,

                company_name: parsed.companyName || filing.company_name,

                isin: parsed.isin || filing.isin,

                promoter_pct:
                    parsed.promoterPct ?? filing.promoter_pct,

                public_pct:
                    parsed.publicPct ?? filing.public_pct,

                fii_pct:
                    parsed.fiiPct ?? null,

                dii_pct:
                    parsed.diiPct ?? null,

                bank_pct:
                    parsed.bankPct ?? null,

                aif_pct:
                    parsed.aifPct ?? null,

                nri_pct:
                    parsed.nriPct ?? null,

                bodies_corporate_pct:
                    parsed.bodiesCorporatePct ?? null,

                retail_below_2l_pct:
                    parsed.retailBelow2L ?? null,

                retail_above_2l_pct:
                    parsed.retailAbove2L ?? null,

                other_non_institution_pct:
                    parsed.otherNonInstitutionPct ?? null,

                total_shareholding_pct:
                    parsed.totalShareholdingPct ?? null,

                total_shares:
                    parsed.totalShares ?? null,

                total_shareholders:
                    parsed.totalShareholders ?? null
            };

            const { error: insertError } = await supabase
                .from("shareholding_summary")
                .upsert(summary, {
                    onConflict: "symbol,report_date"
                });

            if (insertError) {

                console.log(
                    "Insert failed:",
                    filing.symbol,
                    insertError.message
                );

                failed++;

} else {

    // Update the original filing with corrected values from XML
    const { error: filingError } = await supabase
        .from("shareholding_filings")
        .update({
            symbol: parsed.symbol || filing.symbol,
            company_name: parsed.companyName || filing.company_name,
            isin: parsed.isin || filing.isin
        })
        .eq("id", filing.id);

    if (filingError) {
        console.log(
            "Failed to update filing:",
            filing.symbol,
            filingError.message
        );
    }

    console.log(
        "Inserted:",
        filing.symbol
    );

    success++;
}

        } catch (err) {

            console.log(
                "FAILED:",
                filing.symbol,
                err.message
            );

            failed++;
        }

        // Avoid NSE rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log("\n================================");
    console.log("Repair completed");
    console.log("================================");
    console.log(`Success : ${success}`);
    console.log(`Failed  : ${failed}`);
    console.log(`Skipped : ${skipped}`);
    console.log(`Total   : ${missing.length}`);
    console.log("================================");
}