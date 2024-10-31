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
  options.addArguments("--disable-blink-features=AutomationControlled");
  options.addArguments(
    "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
  );

  // Create WebDriver
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  // Consolidated job list for single CSV
  const allJobs = [];

  try {
    // Function to navigate to a specific page
    async function navigateToPage(pageNumber) {
      const pageUrl = `${baseUrl}/?page=${pageNumber}&location=India&radius=100&cname=India&ccode=IN&pagesize=10#results`;
      await driver.get(pageUrl);
      await driver.wait(until.elementLocated(By.css(".card.card-job")), 10000);
      await delay(2000); // Additional wait for page to stabilize
    }

    // Function to get total number of pages
    async function getTotalPages() {
      try {
        const pageLinks = await driver.findElements(
          By.css("li.page-item:not(.next):not(.prev):not(.elipsis) a.page-link")
        );

        if (pageLinks.length > 0) {
          const lastPageLink = pageLinks[pageLinks.length - 1];
          const lastPageNumber = await lastPageLink.getText();
          return parseInt(lastPageNumber);
        }
        return 1;
      } catch (error) {
        console.error("Error getting total pages:", error);
        return 1;
      }
    }

    // Initial navigation
    await navigateToPage(startPage);

    // Determine total pages and effective end page
    const totalPages = await getTotalPages();
    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;

    console.log(`Total pages available: ${totalPages}`);
    console.log(`Scraping from page ${startPage} to ${effectiveEndPage}`);

    // Scrape pages
    for (
      let currentPage = startPage;
      currentPage <= effectiveEndPage;
      currentPage++
    ) {
      console.log(`Scraping page ${currentPage}...`);

      // Wait for job listings
      await driver.wait(until.elementLocated(By.css(".card.card-job")), 10000);

      // Scrape jobs on current page
      const jobElements = await driver.findElements(By.css(".card.card-job"));

      for (const [index, jobElement] of jobElements.entries()) {
        try {
          // Clean location helper
          const cleanLocation = (location) => {
            if (!location) return "";
            const parts = location.split(",");
            return parts.length > 0 ? parts[0].trim() : location.trim();
          };

          // Extract job details
          const titleElement = await jobElement.findElement(
            By.css("h2.card-title a")
          );
          const jobUrl = await titleElement.getAttribute("href");
          const jobId = jobUrl.split("/jobs/")[1].split("/")[0];
          const jobTitle = await titleElement.getText();

          // Location and Function
          const metaElements = await jobElement.findElements(
            By.css("ul.job-meta li.list-inline-item")
          );

          let location = "";
          let jobFunction = "";

          if (metaElements.length > 0) {
            location = await metaElements[0].getText();
            location = cleanLocation(location);

            if (metaElements.length > 1) {
              jobFunction = await metaElements[1].getText();
            }
          }

          // Push job details to consolidated list
          allJobs.push({
            sno: allJobs.length + 1,
            company: "Cognizant",
            jobId: jobId,
            function: jobFunction,
            location: location,
            title: jobTitle,
            description: "", // Description extraction not implemented in this version
            postedOn: "", // Posted date extraction not implemented in this version
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
          // Use JavaScript to scroll to and click next button
          const nextButton = await driver.findElement(
            By.css("li.page-item.next a.page-link")
          );

          // Scroll to the next button first
          await driver.executeScript(
            "arguments[0].scrollIntoView(true);",
            nextButton
          );
          await delay(500); // Short delay after scrolling

          // Use JavaScript click to avoid potential interception
          await driver.executeScript("arguments[0].click();", nextButton);

          // Wait for next page to load
          await driver.wait(
            until.elementLocated(By.css(".card.card-job")),
            10000
          );
          await delay(2000); // Additional stabilization delay
        } catch (navError) {
          console.error("Error navigating to next page:", navError);

          // Fallback: Try direct page navigation
          try {
            await navigateToPage(currentPage + 1);
          } catch (fallbackError) {
            console.error("Fallback navigation failed:", fallbackError);
            break;
          }
        }
      }
    }

    // Configure CSV Writer for single file
    const csvWriter = createCsvWriter({
      path: path.join(outputDir, "Cognizant.csv"),
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
      console.log(`Saved ${allJobs.length} jobs to Cognizant.csv`);
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
