const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Cognizant.csv"),
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

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  let globalCounter = 0;
  let currentPage = startPage;

  try {
    while (true) {
      // Stop if endPage is defined and reached
      if (endPage && currentPage > endPage) {
        console.log(`Reached defined end page: ${endPage}. Stopping.`);
        break;
      }

      const pageUrl = `${baseUrl}&pg=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobElements = document.querySelectorAll(".card-job");
        return Array.from(jobElements).map((job) => ({
          sno: null, // to be set later
          company: "Accenture",
          jobId: job.dataset.id || "",
          function:
            job.querySelector(".job-meta").children[1]?.textContent.trim() ||
            "",
          location: `${
            job.querySelector(".job-meta").children[0]?.textContent.trim() || ""
          }`,
          title: job.querySelector(".card-title a")?.textContent.trim() || "",
          description:
            job
              .querySelector(".cmp-teaser__job-listing .description")
              ?.textContent.trim() || "",
          postedOn:
            job
              .querySelector(".cmp-teaser__job-listing-posted-date")
              ?.textContent.trim() || "",
          page: pageNum, // Use the passed `pageNum` argument
        }));
      }, currentPage);

      // If no jobs are found, break the loop (end of available pages)
      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
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
      currentPage += 1;

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } finally {
    await browser.close();
  }

  console.log(`Cognizant scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
