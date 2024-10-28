const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Accenture.csv"),
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

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  let globalCounter = 0;
  let currentPage = startPage;

  // List of titles to exclude
  const excludeTitles = [
    "Join Our Team",
    "Keep Up to Date",
    "Job Alert Emails",
  ];

  try {
    while (true) {
      if (endPage && currentPage > endPage) {
        console.log(`Reached defined end page: ${endPage}. Stopping.`);
        break;
      }

      const pageUrl = `${baseUrl}&pg=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      const jobs = await page.evaluate(
        (data) => {
          const { excludeTitles, currentPage } = data;
          const jobElements = document.querySelectorAll(".cmp-teaser.card");
          return Array.from(jobElements)
            .map((job) => {
              // Get the job title first to check if it should be excluded
              const title =
                job.querySelector(".cmp-teaser__title")?.textContent.trim() ||
                "";

              // Skip if title is in exclude list
              if (excludeTitles.includes(title)) {
                return null;
              }

              // Get location components
              const city =
                job.querySelector(".cmp-teaser-city")?.textContent.trim() || "";

              // Get the skill (function) from the specific element
              const skillElement = job.querySelector(
                ".cmp-teaser__job-listing-semibold.skill"
              );
              const function_ = skillElement
                ? skillElement.textContent.trim()
                : "";

              // Get description, removing any extra whitespace and newlines
              const description =
                job
                  .querySelector(".cmp-teaser__job-listing .description")
                  ?.textContent.trim()
                  .replace(/\s+/g, " ") || "";

              return {
                sno: null, // to be set later
                company: "Accenture",
                jobId:
                  job
                    .querySelector(".cmp-teaser__save-job-card")
                    ?.getAttribute("data-job-id") || "",
                function: function_,
                location: city, // Only showing city name without "India -"
                title: title,
                description: description,
                postedOn:
                  job
                    .querySelector(".cmp-teaser__job-listing-posted-date")
                    ?.textContent.trim() || "",
                page: currentPage,
              };
            })
            .filter((job) => job !== null); // Remove null entries (excluded jobs)
        },
        { excludeTitles, currentPage }
      ); // Pass both values as an object

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
      console.log(`Scraped Jobs from Accenture Page ${currentPage}`);
      currentPage += 1;

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }

  console.log(`Accenture scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
