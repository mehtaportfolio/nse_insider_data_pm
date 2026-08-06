import axios from "axios";
import * as cheerio from "cheerio";

const SYMBOL = "RSWM"; // Change to any stock

async function testScreenerSector() {
  try {
    const url = `https://www.screener.in/company/${SYMBOL}/consolidated/`;

    console.log(`Fetching ${url}`);

    const { data } = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/139.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://www.screener.in/",
      },
      timeout: 30000,
    });

    const $ = cheerio.load(data);

const broadSector = $('a[title="Broad Sector"]').first().text().trim();

const sector = $('a[title="Sector"]').first().text().trim();

const broadIndustry = $('a[title="Broad Industry"]').first().text().trim();

const industry = $('a[title="Industry"]').first().text().trim();

console.log("\n========== Classification ==========");
console.log({
    company: $("h1").first().text().trim(),
    broadSector,
    sector,
    broadIndustry,
    industry
});

    console.log("=================================");
    

  } catch (err) {
    console.error(err.message);
  }
}

testScreenerSector();