const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Capgemini.csv"),
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
  const jobsPerPage = 30; // Assuming there are 30 jobs per page
  let currentPage = startPage;

  try {
    while (currentPage <= endPage) {
      const pageUrl = `${baseUrl}&page=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      const jobs = await page.evaluate((pageNum) => {
        const jobElements = document.querySelectorAll(
          ".table-tr.filter-box.tag-active.joblink"
        );
        return Array.from(jobElements).map((job) => ({
          sno: null, // to be set later
          company: "Capgemini",
          jobId: job.getAttribute("href").split("/")[2] || "", // Extract job ID from URL
          function:
            job
              .querySelector("div.table-td:nth-child(1) > div")
              ?.textContent.trim() || "",
          location:
            job
              .querySelector("div.table-td:nth-child(3) > div")
              ?.textContent.trim() || "",
          title:
            job
              .querySelector("div.table-td:nth-child(1) > div")
              ?.textContent.trim() || "",
          description:
            job
              .querySelector("div.table-td:nth-child(4) > div")
              ?.textContent.trim() || "", // Assuming this is where description goes
          postedOn: "", // Set to empty or extract if available
          page: pageNum,
        }));
      }, currentPage);

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        break;
      }

      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;

      // Stop if we have reached the desired number of jobs
      if (globalCounter >= jobsPerPage * (endPage - startPage + 1)) {
        console.log(
          `Fetched ${globalCounter} jobs. Stopping as limit reached.`
        );
        break;
      }

      currentPage += 1;

      await new Promise((resolve) => setTimeout(resolve, 3000)); // Delay to avoid being blocked
    }
  } finally {
    await browser.close();
  }

  console.log(`Capgemini scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
