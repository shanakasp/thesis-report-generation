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
      { id: "title", title: "Title" },
      { id: "jobId", title: "Job ID" },
      { id: "location", title: "Location" },
      { id: "category", title: "Category" },
      { id: "jobLink", title: "Job Link" },
    ],
  });

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-http2"],
  });
  const page = await browser.newPage();
  let globalCounter = 1;

  try {
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      const pageUrl = `${baseUrl}&page=${currentPage}`;
      console.log(`Processing ${pageUrl}`);

      try {
        await page.goto(pageUrl, {
          waitUntil: "networkidle2",
          timeout: 120000, // Increase the timeout to 120 seconds
        });

        // Wait for job listings to load
        await page.waitForSelector(".mat-expansion-panel", { timeout: 10000 }); // 10 seconds timeout for element load

        // Scrape job details
        const jobs = await page.evaluate(() => {
          return Array.from(
            document.querySelectorAll(".mat-expansion-panel")
          ).map((jobPanel) => {
            const titleElement = jobPanel.querySelector(
              ".job-title .job-title-link"
            );
            const title = titleElement?.innerText.trim() || "N/A";
            const jobIdElement = jobPanel.querySelector(".req-id span");
            const jobId = jobIdElement?.innerText.trim() || "N/A";
            const locationElement = jobPanel.querySelector(
              ".job-result__location .location.label-value"
            );
            const location = locationElement?.innerText.trim() || "N/A";
            const categoryElement = jobPanel.querySelector(
              ".job-result__categories .categories.label-value"
            );
            const category = categoryElement?.innerText.trim() || "N/A";
            const jobLink = titleElement?.href || "N/A";

            return { title, jobId, location, category, jobLink };
          });
        });

        // Map jobs with serial number
        const jobsWithIndex = jobs.map((job) => ({
          sno: globalCounter++,
          ...job,
        }));

        // Write to CSV
        await csvWriter.writeRecords(jobsWithIndex);
        console.log(`Page ${currentPage} scraped successfully`);
      } catch (error) {
        console.error(`Error on page ${currentPage}:`, error);
      }
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
    console.log("Scraping completed.");
  }
}

module.exports = { scrapeJobs };
