const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Schneider_Electric.csv"),
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
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-http2"],
  });
  const page = await browser.newPage();
  let globalCounter = 0;

  try {
    let currentPage = startPage;

    while (true) {
      console.log(`Scraping page ${currentPage}...`);
      const pageUrl = `${baseUrl}&page=${currentPage}`;

      try {
        await gotoWithRetry(page, pageUrl, {
          waitUntil: "networkidle0",
          timeout: 60000,
        });
      } catch (error) {
        console.error(`Failed to scrape ${pageUrl}: ${error.message}`);
        break; // Stop scraping on failure
      }

      const jobs = await page.evaluate((pageNum) => {
        const jobListings = document.querySelectorAll(
          "mat-expansion-panel-header"
        );
        return Array.from(jobListings).map((listing) => {
          const titleElement = listing.querySelector(".job-title-link span");
          const jobIdElement = listing.querySelector(".req-id span");
          const locationElement = listing.querySelector(
            ".job-result-label[itemprop='location'] + .label-value"
          );
          const companyName = "Schneider Electric"; // Fixed company name

          return {
            company: companyName,
            jobId: jobIdElement ? jobIdElement.textContent.trim() : "",
            function: "", // Placeholder for future implementation
            location: locationElement ? locationElement.textContent.trim() : "",
            title: titleElement ? titleElement.textContent.trim() : "",
            description: "", // Will be populated later
            postedOn: new Date().toISOString().split("T")[0],
            page: pageNum,
          };
        });
      }, currentPage);

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        break;
      }

      // Fetch descriptions
      for (let i = 0; i < jobs.length; i++) {
        try {
          const jobDetailUrl = await page.evaluate((index) => {
            const link = document.querySelectorAll(".job-title-link")[index];
            return link ? link.href : null;
          }, i);

          if (jobDetailUrl) {
            const newPage = await browser.newPage();
            await gotoWithRetry(newPage, jobDetailUrl, {
              waitUntil: "networkidle0",
            });
            jobs[i].description = await newPage
              .$eval(".description-container", (el) => el.textContent.trim())
              .catch(() => "Description not available");
            await newPage.close();
          }
        } catch (error) {
          console.error(`Error getting job description: ${error.message}`);
          jobs[i].description = "Error fetching description";
        }
      }

      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(`Scraped ${jobs.length} jobs from page ${currentPage}`);
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 2000 + 1000)
      ); // Randomized delay

      currentPage++;
    }
  } catch (error) {
    console.error(`Error scraping jobs: ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete. Total jobs scraped: ${globalCounter}`);
}

module.exports = { scrapeJobs };
