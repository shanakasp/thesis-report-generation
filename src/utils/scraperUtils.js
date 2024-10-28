const fs = require("fs").promises;
const csv = require("csv-parser");
const path = require("path");

async function readInputCSV() {
  const inputPath = path.join(__dirname, "../input.csv");
  return new Promise((resolve, reject) => {
    const results = [];
    require("fs")
      .createReadStream(inputPath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

async function runScraperForCompany(companyName, baseUrl, startPage, endPage) {
  try {
    const scraperPath = path.join(
      __dirname,
      `../scrapers/${companyName.toLowerCase()}Scraper.js`
    );
    const scraper = require(scraperPath);
    await scraper.scrapeJobs(baseUrl, startPage, endPage);
    console.log(`Scraping for ${companyName} completed.`);
  } catch (err) {
    console.error(`Error in scraping for ${companyName}:`, err);
    throw err;
  }
}

module.exports = {
  readInputCSV,
  runScraperForCompany,
};
