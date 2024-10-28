const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Marriott.csv"),
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

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const pageUrl = `${baseUrl}&page=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job listings to load
      await page
        .waitForSelector(".results-list__item", { timeout: 10000 })
        .catch(() => null);

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobListings = document.querySelectorAll(".results-list__item");
        return Array.from(jobListings).map((listing) => {
          const titleElement = listing.querySelector(
            ".results-list__item-title span:first-child"
          );
          const jobIdElement = listing.querySelector(".reference");
          const locationElement = listing.querySelector(
            ".results-list__item-street--label"
          );
          const companyElement = listing.querySelector(
            ".results-list__item-ownership--label"
          );
          const hotelElement = listing.querySelector(
            ".results-list__item-location--label"
          );

          return {
            company: companyElement
              ? companyElement.textContent.trim()
              : "Marriott",
            jobId: jobIdElement ? jobIdElement.textContent.trim() : "",
            function: "", // Function field is not available in the listing
            location:
              locationElement && hotelElement
                ? `${locationElement.textContent.trim()} - ${hotelElement.textContent.trim()}`
                : "",
            title: titleElement ? titleElement.textContent.trim() : "",
            description: "", // Will be populated later
            postedOn: new Date().toISOString().split("T")[0], // Current date as posting date
            page: pageNum,
          };
        });
      }, currentPage);

      // If no jobs are found, stop the loop
      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Get detailed description for each job
      for (let i = 0; i < jobs.length; i++) {
        try {
          const jobDetailUrl = await page.evaluate((index) => {
            const link = document.querySelectorAll(".results-list__item-title")[
              index
            ];
            return link ? link.href : null;
          }, i);

          if (jobDetailUrl) {
            const newPage = await browser.newPage();
            await newPage.goto(jobDetailUrl, { waitUntil: "networkidle0" });

            const description = await newPage
              .$eval(".job-description", (el) => el.textContent.trim())
              .catch(() => "Description not available");

            jobs[i].description = description;
            await newPage.close();
          }
        } catch (error) {
          console.error(`Error getting job description: ${error.message}`);
          jobs[i].description = "Error fetching description";
        }
      }

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(`Scraped ${jobs.length} jobs from page ${currentPage}`);

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
