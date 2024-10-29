const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "SBI.csv"),
    header: [
      { id: "sno", title: "S.No." },
      { id: "company", title: "Company" },
      { id: "jobId", title: "Job ID" },
      { id: "title", title: "Title" },
      { id: "function", title: "Function" },
      { id: "location", title: "Location" },
      { id: "postedOn", title: "Posted On" },
      { id: "description", title: "Description" },
      { id: "page", title: "Page Number" },
    ],
  });

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  let globalCounter = 0;

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const pageUrl = `${baseUrl}?page=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      await page
        .waitForSelector(".job-list-item", { timeout: 10000 })
        .catch(() => null);

      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(".job-list-item");
        return Array.from(jobCards)
          .map((card) => {
            const titleElement = card.querySelector(".job-tile__title");
            const jobIdElement = card.querySelector(".job-list-item__link");
            const functionElement = card.querySelector(
              ".job-list-item__description"
            );
            const locationElement = card.querySelector(
              ".job-list-item__job-info-value"
            );
            const postedDateElement = card.querySelector(
              ".job-list-item__job-info-value-container"
            );

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
              ? postedDateElement
                  .querySelector(".job-list-item__job-info-value")
                  .textContent.trim()
                  .split(" ")[0]
              : "";

            // Split job title and function
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
              page: pageNum,
            };
          })
          .filter((job) => job.title !== ""); // Remove any jobs without a title
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
      console.log(`Scraped Jobs From SBI Page ${currentPage}`);

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

module.exports = { scrapeJobs };
