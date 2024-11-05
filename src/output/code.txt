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

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  let globalCounter = 0;
  let currentPage = startPage;

  const excludeTitles = [
    "Join Our Team",
    "Keep Up to Date",
    "Job Alert Emails",
  ];

  try {
    console.log(`Processing Accenture from page ${startPage} to ${endPage}`);

    while (true) {
      if (endPage && currentPage > endPage) {
        console.log(`Reached defined end page: ${endPage}. Stopping.`);
        break;
      }

      // Remove any existing pg parameter from baseUrl
      const baseUrlWithoutPg = baseUrl.replace(/&pg=\d+/, "");
      const pageUrl = `${baseUrlWithoutPg}&pg=${currentPage}`;
      console.log(`Navigating to page ${currentPage}: ${pageUrl}`);

      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job cards to be loaded
      await page.waitForSelector(".cmp-teaser.card");

      const jobs = await page.$$eval(
        ".cmp-teaser.card",
        (elements, excludeTitles) => {
          return elements
            .map((element) => {
              const title =
                element
                  .querySelector(".cmp-teaser__title")
                  ?.textContent.trim() || "";

              // Skip if title is in exclude list
              if (excludeTitles.includes(title)) {
                return null;
              }

              // Get posted date from the specific element within this job card
              const postedDateElement = element.querySelector(
                ".cmp-teaser__job-listing-posted-date"
              );
              const postedOn = postedDateElement
                ? postedDateElement.textContent.trim()
                : "";

              return {
                company: "Accenture",
                jobId:
                  element
                    .querySelector(".cmp-teaser__save-job-card")
                    ?.getAttribute("data-job-id") || "",
                function:
                  element
                    .querySelector(".cmp-teaser__job-listing-semibold.skill")
                    ?.textContent.trim() || "",
                location:
                  element
                    .querySelector(".cmp-teaser-city")
                    ?.textContent.trim() || "",
                title: title,
                description:
                  element
                    .querySelector(".cmp-teaser__job-listing .description")
                    ?.textContent.trim()
                    .replace(/\s+/g, " ") || "",
                postedOn: postedOn,
              };
            })
            .filter((job) => job !== null);
        },
        excludeTitles
      );

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        break;
      }

      // Add page number and serial number to each job
      const jobsWithMetadata = jobs.map((job, idx) => ({
        ...job,
        sno: globalCounter + idx + 1,
        page: currentPage,
      }));

      await csvWriter.writeRecords(jobsWithMetadata);

      globalCounter += jobs.length;
      console.log(
        `Scraped ${jobs.length} jobs from Accenture Page ${currentPage}`
      );
      currentPage += 1;

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error("Error during scraping:", error);
    console.error(error.stack);
  } finally {
    await browser.close();
  }

  console.log(`Accenture scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
