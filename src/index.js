const express = require("express");
const { readInputCSV, runScraperForCompany } = require("./utils/scraperUtils");
const cognizantRoute = require("./routes/cognizantRoute");
const deloitteRoute = require("./routes/deloitteRoute");
const accentureRoute = require("./routes/accentureRoute");
const ibmRoute = require("./routes/ibmRoute");
const marriottRoute = require("./routes/marriottRoute");
const capgeminiRoute = require("./routes/capgeminiRoute");
const exlRoute = require("./routes/exlRouter");
const syngeneRoute = require("./routes/syngeneRouter");
const sbiRoute = require("./routes/sbiRouter");
const amazonRoute = require("./routes/amazonRoutes");
const Schneider_ElectricRoute = require("./routes/schneiderElectricRoute");
const app = express();
const port = 3000;

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

// GET endpoint to list all available companies
app.get("/companies", async (req, res) => {
  try {
    const inputData = await readInputCSV();
    const companies = inputData.map((data) => {
      const updatedData = updateBaseUrlForAccenture(data);
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

// Existing Companies
app.use("/scrape/Cognizant", cognizantRoute);

app.use("/scrape/Capgemini", capgeminiRoute);

app.use("/scrape/Accenture", accentureRoute);

app.use("/scrape/Deloitte", deloitteRoute);

app.use("/scrape/IBM", ibmRoute);

app.use("/scrape/marriott", marriottRoute);

app.use("/scrape/exl", exlRoute);

app.use("/scrape/Schneider_Electric", Schneider_ElectricRoute);

app.use("/scrape/syngene", syngeneRoute);

app.use("/scrape/sbiCard", sbiRoute);

app.use("/scrape/amazon", amazonRoute);

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
