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
    path: path.join(outputDir, "EXL.csv"),
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
    // Navigate to the initial page
    await page.goto(baseUrl, { waitUntil: "networkidle0" });
    let currentPage = 1;

    // Function to get total number of pages
    const getTotalPages = async () => {
      const totalText = await page.$eval(".totale-num", (el) =>
        el.textContent.trim()
      );
      const totalJobs = parseInt(totalText.replace(/[^0-9]/g, ""));
      const jobsPerPage = 45; // Default page size
      return Math.ceil(totalJobs / jobsPerPage);
    };

    // Function to navigate to specific page
    const goToPage = async (targetPage) => {
      // Wait for pagination to be present
      await page.waitForSelector(".pagination", { timeout: 10000 });

      // Get current active page
      const currentActivePage = await page.$eval(
        ".pagination li.active a",
        (el) => parseInt(el.textContent.trim())
      );

      if (targetPage === currentActivePage) {
        return true;
      }

      // Determine if we need to click next or specific page number
      const pageNumbers = await page.$$eval(
        ".pagination li:not(.page-item):not(.perview):not(.nextview) a",
        (els) => els.map((el) => parseInt(el.textContent.trim()))
      );

      let clickSuccess = false;

      if (pageNumbers.includes(targetPage)) {
        // Click the specific page number if visible
        try {
          await page.evaluate((targetPage) => {
            const pageLinks = Array.from(
              document.querySelectorAll(".pagination li a")
            );
            const targetLink = pageLinks.find(
              (link) => parseInt(link.textContent.trim()) === targetPage
            );
            if (targetLink) targetLink.click();
          }, targetPage);
          clickSuccess = true;
        } catch (error) {
          console.log(`Could not click page ${targetPage} directly`);
        }
      } else {
        // Click next/previous until we reach the desired page
        const nextButton = await page.$(".pagination li.nextview a");
        if (nextButton) {
          await nextButton.click();
          clickSuccess = true;
        }
      }

      if (clickSuccess) {
        // Wait for content to load
        await delay(2000);
        await page.waitForSelector(".card-block", { timeout: 10000 });
        return true;
      }

      return false;
    };

    const totalPages = await getTotalPages();
    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;

    while (currentPage <= effectiveEndPage) {
      console.log(`Scraping page ${currentPage}...`);

      // Navigate to the desired page
      const navigationSuccess = await goToPage(currentPage);
      if (!navigationSuccess) {
        console.log(`Failed to navigate to page ${currentPage}. Stopping.`);
        break;
      }

      // Wait for job cards to load
      await page.waitForSelector(".card-block", { timeout: 10000 });

      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(".card-block");
        return Array.from(jobCards)
          .map((card) => {
            const getTextContent = (selector, parent = card) => {
              const element = parent.querySelector(selector);
              return element ? element.textContent.trim() : "";
            };

            const titleElement = card.querySelector(".title_block .link");
            const jobCodeElement = card.querySelector(".job-code");

            const functionElement = card.querySelector(
              ".listing-inline li:first-child"
            );
            const functionText = functionElement
              ? functionElement.textContent.trim()
              : "";
            const functionParts = functionText.split(">");
            const simplifiedFunction =
              functionParts[functionParts.length - 1].trim();

            const locationElement = card.querySelector(
              ".listing-inline li:nth-child(2)"
            );
            const locationText = locationElement
              ? locationElement.textContent.trim()
              : "";
            const locationParts = locationText.split(">");
            const simplifiedLocation = locationParts
              .filter((part) => part.trim() !== "India" && part.trim() !== "")
              .join(", ");

            const experienceText = getTextContent(".text-cell.font-bold");

            const skillTags = card.querySelectorAll(".tag-job");
            const skills = Array.from(skillTags)
              .map((tag) => tag.textContent.trim())
              .filter(Boolean)
              .join(", ");

            const enhancedFunction = `${simplifiedFunction} | Experience: ${experienceText} | Skills: ${skills}`;

            const description = [
              `Department: ${functionText}`,
              `Required Experience: ${experienceText}`,
              `Required Skills: ${skills}`,
            ]
              .filter(Boolean)
              .join("\n");

            const postedDateText = getTextContent(".last-child .link2");

            if (titleElement) {
              return {
                company: "EXL",
                jobId: jobCodeElement ? jobCodeElement.textContent.trim() : "",
                function: description,
                location: simplifiedLocation,
                title: titleElement.textContent.trim(),
                description: enhancedFunction,
                postedOn: postedDateText,
                page: pageNum,
              };
            }
            return null;
          })
          .filter((job) => job !== null);
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
      console.log(`Scraped Jobs From EXL Page ${currentPage}`);

      // Add delay between pages
      await delay(3000);

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
