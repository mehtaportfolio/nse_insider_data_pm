import express from "express";
import { syncScreenerShareholding } from "../services/screenerSyncService.js";

const router = express.Router();

let syncRunning = false;

router.get("/screener-sync", async (req, res) => {

    if (req.query.key !== process.env.SYNC_SECRET) {

        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });

    }



try {

if (syncRunning) {

    return res.status(409).json({
        success: false,
        message: "Sync already running"
    });

}

syncRunning = true;

        console.log("======================================");
        console.log("Starting Screener Sync");
        console.log("======================================");

        const result = await syncScreenerShareholding();

       console.log("======================================");
console.log("Screener Sync Completed");
console.log(result);
console.log("======================================");

        res.json({
            success: true,
            ...result
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

finally {

    syncRunning = false;

}

});

export default router;