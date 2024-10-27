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

// Function to construct the correct URL based on page number
function constructUrl(baseUrl, pageNum) {
  const url = new URL(baseUrl);
  url.searchParams.set("pg", pageNum.toString());
  return url.toString();
}

// New function to detect the last available page
async function detectLastPage(page, baseUrl) {
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    console.log(`Checking page ${currentPage}...`);
    const pageUrl = constructUrl(baseUrl, currentPage);

    await page.goto(pageUrl, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Wait for job listings or "no results" indicator
    await Promise.race([
      page.waitForSelector(".cmp-teaser__content", { timeout: 30000 }),
      page.waitForSelector(".no-results", { timeout: 30000 }),
    ]);

    // Check if there are any job listings on the page
    const hasJobs = await page.evaluate(() => {
      const jobs = document.querySelectorAll(".cmp-teaser__content");
      const noResults = document.querySelector(".no-results");
      return jobs.length > 0 && !noResults;
    });

    if (!hasJobs) {
      console.log(`No more jobs found after page ${currentPage - 1}`);
      return currentPage - 1;
    }

    currentPage++;
    await delay(2000); // Prevent rate limiting
  }
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

    // If endPage is blank or invalid, detect the last available page
    if (!endPage || endPage <= 0) {
      console.log("No end page specified. Detecting last available page...");
      endPage = await detectLastPage(page, baseUrl);
      console.log(`Last available page detected: ${endPage}`);
    }

    // If startPage is blank or invalid, set it to 1
    if (!startPage || startPage <= 0) {
      console.log("No start page specified. Starting from page 1");
      startPage = 1;
    }

    // Loop through all pages
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      console.log(`Scraping page ${currentPage} of ${endPage}...`);

      const pageUrl = constructUrl(baseUrl, currentPage);
      console.log(`Accessing URL: ${pageUrl}`);

      await page.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Check if page has jobs
      const hasJobs = await page.evaluate(() => {
        const jobs = document.querySelectorAll(".cmp-teaser__content");
        return jobs.length > 0;
      });

      if (!hasJobs) {
        console.log(`No jobs found on page ${currentPage}. Stopping scraping.`);
        break;
      }

      await page.waitForSelector(".cmp-teaser__content", { timeout: 60000 });
      await delay(2000);

      const pageJobs = await page.evaluate(
        (globalCounter, currentPage) => {
          const jobElements = document.querySelectorAll(".cmp-teaser__content");
          return Array.from(jobElements).map((job, index) => {
            const city =
              job.querySelector(".cmp-teaser-city")?.textContent.trim() || "";
            const region =
              job.querySelector(".cmp-teaser-region")?.textContent.trim() || "";
            const location = `${region} - ${city}`.trim();
            const saveJobCard = job.querySelector(".cmp-teaser__save-job-card");
            const jobId = saveJobCard?.getAttribute("data-job-id") || "";
            const businessArea =
              job.querySelector(".business-area")?.textContent.trim() || "";
            const title =
              job.querySelector(".cmp-teaser__title")?.textContent.trim() || "";
            const description =
              job
                .querySelector(".cmp-teaser__job-listing .description")
                ?.textContent.trim() || "";
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

      await delay(3000);
      console.log(
        `Completed page ${currentPage}. Found ${pageJobs.length} jobs on this page.`
      );
    }

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
    const inputData = await readInputCSV();

    if (!inputData || inputData.length === 0) {
      throw new Error("No data found in input.csv file");
    }

    let totalJobs = 0;

    for (const row of inputData) {
      const startPage = row.start_page ? parseInt(row.start_page) : null;
      const endPage = row.end_page ? parseInt(row.end_page) : null;

      console.log(`Processing URL: ${row.base_url}`);
      console.log(`Page range: ${startPage || "auto"} to ${endPage || "auto"}`);

      const jobsCount = await scrapeAccentureJobs(
        row.base_url,
        startPage,
        endPage
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
