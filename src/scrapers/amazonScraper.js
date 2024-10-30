const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Amazon.csv"),
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
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  let globalCounter = 0;

  try {
    let currentPage = startPage;

    while (currentPage <= endPage) {
      const offset = (currentPage - 1) * 20;
      const pageUrl = `${baseUrl}&start=${offset}`;
      console.log(`Accessing page ${currentPage}, URL: ${pageUrl}`);

      await page.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      await page
        .waitForSelector('li div[role="button"]', { timeout: 30000 })
        .catch(() => {
          console.log(
            `Timeout waiting for job listings on page ${currentPage}`
          );
          return null;
        });

      const jobs = await page.evaluate((pageNum) => {
        // Helper function to clean location string
        const cleanLocation = (location) => {
          if (!location) return "";

          // Split location by comma and get first part (city)
          const parts = location.split(",");
          if (parts.length === 0) return location.trim();

          // Return just the city name
          return parts[0].trim();
        };

        const jobElements = document.querySelectorAll('li div[role="button"]');
        const jobDetails = [];

        jobElements.forEach((jobElement) => {
          try {
            // Get the job link element
            const titleElement = jobElement.querySelector("h3 a");
            if (!titleElement) return;

            // Extract job ID from href
            const jobUrl = titleElement.href;
            const jobId = jobUrl.split("/jobs/")[1];

            // Get location and clean it
            const locationElement = jobElement.querySelector(
              ".metadatum-module_text__ncKFr"
            );
            const fullLocation = locationElement
              ? locationElement.textContent.trim()
              : "";
            const cleanedLocation = cleanLocation(fullLocation);

            // Get date - looking for the second metadatum element
            const dateElements = Array.from(
              jobElement.querySelectorAll(".metadatum-module_text__ncKFr")
            );
            const dateText =
              dateElements.length > 1
                ? dateElements[1].textContent.replace("Updated:", "").trim()
                : "";

            // Get description
            const descriptionElement = jobElement.querySelector(
              ".job-card-module_content__8sS0J"
            );
            const description = descriptionElement
              ? descriptionElement.textContent.trim()
              : "";

            // Add job only if we have valid data
            if (jobId && titleElement.textContent) {
              jobDetails.push({
                sno: null, // Will be set later
                company: "Amazon",
                jobId: jobId,
                function: description.includes("FireTV")
                  ? "FireTV"
                  : "Program Management",
                location: cleanedLocation,
                title: titleElement.textContent.trim(),
                description: description,
                postedOn: dateText,
                page: pageNum,
              });
            }
          } catch (error) {
            console.error(
              `Error processing job element on page ${pageNum}:`,
              error
            );
          }
        });

        return jobDetails;
      }, currentPage);

      if (jobs && jobs.length > 0) {
        console.log(`Found ${jobs.length} jobs on page ${currentPage}`);

        await csvWriter.writeRecords(
          jobs.map((job, idx) => ({
            ...job,
            sno: globalCounter + idx + 1,
          }))
        );

        globalCounter += jobs.length;
        console.log(
          `Successfully scraped ${jobs.length} jobs from page ${currentPage}`
        );
      } else {
        console.log(
          `No jobs found on page ${currentPage}. Checking if this is the last page...`
        );

        const hasNextPage = await page.evaluate(() => {
          const nextButton = document.querySelector(
            '[data-test-id="next-page"]'
          );
          return nextButton && !nextButton.getAttribute("aria-disabled");
        });

        if (!hasNextPage) {
          console.log("Reached the last page. Stopping scraper.");
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      currentPage++;
    }
  } catch (error) {
    console.error(`Error during scraping: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete. Total jobs scraped: ${globalCounter}`);
}

module.exports = { scrapeJobs };
