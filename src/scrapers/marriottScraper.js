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

      const pageUrl = `${baseUrl}&page_number=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job listings to load
      await page
        .waitForSelector(".results-list__item", { timeout: 10000 })
        .catch(() => null);

      // Extract basic job details from listing page
      const jobs = await page.evaluate((pageNum) => {
        const jobListings = document.querySelectorAll(".results-list__item");
        return Array.from(jobListings).map((listing) => {
          const titleElement = listing.querySelector(
            ".results-list__item-title span:first-child"
          );
          const jobIdElement = listing.querySelector(".reference");
          const companyElement = listing.querySelector(
            ".results-list__item-ownership--label"
          );
          const linkElement = listing.querySelector(
            ".results-list__item-title"
          );

          return {
            company: companyElement
              ? companyElement.textContent.trim()
              : "Marriott",
            jobId: jobIdElement ? jobIdElement.textContent.trim() : "",
            function: "", // Will be populated from detail page
            location: "", // Will be populated from detail page
            title: titleElement ? titleElement.textContent.trim() : "",
            description: "", // Will be populated from detail page
            postedOn: new Date().toISOString().split("T")[0],
            page: pageNum,
            detailUrl: linkElement ? linkElement.href : null,
          };
        });
      }, currentPage);

      // If no jobs are found, stop the loop
      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Get detailed information for each job
      for (let i = 0; i < jobs.length; i++) {
        try {
          if (jobs[i].detailUrl) {
            const newPage = await browser.newPage();
            await newPage.goto(jobs[i].detailUrl, {
              waitUntil: "networkidle0",
            });

            // Extract additional details from the job detail page
            const details = await newPage.evaluate(() => {
              const description =
                document
                  .querySelector(".job-description")
                  ?.textContent.trim() || "";

              // Find the career area (function)
              const functionElement = Array.from(
                document.querySelectorAll(".summary-list-item")
              ).find(
                (item) =>
                  item.querySelector(".summary-label")?.textContent.trim() ===
                  "Career area"
              );
              const function_ =
                functionElement
                  ?.querySelector(".summary-value")
                  ?.textContent.trim() || "";

              // Find the location
              const locationElement = Array.from(
                document.querySelectorAll(".summary-list-item")
              ).find(
                (item) =>
                  item.querySelector(".summary-label")?.textContent.trim() ===
                  "Location(s)"
              );
              const location =
                locationElement
                  ?.querySelector(".summary-value a")
                  ?.textContent.trim() || "";

              return {
                description,
                function: function_,
                location,
              };
            });

            jobs[i].description = details.description;
            jobs[i].function = details.function;
            jobs[i].location = details.location;

            await newPage.close();
          }
        } catch (error) {
          console.error(`Error getting job details: ${error.message}`);
          jobs[i].description = "Error fetching details";
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
      console.log(`Scraped Jobs from Marriott Page ${currentPage}`);

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
