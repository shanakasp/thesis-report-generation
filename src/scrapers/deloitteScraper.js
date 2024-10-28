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
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs) {
      const startRow = (currentPage - 1) * 25; // Calculate startrow for Deloitte
      const pageUrl = `${baseUrl}&startrow=${startRow}`; // Construct the page URL with startrow
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Extract job details
      const jobs = await page.evaluate(async (pageNum) => {
        const jobElements = document.querySelectorAll("tr.data-row");
        const jobDetails = [];

        for (const job of jobElements) {
          const titleElement = job.querySelector(".jobTitle-link");
          const locationElement = job.querySelector(".jobLocation");
          const postedDateElement = job.querySelector(".jobDate");

          if (titleElement) {
            const jobLink = titleElement.href;
            const postedOn = postedDateElement
              ? postedDateElement.textContent.trim()
              : "";

            // Navigate to job detail page to extract additional details
            const jobDetailPage = await fetch(jobLink);
            const jobDetailHtml = await jobDetailPage.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(jobDetailHtml, "text/html");

            // Extracting Job ID
            const jobIdElement = doc.querySelector(
              ".joblayouttoken .rtltextaligneligible[data-careersite-propertyid='adcode']"
            );
            const jobId = jobIdElement ? jobIdElement.textContent.trim() : "";

            // Extracting Job Title and Description
            const jobTitleElement = doc.querySelector(
              "div.col-xs-12.fontalign-left h1 span[data-careersite-propertyid='title']"
            );
            const fullJobTitle = jobTitleElement
              ? jobTitleElement.textContent.trim()
              : "";

            // Split the job title into title and description
            const [title, ...descriptionParts] = fullJobTitle.split(" - "); // Splitting by ' - ' to get parts
            const description = descriptionParts.join(" - ").trim(); // Join remaining parts for the description

            // Extracting Job Location and cleaning up unwanted parts
            let jobLocation = locationElement
              ? locationElement.textContent.trim()
              : "";
            jobLocation = jobLocation
              .replace(/ - I-Think|-LCP|, IN/g, "")
              .trim(); // Remove unwanted parts

            jobDetails.push({
              sno: null, // to be set later
              company: "Deloitte", // Update as needed
              jobId: jobId,
              function: "", // Adjust if you have a way to extract function
              location: jobLocation,
              title: title, // First part as title
              description: description, // Remaining parts as description
              postedOn: postedOn,
              page: pageNum,
            });
          }
        }
        return jobDetails;
      }, currentPage);

      // If no jobs are found, stop the loop (end of available pages)
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
      console.log(`Scraped Jobs From Deloitte Page ${currentPage}`);
      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Increment currentPage to continue to the next page
      currentPage++;
    }
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
