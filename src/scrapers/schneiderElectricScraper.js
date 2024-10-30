const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "SchneiderElectric.csv"),
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
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  let globalCounter = 0;

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      // Construct the page URL
      const pageUrl = baseUrl.replace(/page=\d+/, `page=${currentPage}`);
      console.log(`Accessing URL: ${pageUrl}`);

      // Navigate to the page with extended timeout
      await page.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Wait for the job listings to load
      await page
        .waitForSelector(".jobs-list-item", {
          timeout: 30000,
        })
        .catch(() => {
          console.log("Timeout waiting for job listings");
          return null;
        });

      // Give extra time for dynamic content to load
      await page.waitForTimeout(2000);

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobListings = document.querySelectorAll(".jobs-list-item");
        const jobDetails = [];

        jobListings.forEach((job) => {
          try {
            // Helper function to safely get text content
            const getText = (selector, parent = job) => {
              const element = parent.querySelector(selector);
              return element ? element.textContent.trim() : "";
            };

            // Extract job details using correct selectors
            const title = getText(".job-title");
            const location = getText(".job-location");
            const functionText = getText(".job-function");
            const jobId =
              getText(".job-id") ||
              `SE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const postedDate = getText(".job-posted-date");
            const description = getText(".job-description") || functionText;

            jobDetails.push({
              sno: null, // Will be set later
              company: "Schneider Electric",
              jobId: jobId,
              function: functionText,
              location: location,
              title: title,
              description: description,
              postedOn: postedDate,
              page: pageNum,
            });
          } catch (error) {
            console.error("Error processing job element:", error);
          }
        });

        return jobDetails;
      }, currentPage);

      console.log(`Found ${jobs.length} jobs on page ${currentPage}`);

      // If no jobs are found, stop the loop
      if (jobs.length === 0) {
        // Try to check if there's a "No results found" message
        const noResults = await page.evaluate(() => {
          const noResultsElement = document.querySelector(
            ".no-results-message"
          );
          return noResultsElement ? true : false;
        });

        if (noResults || currentPage > 1) {
          console.log(`No more jobs found on page ${currentPage}. Stopping.`);
          hasMoreJobs = false;
          break;
        }
      }

      // Write data to CSV and update globalCounter
      if (jobs.length > 0) {
        await csvWriter.writeRecords(
          jobs.map((job, idx) => ({
            ...job,
            sno: globalCounter + idx + 1,
          }))
        );

        globalCounter += jobs.length;
        console.log(
          `Successfully scraped ${jobs.length} jobs from page ${currentPage}`
        );
      }

      // Add delay between pages
      await new Promise((resolve) => setTimeout(resolve, 5000));

      currentPage++;
    }
  } catch (error) {
    console.error(`Error scraping jobs: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete. Total jobs scraped: ${globalCounter}`);
}

module.exports = { scrapeJobs };
