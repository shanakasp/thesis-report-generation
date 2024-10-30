const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

const cleanLocation = (location) => {
  const unwantedPatterns = [
    /\bIN\b/g, // Remove standalone "IN"
    /I-Think/g, // Remove "I-Think"
    /, IN\b/g, // Remove ", IN" if present
    /Â·Â Â Â Â Â Â Â/g, // Remove occurrences of "Â·Â"
    /â€¢ /g, // Remove "â€¢ "
    /Â /g, // Remove isolated "Â "
    /oÂ/g, // Remove "oÂ"
    /,/g,
    /-/g,
  ];

  let cleanedLocation = location;
  unwantedPatterns.forEach((pattern) => {
    cleanedLocation = cleanedLocation.replace(pattern, "").trim();
  });

  return cleanedLocation;
};

const cleanDescription = (description) => {
  const unwantedPatterns = [
    /Â·Â Â Â Â Â Â Â/g, // Remove occurrences of "Â·Â"
    /Â·Â Â Â Â Â Â Â/g, // Remove occurrences of "Â·Â"
    /â€¢ /g, // Remove "â€¢ "
    /Â /g, // Remove isolated "Â "
    /oÂ/g, // Remove "oÂ"
    /Â·Â Â Â Â Â Â Â /g,
  ];

  let cleanedDescription = description;
  unwantedPatterns.forEach((pattern) => {
    cleanedDescription = cleanedDescription.replace(pattern, "").trim();
  });

  return cleanedDescription;
};

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Deloitte.csv"),
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
      const startRow = (currentPage - 1) * 25;
      const pageUrl = `${baseUrl}&startrow=${startRow}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      const jobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll("tr.data-row");
        return Array.from(jobElements).map((job) => ({
          titleLink: job.querySelector(".jobTitle-link").href,
          location: job.querySelector(".jobLocation")?.textContent.trim(),
          postedOn: job.querySelector(".jobDate")?.textContent.trim(),
        }));
      });

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      for (const [index, job] of jobs.entries()) {
        try {
          const jobPage = await browser.newPage();
          await jobPage.goto(job.titleLink, { waitUntil: "domcontentloaded" });

          const jobDetails = await jobPage.evaluate(() => {
            const title = document
              .querySelector("[data-careersite-propertyid='title']")
              ?.textContent.trim();
            const jobId = document
              .querySelector("[data-careersite-propertyid='adcode']")
              ?.textContent.trim();
            const description = document
              .querySelector("[data-careersite-propertyid='description']")
              ?.innerText.trim();
            return { title, jobId, description };
          });

          // Clean location and description before saving
          const cleanedLocation = cleanLocation(job.location);
          const cleanedDescription = cleanDescription(jobDetails.description);

          await csvWriter.writeRecords([
            {
              sno: globalCounter + index + 1,
              company: "Deloitte",
              jobId: jobDetails.jobId,
              function: "",
              location: cleanedLocation,
              title: jobDetails.title,
              description: cleanedDescription,
              postedOn: job.postedOn,
              page: currentPage,
            },
          ]);

          globalCounter++;
          await jobPage.close();
        } catch (error) {
          console.error(`Error scraping job detail: ${error}`);
        }
      }

      console.log(`Scraped Jobs From Deloitte Page ${currentPage}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      currentPage++;
    }
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
