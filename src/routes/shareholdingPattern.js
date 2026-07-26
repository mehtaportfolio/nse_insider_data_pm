import express from "express";
import {
  getStockSuggestions,
  getShareholdingPattern,
} from "../../controllers/shareholdingPatternController.js";

const router = express.Router();

router.get("/api/stock-suggestions", getStockSuggestions);
router.get("/api/shareholding-pattern", getShareholdingPattern);

export default router;
