import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getTransactions, getFilterOptions, syncTransactions, getStockMasterByName } from "../controllers/insiderController.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.get("/api/transactions", getTransactions);
router.get("/api/filter-options", getFilterOptions);
router.get("/api/stock-master", getStockMasterByName);
router.post("/api/sync", syncTransactions);
router.get("/api/sync", syncTransactions);

export default router;
