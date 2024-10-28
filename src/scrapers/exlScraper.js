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
      //   { id: "experience", title: "Required Experience" },
      //   { id: "skills", title: "Required Skills" },
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

      // Wait for job cards to load
      await page
        .waitForSelector(".card-block", { timeout: 10000 })
        .catch(() => null);

      // Extract job details
      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(".card-block");
        return Array.from(jobCards).map((card) => {
          // Helper function to safely extract text content
          const getTextContent = (selector, parent = card) => {
            const element = parent.querySelector(selector);
            return element ? element.textContent.trim() : "";
          };

          // Extract title and job ID
          const titleElement = card.querySelector(".title_block .link");
          const jobCodeElement = card.querySelector(".job-code");

          // Extract location and function
          const listItems = card.querySelectorAll(".listing-inline li");
          const functionText = listItems[0]
            ? listItems[0].textContent.trim()
            : "";
          const locationText = listItems[1]
            ? listItems[1].textContent.trim()
            : "";

          // Extract posted date
          const postedDateText = getTextContent(".last-child .link2");

          // Extract experience
          const experienceText = getTextContent(".text-cell.font-bold");

          // Extract skills
          const skillTags = card.querySelectorAll(".tag-job");
          const skills = Array.from(skillTags)
            .map((tag) => tag.textContent.trim())
            .join(", ");

          return {
            company: "EXL",
            jobId: jobCodeElement ? jobCodeElement.textContent.trim() : "",
            function: functionText,
            location: locationText,
            title: titleElement ? titleElement.textContent.trim() : "",
            description: functionText, // Using function as description since detailed description needs another page load
            postedOn: postedDateText,
            page: pageNum,
            // experience: experienceText,
            // skills: skills,
          };
        });
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
