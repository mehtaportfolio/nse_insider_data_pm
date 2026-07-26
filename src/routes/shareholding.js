import express from "express";
import { getShareholdingFilings, upsertShareholdingSummary } from "../services/supabaseService.js";
import { parseShareholdingXML } from "../services/shareholdingParser.js";


const router = express.Router();

router.get("/shareholding-test", async (req, res) => {
    try {

        console.log("Fetching shareholding filings from Supabase...");

        const filings = await getShareholdingFilings(1);

        const summary = await parseShareholdingXML(filings[0].xbrl_url);

        await upsertShareholdingSummary(summary);

        res.json(summary);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }
});


export default router;