const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

// Helper function for delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const options = new chrome.Options();
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--window-size=1920,1080");

  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  const allJobs = [];

  try {
    async function getTotalPages() {
      try {
        // Wait for the page to load and find the paginator
        await driver.wait(
          until.elementLocated(
            By.css(".mat-paginator-range-label, .pagination")
          ),
          15000
        );

        // Try multiple selector patterns for pagination
        const paginatorElement = await driver.findElement(
          By.css(".mat-paginator-range-label, .pagination, .pager")
        );

        if (paginatorElement) {
          const paginatorText = await paginatorElement.getText();
          // Handle different pagination text formats
          if (paginatorText.includes("of")) {
            const total = parseInt(paginatorText.split("of")[1].trim());
            return Math.ceil(total / 10);
          } else {
            // Count page numbers if available
            const pageNumbers = await driver.findElements(
              By.css(".pagination li, .pager li")
            );
            return pageNumbers.length > 0 ? pageNumbers.length : 1;
          }
        }
        return 1;
      } catch (error) {
        console.error("Error getting total pages:", error);
        return 1;
      }
    }

    async function extractJobDetails(jobUrl, currentPage, index) {
      await driver.executeScript(`window.open('${jobUrl}', '_blank');`);
      const windows = await driver.getAllWindowHandles();
      await driver.switchTo().window(windows[1]);

      try {
        // Wait for job details with multiple possible selectors
        await driver.wait(
          until.elementLocated(
            By.css(
              ".sdl-application-job-details, .job-details, .job-description"
            )
          ),
          15000
        );

        // Extract job title
        const title = await driver
          .findElement(
            By.css(".sdl-application-job-details__job-title, .job-title, h1")
          )
          .getText();

        // Extract Req ID with improved selectors
        let reqId = "";
        try {
          const reqIdElement = await driver.findElement(
            By.css(".sdl-application-job-details__job-field-row, .req-id")
          );
          const reqIdText = await reqIdElement.getText();
          reqId = reqIdText.includes("Req ID:")
            ? reqIdText.split("Req ID:")[1].trim()
            : reqIdText.trim();
        } catch (error) {
          console.log("Could not find Req ID");
        }

        // Extract categories with improved selectors
        let category = "";
        try {
          const categoryElement = await driver.findElement(
            By.css(
              "div[class*='categorie'], div[class*='function'], .job-function"
            )
          );
          category = await categoryElement.getText();
          category = category.replace("Categorie(s):", "").trim();
        } catch (error) {
          console.log("Could not find category");
        }

        // Extract locations with improved handling
        let locations = [];
        try {
          const locationElements = await driver.findElements(
            By.css(
              ".sdl-application-job-details__job-location, .location, .job-location"
            )
          );

          for (const elem of locationElements) {
            const locText = await elem.getText();
            if (locText.trim()) {
              locations.push(locText.trim());
            }
          }
        } catch (error) {
          console.log("Could not find locations");
        }

        // Extract description with improved selectors
        let description = "";
        try {
          const descElement = await driver.findElement(
            By.css(
              ".sdl-application-job-details__job-description, .job-description, .description"
            )
          );
          description = await descElement.getText();
        } catch (error) {
          console.log("Could not find description");
        }

        // Add to jobs array
        allJobs.push({
          sno: allJobs.length + 1,
          company: "Schneider Electric",
          jobId: reqId,
          function: category,
          location: locations.join(" | "),
          title: title.trim(),
          description: description.trim(),
          page: currentPage,
        });
      } catch (error) {
        console.error(
          `Error extracting job details for ${jobUrl}: ${error.message}`
        );
      } finally {
        await driver.close();
        await driver.switchTo().window(windows[0]);
      }
    }

    // Navigate to initial page
    await driver.get(baseUrl);
    await delay(3000); // Allow page to load properly

    const totalPages = await getTotalPages();
    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;

    console.log(`Total pages available: ${totalPages}`);
    console.log(`Scraping from page ${startPage} to ${effectiveEndPage}`);

    for (
      let currentPage = startPage;
      currentPage <= effectiveEndPage;
      currentPage++
    ) {
      console.log(`Scraping page ${currentPage}...`);

      // Wait for job listings with improved selectors
      await driver.wait(
        until.elementsLocated(
          By.css(
            ".search-result-item a, .job-listing a, .job-title-link, .job-link"
          )
        ),
        15000
      );

      // Get all job links
      const jobLinks = await driver.findElements(
        By.css(
          ".search-result-item a, .job-listing a, .job-title-link, .job-link"
        )
      );

      const jobUrls = await Promise.all(
        jobLinks.map((link) => link.getAttribute("href"))
      );

      for (let i = 0; i < jobUrls.length; i++) {
        console.log(
          `Processing job ${i + 1} of ${jobUrls.length} on page ${currentPage}`
        );
        await extractJobDetails(jobUrls[i], currentPage, i);
        await delay(2000);
      }

      if (currentPage < effectiveEndPage) {
        try {
          const nextButton = await driver.findElement(
            By.css(
              "button.mat-paginator-navigation-next, .next-page, .pagination-next"
            )
          );
          const isDisabled = await nextButton.getAttribute("disabled");

          if (!isDisabled) {
            await nextButton.click();
            await delay(3000);
          } else {
            console.log("Next page button is disabled. Stopping scraping.");
            break;
          }
        } catch (navError) {
          console.error("Error navigating to next page:", navError);
          break;
        }
      }
    }

    // Write results to CSV
    const csvWriter = createCsvWriter({
      path: path.join(outputDir, "SchneiderElectric_Jobs.csv"),
      header: [
        { id: "sno", title: "S.No." },
        { id: "company", title: "Company" },
        { id: "jobId", title: "Job ID" },
        { id: "function", title: "Function" },
        { id: "location", title: "Location" },
        { id: "title", title: "Title" },
        { id: "description", title: "Description" },
        { id: "page", title: "Page Number" },
      ],
    });

    if (allJobs.length > 0) {
      await csvWriter.writeRecords(allJobs);
      console.log(`Saved ${allJobs.length} jobs to SchneiderElectric_Jobs.csv`);
    } else {
      console.log("No jobs found during scraping.");
    }
  } catch (error) {
    console.error(`Critical error during scraping: ${error.message}`);
    throw error;
  } finally {
    await driver.quit();
  }
}

module.exports = { scrapeJobs };
