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

// Detects if the current page has jobs, returning false if no jobs are found
async function pageHasJobs(page) {
  return await page.evaluate(() => {
    const jobs = document.querySelectorAll(".cmp-teaser__content");
    return jobs.length > 0;
  });
}

// Scrapes job data from a given page and saves it immediately to the CSV
async function scrapeAndSavePage(
  page,
  baseUrl,
  currentPage,
  globalCounter,
  csvWriter
) {
  console.log(`Checking page ${currentPage}...`);

  const pageUrl = constructUrl(baseUrl, currentPage);
  await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 60000 });

  const hasJobs = await pageHasJobs(page);
  if (!hasJobs) {
    console.log(`No jobs found on page ${currentPage}. Ending scraping.`);
    return { jobCount: 0, hasMorePages: false };
  }

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

  await csvWriter.writeRecords(pageJobs);
  console.log(`Saved ${pageJobs.length} jobs from page ${currentPage} to CSV.`);

  return { jobCount: pageJobs.length, hasMorePages: true };
}

async function scrapeAccentureJobs(baseUrl, startPage, endPage) {
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

  const browser = await puppeteer.launch({
    headless: "new",
    defaultViewport: { width: 1920, height: 1080 },
  });
  const page = await browser.newPage();
  let globalCounter = 0;
  let currentPage = startPage;
  let hasMorePages = true;

  while (hasMorePages && currentPage <= endPage) {
    const { jobCount, hasMorePages: morePages } = await scrapeAndSavePage(
      page,
      baseUrl,
      currentPage,
      globalCounter,
      csvWriter
    );

    globalCounter += jobCount;
    hasMorePages = morePages;
    currentPage += 1;
    await delay(3000); // Rate limit protection
  }

  console.log(`CSV file created successfully with ${globalCounter} jobs.`);
  await browser.close();
  return globalCounter;
}

async function main() {
  const inputData = await readInputCSV();

  if (!inputData || inputData.length === 0) {
    throw new Error("No data found in input.csv file");
  }

  let totalJobs = 0;

  for (const row of inputData) {
    const startPage = row.start_page ? parseInt(row.start_page) : 1;
    const endPage = row.end_page ? parseInt(row.end_page) : Infinity; // Default to no end if not specified

    console.log(`Processing URL: ${row.base_url}`);
    console.log(
      `Page range: ${startPage} to ${isFinite(endPage) ? endPage : "auto"}`
    );

    const jobsCount = await scrapeAccentureJobs(
      row.base_url,
      startPage,
      endPage
    );
    totalJobs += jobsCount;
  }

  console.log(`Scraping completed. Total jobs scraped: ${totalJobs}`);
}

// Run the scraper
main();
