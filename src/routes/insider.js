import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  getTransactions,
  getFilterOptions,
  syncTransactions,
  getStockMasterByName,
} from "../../controllers/insiderController.js";

const router = express.Router();
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use("/", router);

router.get("/health", (req, res) => {
  res.send("NSE Insider Tracker is running...");
});

router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

router.get("/api/transactions", getTransactions);
router.get("/api/filter-options", getFilterOptions);
router.get("/api/stock-master", getStockMasterByName);
router.post("/api/sync", syncTransactions);
router.get("/api/sync", syncTransactions);

const PORT = process.env.PORT || 3000;

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export { app };
export default router;
