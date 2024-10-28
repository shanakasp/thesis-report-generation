const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

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
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const pageUrl = `${baseUrl}?page=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      await page
        .waitForSelector(".card-block", { timeout: 10000 })
        .catch(() => null);

      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(".card-block");
        return Array.from(jobCards)
          .map((card) => {
            // Helper function to safely extract text content
            const getTextContent = (selector, parent = card) => {
              const element = parent.querySelector(selector);
              return element ? element.textContent.trim() : "";
            };

            // Extract title and job ID
            const titleElement = card.querySelector(".title_block .link");
            const jobCodeElement = card.querySelector(".job-code");

            // Extract and simplify function path
            const functionElement = card.querySelector(
              ".listing-inline li:first-child"
            );
            const functionText = functionElement
              ? functionElement.textContent.trim()
              : "";
            const functionParts = functionText.split(">");
            const simplifiedFunction =
              functionParts[functionParts.length - 1].trim();

            // Extract and simplify location
            const locationElement = card.querySelector(
              ".listing-inline li:nth-child(2)"
            );
            const locationText = locationElement
              ? locationElement.textContent.trim()
              : "";
            const locationParts = locationText.split(">");
            // Filter out "India" and empty strings, then join remaining parts
            const simplifiedLocation = locationParts
              .filter((part) => part.trim() !== "India" && part.trim() !== "")
              .join(", ");

            // Extract experience
            const experienceText = getTextContent(".text-cell.font-bold");

            // Extract skills
            const skillTags = card.querySelectorAll(".tag-job");
            const skills = Array.from(skillTags)
              .map((tag) => tag.textContent.trim())
              .filter(Boolean)
              .join(", ");

            // Combine function with experience and skills
            const enhancedFunction = `${simplifiedFunction} | Experience: ${experienceText} | Skills: ${skills}`;

            // Create a detailed description
            const description = [
              `Department: ${functionText}`,
              `Required Experience: ${experienceText}`,
              `Required Skills: ${skills}`,
            ]
              .filter(Boolean)
              .join("\n");

            // Extract posted date
            const postedDateText = getTextContent(".last-child .link2");

            // Only return jobs that have at least a title
            if (titleElement) {
              return {
                company: "EXL",
                jobId: jobCodeElement ? jobCodeElement.textContent.trim() : "", // Keep full job ID format
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
          .filter((job) => job !== null); // Remove any null entries
      }, currentPage);

      // If no jobs are found, stop the loop
      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(`Scraped Jobs From EXL Page ${currentPage}`);

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
