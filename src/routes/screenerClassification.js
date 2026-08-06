import express from "express";
import { runClassificationSync } from "../services/screenerClassificationService.js";

const router = express.Router();

router.post("/sync", async (req, res) => {
  try {
    const limit = Number(req.body?.limit ?? req.query.limit ?? 100);

    await runClassificationSync(limit);

    res.json({
      success: true,
      message: "Screener classification sync completed.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;