const express = require("express");
const { readInputCSV, runScraperForCompany } = require("./utils/scraperUtils");

const app = express();
const port = 3000;

// Function to update base_url based on end_page (for Accenture only)
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
  return companyData; // Return original data for other companies
}

// GET endpoint for scraping a specific company
app.get("/scrape/:company", async (req, res) => {
  try {
    const company = req.params.company;

    // Read and log input CSV data to verify structure
    const inputData = await readInputCSV();
    console.log("Input Data:", inputData);

    // Find the relevant company data
    const companyData = inputData.find(
      (data) => data.company.toLowerCase() === company.toLowerCase()
    );

    if (!companyData) {
      return res.status(404).json({
        success: false,
        message: `Company ${company} not found in input CSV.`,
      });
    }

    // Update the base_url only for Accenture
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

    // Run the scraper asynchronously
    runScraperForCompany(
      company,
      updatedCompanyData.base_url,
      startPage,
      endPage
    )
      .then(() => {
        console.log(`Scraping completed for ${company}`);
      })
      .catch((error) => {
        console.error(`Error scraping ${company}:`, error);
      });

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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// GET endpoint to list all available companies
app.get("/companies", async (req, res) => {
  try {
    const inputData = await readInputCSV();
    const companies = inputData.map((data) => {
      const updatedData = updateBaseUrlForAccenture(data); // Use the same function
      return {
        name: updatedData.company,
        baseUrl: updatedData.base_url,
        startPage: updatedData.start_page || 1,
        endPage: updatedData.end_page || "auto",
      };
    });

    res.json({
      success: true,
      companies,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
