const express = require("express");
const { readInputCSV, runScraperForCompany } = require("./utils/scraperUtils");

const app = express();
const port = 3000;

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

    // Parse start and end pages, with better fallback handling
    const startPage =
      companyData.start_page && parseInt(companyData.start_page, 10);
    const endPage = companyData.end_page && parseInt(companyData.end_page, 10);

    if (!startPage) {
      return res.status(400).json({
        success: false,
        message:
          "Start page is missing or invalid in the CSV for this company.",
      });
    }

    console.log(
      `Processing ${companyData.company} from page ${startPage} to ${
        endPage || "auto"
      }`
    );

    // Run the scraper asynchronously
    runScraperForCompany(company, companyData.base_url, startPage, endPage)
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
        company: companyData.company,
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
    const companies = inputData.map((data) => ({
      name: data.company,
      baseUrl: data.base_url,
      startPage: data.start_page || 1,
      endPage: data.end_page || "auto",
    }));

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
