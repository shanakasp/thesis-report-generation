const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

// Helper function for delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  let globalCounter = 0;

  try {
    // Navigate to the initial page
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    let currentPage = startPage || 1;

    // Function to get total number of pages
    const getTotalPages = async () => {
      try {
        await page.waitForSelector('nav[aria-label="Page selection"]', {
          timeout: 10000,
        });
        const lastPageButton = await page.$(
          'button[data-test-id]:not([data-test-id="next-page"]):last-of-type'
        );
        if (lastPageButton) {
          const lastPage = await page.evaluate(
            (button) => parseInt(button.getAttribute("data-test-id")),
            lastPageButton
          );
          return lastPage;
        }
        return 1;
      } catch (error) {
        console.error("Error getting total pages:", error);
        return 1;
      }
    };

    // Improved function to navigate to the next page
    const goToNextPage = async () => {
      try {
        // Wait for the next page button
        const nextButton = await page.$('button[data-test-id="next-page"]');
        const isDisabled = await nextButton.evaluate((btn) =>
          btn.hasAttribute("disabled")
        );

        if (isDisabled) return false;

        await Promise.all([
          nextButton.click(),
          page.waitForNavigation({ waitUntil: "networkidle0" }),
        ]);
        await delay(2000);
        return true;
      } catch (error) {
        console.error("Error navigating to next page:", error);
        return false;
      }
    };

    const totalPages = await getTotalPages();
    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;

    console.log(`Total pages to scrape: ${effectiveEndPage}`);

    while (currentPage <= effectiveEndPage) {
      console.log(`Scraping page ${currentPage}...`);

      // Wait for job listings to load
      await page.waitForSelector('li div[role="button"]', { timeout: 10000 });

      // Scrape jobs from the current page
      const jobs = await page.evaluate((pageNum) => {
        const cleanLocation = (location) => {
          if (!location) return "";
          const parts = location.split(",");
          return parts.length === 0 ? location.trim() : parts[0].trim();
        };

        const jobElements = document.querySelectorAll('li div[role="button"]');
        const jobDetails = [];

        jobElements.forEach((jobElement) => {
          try {
            const titleElement = jobElement.querySelector("h3 a");
            if (!titleElement) return;

            const jobUrl = titleElement.href;
            const jobId = jobUrl.split("/jobs/")[1];

            const locationElement = jobElement.querySelector(
              ".metadatum-module_text__ncKFr"
            );
            const fullLocation = locationElement
              ? locationElement.textContent.trim()
              : "";
            const cleanedLocation = cleanLocation(fullLocation);

            const dateElements = Array.from(
              jobElement.querySelectorAll(".metadatum-module_text__ncKFr")
            );
            const dateText =
              dateElements.length > 1
                ? dateElements[1].textContent.replace("Updated:", "").trim()
                : "";

            const descriptionElement = jobElement.querySelector(
              ".job-card-module_content__8sS0J"
            );
            const description = descriptionElement
              ? descriptionElement.textContent.trim()
              : "";

            if (jobId && titleElement.textContent) {
              jobDetails.push({
                sno: null,
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
      console.log(
        `Scraped ${jobs.length} jobs from Amazon page ${currentPage}`
      );

      // Move to next page if not on last page
      if (currentPage < effectiveEndPage) {
        const nextPageSuccess = await goToNextPage();
        if (!nextPageSuccess) {
          console.log("Could not navigate to next page. Stopping.");
          break;
        }
      }

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
