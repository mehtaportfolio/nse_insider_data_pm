import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import insiderRoutes from "./routes/insider.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/", insiderRoutes);

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "NSE Insider Data" });
});

app.listen(PORT, () => {
  console.log(`NSE Insider Data server running on http://localhost:${PORT}`);
});
