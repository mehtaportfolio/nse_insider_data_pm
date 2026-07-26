import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cron from "node-cron";


import insiderRoutes from "./src/routes/insider.js";
import shareholdingRoutes from "./src/routes/shareholding.js";
import shareholdingPatternRoutes from "./src/routes/shareholdingPattern.js";
import shareholdingSyncRoutes from "./src/routes/shareholdingSync.js";


import screenerShareholdingRoutes from "./src/routes/screenerShareholding.js";
import screenerSyncRoutes from "./src/routes/screenerSync.js";
import { syncScreenerShareholding } from "./src/services/screenerSyncService.js";
import { syncShareholdingFilingsFromNse } from "./src/services/nseShareService.js";


dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


app.use("/", insiderRoutes);
app.use("/", shareholdingRoutes);
app.use("/", shareholdingPatternRoutes);
app.use("/", shareholdingSyncRoutes);


app.use("/", screenerShareholdingRoutes);
app.use("/", screenerSyncRoutes);

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        service: "NSE Insider Data"
    });
});

let screenerSyncRunning = false;
let shareholdingFilingSyncRunning = false;

cron.schedule("0 2 * * *", async () => {

    if (screenerSyncRunning) {

        console.log("======================================");
        console.log("Screener sync already running.");
        console.log("Skipping this schedule.");
        console.log("======================================");

        return;

    }

    screenerSyncRunning = true;

    console.log("======================================");
    console.log("Starting Scheduled Screener Sync");
    console.log("======================================");

    try {

        const result = await syncScreenerShareholding();

        console.log("======================================");
        console.log("Scheduled Sync Completed");
        console.log(result);
        console.log("======================================");

    } catch (err) {

        console.error("Scheduled Screener Sync Failed");
        console.error(err);

    } finally {

        screenerSyncRunning = false;

    }

});

cron.schedule("0 6 * * *", async () => {

    if (shareholdingFilingSyncRunning) {

        console.log("======================================");
        console.log("Shareholding filing sync already running.");
        console.log("Skipping this schedule.");
        console.log("======================================");

        return;

    }

    shareholdingFilingSyncRunning = true;

    console.log("======================================");
    console.log("Starting Scheduled NSE Shareholding Filing Sync");
    console.log("======================================");

    try {

        const result = await syncShareholdingFilingsFromNse();

        console.log("======================================");
        console.log("Scheduled NSE Filing Sync Completed");
        console.log(result);
        console.log("======================================");

    } catch (err) {

        console.error("Scheduled NSE Filing Sync Failed");
        console.error(err);

    } finally {

        shareholdingFilingSyncRunning = false;

    }

});

console.log("Screener sync cron scheduled: Every day at 2:00 AM");
console.log("Shareholding filing sync cron scheduled: Every day at 6:00 AM");

app.listen(PORT, () => {
  console.log(`NSE Insider Data server running on http://localhost:${PORT}`);
});
