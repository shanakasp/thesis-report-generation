const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");

const fs = require("fs").promises;

// Helper function for delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function scrapeJobs(baseUrl, startPage, endPage) {
  // Setup output directory
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  // Configure Chrome options
  const options = new chrome.Options();
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--window-size=1920,1080");

  // Create WebDriver
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  // Consolidated job list for single CSV
  const allJobs = [];

  try {
    // Navigate to initial page
    await driver.get(baseUrl);

    // Wait for initial page load
    await driver.wait(
      until.elementLocated(By.css('li div[role="button"]')),
      10000
    );

    // Function to get total number of pages
    async function getTotalPages() {
      try {
        const pageButtons = await driver.findElements(
          By.css('nav[aria-label="Page selection"] button[data-test-id]')
        );

        if (pageButtons.length > 0) {
          const lastButton = pageButtons[pageButtons.length - 2];
          const lastPageNumber = await lastButton.getAttribute("data-test-id");
          return parseInt(lastPageNumber);
        }
        return 1;
      } catch (error) {
        console.error("Error getting total pages:", error);
        return 1;
      }
    }

    // Determine total pages and effective end page
    const totalPages = await getTotalPages();
    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;

    console.log(`Total pages available: ${totalPages}`);
    console.log(`Scraping from page ${startPage} to ${effectiveEndPage}`);

    // Navigate to start page if not first page
    if (startPage > 1) {
      for (let pageNum = 1; pageNum < startPage; pageNum++) {
        const nextButton = await driver.findElement(
          By.css('button[data-test-id="next-page"]')
        );
        await nextButton.click();
        await driver.wait(
          until.elementLocated(By.css('li div[role="button"]')),
          10000
        );
        await delay(2000);
      }
    }

    // Scrape pages
    for (
      let currentPage = startPage;
      currentPage <= effectiveEndPage;
      currentPage++
    ) {
      console.log(`Scraping page ${currentPage}...`);

      // Wait for job listings
      await driver.wait(
        until.elementLocated(By.css('li div[role="button"]')),
        10000
      );

      // Scrape jobs on current page
      const jobElements = await driver.findElements(
        By.css('li div[role="button"]')
      );

      for (const [index, jobElement] of jobElements.entries()) {
        try {
          // Clean location helper
          const cleanLocation = (location) => {
            if (!location) return "";
            const parts = location.split(",");
            return parts.length === 0 ? location.trim() : parts[0].trim();
          };

          // Extract job details
          const titleElement = await jobElement.findElement(By.css("h3 a"));
          const jobUrl = await titleElement.getAttribute("href");
          const jobId = jobUrl.split("/jobs/")[1];
          const jobTitle = await titleElement.getText();

          // Location - keeping the existing logic
          let fullLocation = "";
          let cleanedLocation = "";
          try {
            const locationElements = await jobElement.findElements(
              By.css(".metadatum-module_text__ncKFr")
            );
            if (locationElements.length > 0) {
              fullLocation = await locationElements[0].getText();
              cleanedLocation = cleanLocation(fullLocation);
            }
          } catch (locationError) {
            console.warn("Could not extract location:", locationError);
          }

          // Updated date extraction logic
          let dateText = "";
          try {
            // First try to find the calendar icon
            const calendarIcons = await jobElement.findElements(
              By.css('svg[viewBox="0 0 16 16"]')
            );

            if (calendarIcons.length > 0) {
              // Find the text element next to the calendar icon
              const parentDiv = await calendarIcons[0].findElement(
                By.xpath("./ancestor::div[contains(@class, 'css-8ulbch')]")
              );
              const dateElement = await parentDiv.findElement(
                By.css(".metadatum-module_text__ncKFr")
              );
              dateText = await dateElement.getText();
              dateText = dateText.replace("Updated:", "").trim();
            } else {
              // Fallback to looking for date in all metadata elements
              const metadataElements = await jobElement.findElements(
                By.css(".metadatum-module_text__ncKFr")
              );

              for (const element of metadataElements) {
                const text = await element.getText();
                if (text.includes("Updated:")) {
                  dateText = text.replace("Updated:", "").trim();
                  break;
                }
              }
            }
          } catch (dateError) {
            console.warn("Could not extract date:", dateError);
          }

          // Description
          let description = "";
          try {
            const descriptionElements = await jobElement.findElements(
              By.css(".job-card-module_content__8sS0J")
            );
            if (descriptionElements.length > 0) {
              description = await descriptionElements[0].getText();
            }
          } catch (descErr) {
            console.warn("Could not extract description:", descErr);
          }

          // Push job details to consolidated list
          allJobs.push({
            sno: allJobs.length + 1,
            company: "Amazon",
            jobId: jobId,
            function: description.includes("FireTV")
              ? "FireTV"
              : "Program Management",
            location: cleanedLocation,
            title: jobTitle,
            description: description,
            postedOn: dateText,
            page: currentPage,
          });
        } catch (jobError) {
          console.error(
            `Error processing job element on page ${currentPage}:`,
            jobError
          );
        }
      }

      // Move to next page if not on last page
      if (currentPage < effectiveEndPage) {
        try {
          const nextButton = await driver.findElement(
            By.css('button[data-test-id="next-page"]')
          );

          // Check if next button is disabled
          const isDisabled =
            (await nextButton.getAttribute("disabled")) !== null;

          if (!isDisabled) {
            await nextButton.click();
            await driver.wait(
              until.elementLocated(By.css('li div[role="button"]')),
              10000
            );
            await delay(2000);
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

    // Configure CSV Writer for single file
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

    // Write all jobs to single CSV
    if (allJobs.length > 0) {
      await csvWriter.writeRecords(allJobs);
      console.log(`Saved ${allJobs.length} jobs to Amazon_Jobs.csv`);
    } else {
      console.log("No jobs found during scraping.");
    }

    console.log("Scraping completed successfully.");
  } catch (error) {
    console.error(`Critical error during scraping: ${error.message}`);
    throw error;
  } finally {
    await driver.quit();
  }
}

module.exports = { scrapeJobs };
