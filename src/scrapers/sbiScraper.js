const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const startingSerialNumber = 1;

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "SBI.csv"),
    header: [
      { id: "sno", title: "S.No." },
      { id: "company", title: "Company" },
      { id: "jobId", title: "Job ID" },
      { id: "function", title: "Function" },
      { id: "location", title: "Location" },
      { id: "title", title: "Title" },
      { id: "description", title: "Description" },
      { id: "postedOn", title: "Posted On" },
    ],
  });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  let globalCounter = startingSerialNumber - 1;
  const seenJobIds = new Set();

  try {
    // Navigate to the initial page
    console.log("Navigating to the jobs page...");
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    await page.waitForSelector(".job-list-item", { timeout: 10000 });

    let lastJobCount = 0;
    let sameCountRetries = 0;
    const maxRetries = 5; // Increased retries
    let isComplete = false;

    while (!isComplete && sameCountRetries < maxRetries) {
      // Scroll multiple times to ensure all content is loaded
      for (let i = 0; i < 3; i++) {
        await autoScroll(page);
        await delay(1500); // Increased delay to allow more time for content to load
      }

      // Extract all jobs currently visible
      const jobs = await extractJobs(page);
      const uniqueNewJobs = jobs.filter((job) => !seenJobIds.has(job.jobId));

      if (uniqueNewJobs.length > 0) {
        // Add new jobs to seen set
        uniqueNewJobs.forEach((job) => seenJobIds.add(job.jobId));

        // Write to CSV
        await csvWriter.writeRecords(
          uniqueNewJobs.map((job, idx) => ({
            ...job,
            sno: globalCounter + idx + 1,
          }))
        );

        globalCounter += uniqueNewJobs.length;
        console.log(
          `Found ${uniqueNewJobs.length} new jobs. Total: ${globalCounter}`
        );

        if (uniqueNewJobs.length === lastJobCount) {
          sameCountRetries++;
        } else {
          sameCountRetries = 0;
        }

        lastJobCount = uniqueNewJobs.length;
      } else {
        sameCountRetries++;
      }

      // Check for end of jobs
      const isEndOfJobs = await checkEndOfJobs(page);
      if (isEndOfJobs) {
        isComplete = true;
      }

      // Additional check for load more button or pagination
      const hasMoreContent = await page.evaluate(() => {
        const loadMoreButton = document.querySelector(".load-more-button");
        const nextPageButton = document.querySelector(
          ".pagination-next:not(.disabled)"
        );
        return !!(loadMoreButton || nextPageButton);
      });

      if (!hasMoreContent && sameCountRetries >= 2) {
        isComplete = true;
      }
    }

    if (globalCounter > 0) {
      console.log("\n=================================");
      console.log("All Jobs scraped! No more jobs available.");
      console.log(`Total jobs scraped: ${globalCounter}`);
      console.log("=================================\n");
    } else {
      console.log("\n=================================");
      console.log(
        "No jobs found. Please check the website or try again later."
      );
      console.log("=================================\n");
    }
  } catch (error) {
    console.error(`Error scraping jobs: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }
}

// Helper function to perform auto-scroll
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  });
}

// Helper function to extract jobs
async function extractJobs(page) {
  return await page.evaluate(() => {
    const jobCards = document.querySelectorAll(".job-list-item");
    return Array.from(jobCards).map((card) => {
      const titleElement = card.querySelector(".job-tile__title");
      const jobIdElement = card.querySelector(".job-list-item__link");
      const functionElement = card.querySelector(".job-list-item__description");
      const locationElement = card.querySelector(
        '[data-bind="html: primaryLocation"]'
      );
      const postedDateElement = card
        .querySelector(".job-list-item__job-info-label--posting-date")
        ?.parentElement?.querySelector(".job-list-item__job-info-value");

      const jobTitle = titleElement ? titleElement.textContent.trim() : "";
      const jobId = jobIdElement
        ? jobIdElement.getAttribute("aria-labelledby")
        : "";
      const jobFunction = functionElement
        ? functionElement.textContent.trim()
        : "";
      const jobLocation = locationElement
        ? locationElement.textContent.trim().replace(", India", "")
        : "";
      const postedDateValue = postedDateElement
        ? postedDateElement.textContent.trim()
        : "";

      const titleParts = jobTitle.split(" - ");
      const title = titleParts[0].trim();
      const function_text = titleParts.length > 1 ? titleParts[1].trim() : "";

      return {
        company: "SBI",
        jobId: jobId,
        title: title,
        function: function_text,
        location: jobLocation,
        postedOn: postedDateValue,
        description: jobFunction,
      };
    });
  });
}

// Helper function to check for end of jobs
async function checkEndOfJobs(page) {
  return await page.evaluate(() => {
    return (
      document.querySelector(".no-results-found") !== null ||
      document.querySelector(".end-of-jobs-message") !== null ||
      document.querySelector(".alert-warning") !== null
    );
  });
}

module.exports = { scrapeJobs };
