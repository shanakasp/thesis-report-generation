const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

// Helper function for delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  // Calculate the starting serial number based on the start page
  const startingSerialNumber = 1; // Now starts from 1 regardless of start page

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
  let globalCounter = startingSerialNumber - 1; // Start counter from starting serial number - 1
  const seenJobIds = new Set(); // Track seen job IDs to avoid duplicates

  try {
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      console.log(`Processing page ${currentPage}...`);
      const pageUrl = `${baseUrl}?page=${currentPage}`;

      // Navigate to the specific page
      await page.goto(pageUrl, { waitUntil: "networkidle0" });
      await page.waitForSelector(".job-list-item", { timeout: 10000 });

      let lastJobCount = 0;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        // Get initial height
        const initialHeight = await page.evaluate(
          () => document.documentElement.scrollHeight
        );

        // Extract current jobs
        const newJobs = await page.evaluate(() => {
          const jobCards = document.querySelectorAll(".job-list-item");
          return Array.from(jobCards).map((card) => {
            const titleElement = card.querySelector(".job-tile__title");
            const jobIdElement = card.querySelector(".job-list-item__link");
            const functionElement = card.querySelector(
              ".job-list-item__description"
            );
            const locationElement = card.querySelector(
              '[data-bind="html: primaryLocation"]'
            );
            const postedDateElement = card
              .querySelector(".job-list-item__job-info-label--posting-date")
              ?.parentElement?.querySelector(".job-list-item__job-info-value");

            const jobTitle = titleElement
              ? titleElement.textContent.trim()
              : "";
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
            const function_text =
              titleParts.length > 1 ? titleParts[1].trim() : "";

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

        // Filter out duplicates and add only new jobs
        const uniqueNewJobs = newJobs.filter(
          (job) => !seenJobIds.has(job.jobId)
        );

        // If we've found 25 jobs or no new jobs after retries, move to next page
        if (
          uniqueNewJobs.length >= 25 ||
          (uniqueNewJobs.length === lastJobCount && uniqueNewJobs.length > 0)
        ) {
          // Add new job IDs to seen set
          uniqueNewJobs.forEach((job) => seenJobIds.add(job.jobId));

          // Write unique new jobs to CSV with sequential numbering
          await csvWriter.writeRecords(
            uniqueNewJobs.map((job, idx) => ({
              ...job,
              sno: globalCounter + idx + 1,
            }))
          );

          globalCounter += uniqueNewJobs.length;
          console.log(
            `Scraped ${uniqueNewJobs.length} jobs from page ${currentPage}. Total: ${globalCounter}`
          );
          break;
        }

        // If no new jobs found, increment retry counter
        if (uniqueNewJobs.length === lastJobCount) {
          retryCount++;
        }

        lastJobCount = uniqueNewJobs.length;

        // Scroll to bottom
        await page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight);
        });

        // Wait for a bit to allow new content to load
        await delay(2000);

        // Get new height after scrolling
        const newHeight = await page.evaluate(
          () => document.documentElement.scrollHeight
        );

        // If height hasn't changed after scrolling, try next page
        if (newHeight === initialHeight) {
          break;
        }
      }

      // Check for end of jobs message
      const isEndOfJobs = await page.evaluate(() => {
        return (
          document.querySelector(".no-results-found") !== null ||
          document.querySelector(".end-of-jobs-message") !== null
        );
      });

      if (isEndOfJobs) {
        console.log("Reached end of available jobs.");
        break;
      }

      // Add delay between pages to avoid rate limiting
      await delay(3000);
    }
  } catch (error) {
    console.error(`Error scraping jobs: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete. Total unique jobs scraped: ${globalCounter}`);
}

module.exports = { scrapeJobs };
