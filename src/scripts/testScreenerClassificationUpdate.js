import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Change this to any stock in your stock_master table
const STOCK_NAME = "TCS";

async function testScreenerClassificationUpdate() {
  try {
    // Fetch stock details
    const { data: stock, error } = await supabase
      .from("stock_master")
      .select("stock_name, exchange")
      .eq("stock_name", STOCK_NAME)
      .single();

    if (error) throw error;

    if (!stock) {
      console.log(`Stock ${STOCK_NAME} not found.`);
      return;
    }

    const symbol = stock.stock_name;

    const url = `https://www.screener.in/company/${symbol}/consolidated/`;

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

    const company = $("h1").first().text().trim();

    const broadSector = $('a[title="Broad Sector"]').first().text().trim();
    const sector = $('a[title="Sector"]').first().text().trim();
    const broadIndustry = $('a[title="Broad Industry"]').first().text().trim();
    const industry = $('a[title="Industry"]').first().text().trim();

    console.log("\n========== Classification ==========");
    console.log({
      company,
      broadSector,
      sector,
      broadIndustry,
      industry,
    });

    const { error: updateError } = await supabase
      .from("stock_master")
      .update({
        s_broad_sector: broadSector || null,
        s_sector: sector || null,
        s_broad_industry: broadIndustry || null,
        s_industry: industry || null,
      })
      .eq("stock_name", stock.stock_name)
      .eq("exchange", stock.exchange);

    if (updateError) throw updateError;

    console.log("\n========================================");
    console.log("✓ Database updated successfully");
    console.log("========================================");
    console.log(`Stock            : ${stock.stock_name}`);
    console.log(`Exchange         : ${stock.exchange}`);
    console.log(`Broad Sector     : ${broadSector}`);
    console.log(`Sector           : ${sector}`);
    console.log(`Broad Industry   : ${broadIndustry}`);
    console.log(`Industry         : ${industry}`);
    console.log("========================================");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testScreenerClassificationUpdate();

