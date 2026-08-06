import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const REQUEST_DELAY_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getStocksBatch(limit = 100) {
  const { data, error } = await supabase
    .from("stock_master")
    .select("stock_name, exchange, symbol_token")
    .or(
      "s_broad_sector.is.null,s_sector.is.null,s_broad_industry.is.null,s_industry.is.null"
    )
    .order("stock_name")
    .limit(limit);

  if (error) throw error;

  return data;
}

export async function fetchClassification(stock) {
    const screenerId =
        stock.exchange.toUpperCase() === "BSE"
            ? stock.symbol_token
            : stock.stock_name;

    const url = `https://www.screener.in/company/${screenerId}/consolidated/`;

    console.log(`Fetching ${url}`);

  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
      Referer: "https://www.screener.in/",
    },
    timeout: 30000,
  });

  const $ = cheerio.load(response.data);

  return {
    company: $("h1").first().text().trim(),
    broadSector: $('a[title="Broad Sector"]').first().text().trim(),
    sector: $('a[title="Sector"]').first().text().trim(),
    broadIndustry: $('a[title="Broad Industry"]').first().text().trim(),
    industry: $('a[title="Industry"]').first().text().trim(),
  };
}

export async function updateClassification(stock, classification) {
  const { error } = await supabase
    .from("stock_master")
    .update({
      s_broad_sector: classification.broadSector || null,
      s_sector: classification.sector || null,
      s_broad_industry: classification.broadIndustry || null,
      s_industry: classification.industry || null,
    })
    .eq("stock_name", stock.stock_name)
    .eq("exchange", stock.exchange);

  if (error) throw error;
}

export async function runClassificationSync(limit = 100) {
  console.log("\n====================================");
  console.log("Starting Screener Classification Sync");
  console.log("====================================");

  const stocks = await getStocksBatch(limit);

  console.log(`Found ${stocks.length} stocks\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < stocks.length; i++) {
    const stock = stocks[i];

    console.log(`[${i + 1}/${stocks.length}] ${stock.stock_name}`);

    try {
      const classification = await fetchClassification(stock);

      await updateClassification(stock, classification);

      console.log("✓ Updated");

      success++;
    } catch (err) {
      console.log(`✗ ${err.message}`);
      failed++;
    }

    await delay(REQUEST_DELAY_MS);
  }

  console.log("\n====================================");
  console.log("Classification Sync Completed");
  console.log(`Success : ${success}`);
  console.log(`Failed  : ${failed}`);
  console.log("====================================");
}