const express = require("express");
const { readInputCSV, runScraperForCompany } = require("../utils/scraperUtils");
const router = express.Router();

// GET endpoint for scraping Amazon
router.get("/", async (req, res) => {
  try {
    const company = "Amazon";

    // Read and log input CSV data to verify structure
    const inputData = await readInputCSV();
    console.log("Input Data:", inputData);

    // Find the relevant company data for Amazon
    const companyData = inputData.find(
      (data) => data.company.toLowerCase() === company.toLowerCase()
    );

    if (!companyData) {
      return res.status(404).json({
        success: false,
        message: `Company ${company} not found in input CSV.`,
      });
    }

    // Parse start page and end page with fallback handling
    const startPage = companyData.start_page
      ? parseInt(companyData.start_page, 10)
      : 1;
    const endPage = companyData.end_page
      ? parseInt(companyData.end_page, 10)
      : undefined;

    console.log(
      `Processing ${companyData.company} from page ${startPage} to ${
        endPage || "auto"
      }`
    );

    // Run the scraper asynchronously
    await runScraperForCompany(
      company,
      companyData.base_url,
      startPage,
      endPage
    );

    console.log(`Scraping completed for ${company}`);

    // Return response to client
    res.json({
      success: true,
      message: `Scraping started for ${company}`,
      details: {
        company: companyData.company,
        startPage,
        endPage: endPage || "auto",
        outputFile: `output/${company}.csv`,
      },
    });
  } catch (error) {
    console.error(`Error: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
