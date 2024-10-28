const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Deloitte.csv"), // Change as per the company
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

  try {
    for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
      const startRow = (currentPage - 1) * 25; // Calculate startrow for Deloitte
      const pageUrl = `${baseUrl}&startrow=${startRow}`; // Construct the page URL with startrow
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobElements = document.querySelectorAll("tr.data-row");
        return Array.from(jobElements).map((job) => {
          const titleElement = job.querySelector(".jobTitle-link");
          const locationElement = job.querySelector(".jobLocation");
          const postedDateElement = job.querySelector(".jobDate");
          const descriptionElement = job.querySelector(".description-selector");

          return {
            sno: null, // to be set later
            company: "Deloitte", // Update as needed
            jobId: titleElement
              ? titleElement.href.split("/").pop().split("/")[0]
              : "",
            function: "", // Adjust if you have a way to extract function
            location: locationElement ? locationElement.textContent.trim() : "",
            title: titleElement ? titleElement.textContent.trim() : "",
            description: descriptionElement
              ? descriptionElement.textContent.trim()
              : "",
            postedOn: postedDateElement
              ? postedDateElement.textContent.trim()
              : "",
            page: pageNum,
          };
        });
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

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
