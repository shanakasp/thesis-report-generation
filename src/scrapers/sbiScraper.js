const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeSbiJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Sbi.csv"),
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
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  let globalCounter = 0;

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const pageUrl = `${baseUrl}?page=${currentPage}`; // Adjust URL as necessary
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job cards to load
      await page
        .waitForSelector(".job-listing", { timeout: 10000 })
        .catch(() => null);

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobRows = document.querySelectorAll(".job-listing");
        return Array.from(jobRows).map((row) => {
          const titleElement = row.querySelector(".job-title");
          const jobCodeElement = row.querySelector(".job-id");
          const locationText =
            row.querySelector(".job-location")?.textContent.trim() || "";
          const functionText =
            row.querySelector(".job-function")?.textContent.trim() || "";
          const postedDateText =
            row.querySelector(".posted-date")?.textContent.trim() || "";

          return {
            company: "SBI",
            jobId: jobCodeElement ? jobCodeElement.textContent.trim() : "",
            function: functionText,
            location: locationText,
            title: titleElement ? titleElement.textContent.trim() : "",
            description: functionText, // Adjust based on your needs
            postedOn: postedDateText,
            page: pageNum,
          };
        });
      }, currentPage);

      // If no jobs are found, stop the loop
      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(`Scraped ${jobs.length} jobs from page ${currentPage}`);

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));

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

module.exports = { scrapeSbiJobs };
