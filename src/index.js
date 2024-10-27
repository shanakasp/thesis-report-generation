const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const csv = require("csv-parser");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to read input CSV file with correct path
async function readInputCSV() {
  const inputPath = path.join(__dirname, "input.csv");
  return new Promise((resolve, reject) => {
    const results = [];
    fsSync
      .createReadStream(inputPath)
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
}

async function scrapeAccentureJobs(baseUrl, startPage, endPage) {
  // Create output directory if it doesn't exist
  const outputDir = path.join(__dirname, "output");
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Accenture.csv"),
    header: [
      { id: "sno", title: "S.No." },
      { id: "company", title: "Company" },
      { id: "jobId", title: "Job ID" },
      { id: "function", title: "Function" },
      { id: "location", title: "Location" },
      { id: "title", title: "Title" },
      { id: "description", title: "Description" },
      { id: "postedOn", title: "Posted On" },
      { id: "page", title: "Page Number" },
    ],
  });

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      defaultViewport: { width: 1920, height: 1080 },
    });
    const page = await browser.newPage();
    let allJobs = [];
    let globalCounter = 0;

    // Loop through all pages
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      console.log(`Scraping page ${currentPage}...`);

      // Construct URL with page number
      const pageUrl = baseUrl.replace(/pg=\d+/, `pg=${currentPage}`);

      // Navigate to the page
      await page.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Wait for job listings to load
      await page.waitForSelector(".cmp-teaser__content", { timeout: 60000 });

      // Add a small delay to ensure content is fully loaded
      await delay(2000);

      // Extract job data
      const pageJobs = await page.evaluate(
        (globalCounter, currentPage) => {
          const jobElements = document.querySelectorAll(".cmp-teaser__content");
          return Array.from(jobElements).map((job, index) => {
            // Get location details
            const city =
              job.querySelector(".cmp-teaser-city")?.textContent.trim() || "";
            const region =
              job.querySelector(".cmp-teaser-region")?.textContent.trim() || "";
            const location = `${region} - ${city}`.trim();

            // Get job ID from save-job-card data attribute
            const saveJobCard = job.querySelector(".cmp-teaser__save-job-card");
            const jobId = saveJobCard?.getAttribute("data-job-id") || "";

            // Get function/business area
            const businessArea =
              job.querySelector(".business-area")?.textContent.trim() || "";

            // Get job title
            const title =
              job.querySelector(".cmp-teaser__title")?.textContent.trim() || "";

            // Get description
            const description =
              job
                .querySelector(".cmp-teaser__job-listing .description")
                ?.textContent.trim() || "";

            // Get posted date
            const postedOn =
              job
                .querySelector(".cmp-teaser__job-listing-posted-date")
                ?.textContent.trim() || "";

            return {
              sno: globalCounter + index + 1,
              company: "Accenture",
              jobId: jobId,
              function: businessArea,
              location: location,
              title: title,
              description: description,
              postedOn: postedOn,
              page: currentPage,
            };
          });
        },
        globalCounter,
        currentPage
      );

      allJobs = allJobs.concat(pageJobs);
      globalCounter += pageJobs.length;

      // Add delay between pages to avoid rate limiting
      await delay(3000);

      // Log progress
      console.log(
        `Completed page ${currentPage}. Found ${pageJobs.length} jobs on this page.`
      );
    }

    // Write all jobs to CSV
    await csvWriter.writeRecords(allJobs);
    console.log(
      `CSV file has been created successfully with ${allJobs.length} jobs`
    );

    await browser.close();
    return allJobs.length;
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  }
}

async function main() {
  try {
    // Read input CSV
    const inputData = await readInputCSV();

    if (!inputData || inputData.length === 0) {
      throw new Error("No data found in input.csv file");
    }

    let totalJobs = 0;

    // Process each row in input CSV
    for (const row of inputData) {
      console.log(
        `Processing URL: ${row.base_url} from page ${row.start_page} to ${row.end_page}`
      );

      const jobsCount = await scrapeAccentureJobs(
        row.base_url,
        parseInt(row.start_page),
        parseInt(row.end_page)
      );

      totalJobs += jobsCount;
    }

    console.log(`Scraping completed. Total jobs scraped: ${totalJobs}`);
  } catch (error) {
    console.error("Error in main execution:", error);
    process.exit(1);
  }
}

// Run the scraper
main();
