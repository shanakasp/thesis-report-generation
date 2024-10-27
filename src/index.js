const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const axios = require("axios");
const cheerio = require("cheerio");

// Paths
const inputCsvPath = path.join(__dirname, "./input.csv");
const outputDir = path.join(__dirname, "./output");

// Function to scrape data for jobs
async function scrapeData(url, startPage = 1, endPage) {
  const results = [];

  // Logic to handle pagination
  for (let page = startPage; endPage === undefined || page <= endPage; page++) {
    const pageUrl = `${url}&pg=${page}`;
    console.log(`Fetching data from: ${pageUrl}`);

    const { data } = await axios.get(pageUrl);
    const $ = cheerio.load(data);

    // Extract job information
    $(".job-listing").each((index, element) => {
      const jobId = $(element).find(".job-id").text().trim(); // Update this selector based on the actual website
      const title = $(element).find(".job-title").text().trim(); // Update this selector based on the actual website
      const location = $(element).find(".job-location").text().trim(); // Update this selector based on the actual website
      const description = $(element).find(".job-description").text().trim(); // Update this selector based on the actual website
      const postedOn = $(element).find(".posted-on").text().trim(); // Update this selector based on the actual website
      const jobFunction = $(element).find(".job-function").text().trim(); // Update this selector based on the actual website
      const company = "Accenture"; // Company name from input CSV

      results.push({
        sNo: results.length + 1,
        jobId: jobId || "",
        function: jobFunction || "",
        location: location || "",
        title: title || "",
        description: description || "",
        postedOn: postedOn || "",
        company: company || "",
      });
    });
  }

  return results;
}

// Function to process the input CSV and trigger scraping
async function processInput() {
  fs.createReadStream(inputCsvPath)
    .pipe(csv())
    .on("data", async (row) => {
      const {
        "Company Name": companyName,
        URL: url,
        "Start Page": startPage,
        "End Page": endPage,
      } = row;
      const start = startPage ? parseInt(startPage, 10) : 1;
      const end = endPage ? parseInt(endPage, 10) : undefined;

      // Scrape data and write to CSV
      const data = await scrapeData(url, start, end);
      const csvWriter = createCsvWriter({
        path: path.join(outputDir, `${companyName}_Jobs.csv`),
        header: [
          { id: "sNo", title: "S.No." },
          { id: "jobId", title: "Job ID" },
          { id: "function", title: "Function" },
          { id: "location", title: "Location" },
          { id: "title", title: "Title" },
          { id: "description", title: "Description" },
          { id: "postedOn", title: "Posted On" },
          { id: "company", title: "Company" },
        ],
      });

      await csvWriter.writeRecords(data);
      console.log(`Data for ${companyName} saved to ${companyName}_Jobs.csv`);
    })
    .on("end", () => {
      console.log("CSV file successfully processed.");
    });
}

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

// Start processing the input CSV
processInput();
