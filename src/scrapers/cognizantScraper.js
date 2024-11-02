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

  // Configure CSV writer for all pages
  const csvWriter = createCsvWriter({
    path: path.join(outputDir, `Cognizant.csv`),
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

  try {
    // Map to store unique jobs with their details
    const uniqueJobs = new Map();

    // Function to navigate to a specific page
    async function navigateToPage(pageNumber) {
      const pageUrl = `${baseUrl}/?page=${pageNumber}&location=India&radius=100&cname=India&ccode=IN&pagesize=10#results`;
      await driver.get(pageUrl);
      await driver.wait(until.elementLocated(By.css(".card.card-job")), 10000);
      await delay(2000);
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

    // Safe text extraction helper function
    async function safeGetText(element) {
      try {
        if (element) {
          const text = await element.getText();
          return text || "";
        }
      } catch (error) {
        return "";
      }
      return "";
    }

    // Function to extract job details from detail page
    async function extractJobDetails(jobUrl) {
      try {
        await driver.get(jobUrl);
        await driver.wait(until.elementLocated(By.css(".key-info")), 10000);

        // Extract title
        let title = "";
        try {
          const titleElement = await driver.findElement(
            By.css(".hero-heading")
          );
          title = await safeGetText(titleElement);
        } catch (titleError) {
          console.error("Error extracting title:", titleError);
        }

        let jobId = "";
        let location = "";
        let jobFunction = "";
        let postedOn = "";

        try {
          // Extract Job ID
          const jobIdElement = await driver.findElement(
            By.xpath("//dt[text()='Job number:']/following-sibling::dd/span")
          );
          jobId = await safeGetText(jobIdElement);

          // Extract Function
          const functionElement = await driver.findElement(
            By.xpath("//dt[text()='Job category:']/following-sibling::dd/span")
          );
          jobFunction = await safeGetText(functionElement);

          // Extract Location with proper error handling
          try {
            const locationElement = await driver.findElement(
              By.xpath("//dt[text()='Location:']/following-sibling::dd/span")
            );
            const locationText = await safeGetText(locationElement);
            location = locationText ? locationText.split("/")[0].trim() : "";
          } catch (locationError) {
            console.error("Error extracting location:", locationError);
            location = "";
          }

          // Extract Posted Date
          const dateElement = await driver.findElement(
            By.xpath(
              "//dt[text()='Date published:']/following-sibling::dd/span"
            )
          );
          postedOn = await safeGetText(dateElement);
        } catch (detailsError) {
          console.error("Error extracting job details:", detailsError);
        }
        // Enhanced description extraction
        let description = "";
        try {
          // Get all content elements in the `cms-content` article
          const contentElements = await driver.findElements(
            By.css(
              "article.cms-content p, article.cms-content ul li, article.cms-content strong"
            )
          );

          const contentTexts = await Promise.all(
            contentElements.map(async (el) => {
              const tagName = await el.getTagName();
              const text = await safeGetText(el);

              // Process based on element type
              if (!text) return "";

              if (tagName === "li") {
                return `• ${text}`; // Adds a bullet point for list items
              } else if (tagName === "strong") {
                return `\n${text.toUpperCase()}\n`; // Adds emphasis for strong tags
              } else {
                return text;
              }
            })
          );

          // Join the text segments and clean up any extra whitespace
          description = contentTexts
            .filter((text) => text) // Remove any empty strings
            .join("\n")
            .replace(/\n{3,}/g, "\n\n") // Normalize newlines to avoid too much spacing
            .trim();
        } catch (descError) {
          console.error("Error extracting description:", descError);
        }

        return {
          jobId,
          title,
          function: jobFunction,
          location,
          description,
          postedOn,
        };
      } catch (error) {
        console.error(`Error extracting details for ${jobUrl}:`, error);
        return null;
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

      // Get all job URLs on the current page
      const jobElements = await driver.findElements(By.css(".card.card-job"));
      const jobUrls = [];

      for (const jobElement of jobElements) {
        try {
          const titleElement = await jobElement.findElement(
            By.css("h2.card-title a")
          );
          const jobUrl = await titleElement.getAttribute("href");
          jobUrls.push(jobUrl);
        } catch (error) {
          console.error("Error getting job URL:", error);
        }
      }

      console.log(`Found ${jobUrls.length} jobs on page ${currentPage}`);

      // Process each job URL
      for (const [index, jobUrl] of jobUrls.entries()) {
        try {
          console.log(
            `Processing job ${index + 1}/${
              jobUrls.length
            } on page ${currentPage}`
          );

          const jobDetails = await extractJobDetails(jobUrl);

          if (
            jobDetails &&
            jobDetails.jobId &&
            !uniqueJobs.has(jobDetails.jobId)
          ) {
            uniqueJobs.set(jobDetails.jobId, {
              ...jobDetails,
              page: currentPage,
            });
          }
        } catch (error) {
          console.error(
            `Error processing job ${index + 1} on page ${currentPage}:`,
            error
          );
        }
      }

      // Navigate to next page if not on last page
      if (currentPage < effectiveEndPage) {
        try {
          await navigateToPage(currentPage + 1);
        } catch (error) {
          console.error("Error navigating to next page:", error);
          break;
        }
      }
    }

    // Convert unique jobs to array and add sequential numbers
    const allJobs = Array.from(uniqueJobs.values()).map((job, index) => ({
      sno: index + 1,
      company: "Cognizant",
      ...job,
    }));

    // Write all unique jobs to CSV at once
    await csvWriter.writeRecords(allJobs);

    console.log("Scraping completed successfully.");
    console.log(`Total unique jobs scraped: ${allJobs.length}`);
  } catch (error) {
    console.error(`Critical error during scraping: ${error.message}`);
    throw error;
  } finally {
    await driver.quit();
  }
}

module.exports = { scrapeJobs };
