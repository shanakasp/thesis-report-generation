const express = require("express");
const { readInputCSV, runScraperForCompany } = require("../utils/scraperUtils");

const router = express.Router();

// Function to update base_url based on end_page (if necessary)
function updateBaseUrlForAccenture(companyData) {
  if (companyData.company.toLowerCase() === "accenture") {
    return {
      ...companyData,
      base_url: companyData.base_url.replace(
        /pg=\d+/,
        `pg=${companyData.end_page || 1}`
      ),
    };
  }
  return companyData;
}

// GET endpoint for scraping Deloitte
router.get("/", async (req, res) => {
  try {
    const company = "Deloitte";

    // Read and log input CSV data to verify structure
    const inputData = await readInputCSV();
    console.log("Input Data:", inputData);

    // Find the relevant company data for Deloitte
    const companyData = inputData.find(
      (data) => data.company.toLowerCase() === company.toLowerCase()
    );

    if (!companyData) {
      return res.status(404).json({
        success: false,
        message: `Company ${company} not found in input CSV.`,
      });
    }

    // Update the base_url only for Accenture if necessary
    const updatedCompanyData = updateBaseUrlForAccenture(companyData);

    // Parse start and end pages with fallback handling
    const startPage = updatedCompanyData.start_page
      ? parseInt(updatedCompanyData.start_page, 10)
      : 1; // Fallback to page 1 if start_page is missing
    const endPage = updatedCompanyData.end_page
      ? parseInt(updatedCompanyData.end_page, 10)
      : undefined; // Optional, can be undefined

    console.log(
      `Processing ${updatedCompanyData.company} from page ${startPage} to ${
        endPage || "auto"
      }`
    );

    // Run the scraper asynchronously and wait for it to complete
    await runScraperForCompany(
      company,
      updatedCompanyData.base_url,
      startPage,
      endPage
    );

    console.log(`Scraping completed for ${company}`);

    // Immediately return response to client
    res.json({
      success: true,
      message: `Scraping started for ${company}`,
      details: {
        company: updatedCompanyData.company,
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

// Export the router
module.exports = router;
