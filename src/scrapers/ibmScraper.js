const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "IBM.csv"),
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

      // Construct the page URL for IBM
      const pageUrl = `${baseUrl}&page=${currentPage}`;

      // Navigate to the page and wait for the job listings to load
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for the job cards to load
      await page
        .waitForSelector(".bx--card__content", { timeout: 10000 })
        .catch(() => null);

      // Extract job details - pass currentPage as a parameter
      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(".bx--card__content");
        return Array.from(jobCards).map((card) => {
          // Extract job details based on the exact structure
          const functionElement = card.querySelector(".bx--card__eyebrow");
          const titleElement = card.querySelector(".bx--card__heading");
          const innerDetails = card.querySelector(".ibm--card__copy__inner");

          // Split the inner details to separate Professional/Entry Level from location
          let professionalLevel = "";
          let location = "";
          if (innerDetails) {
            const text = innerDetails.innerHTML;
            const parts = text.split("<br>");
            professionalLevel = parts[0]?.trim() || "";
            location = parts[1]?.trim() || "";
          }

          return {
            company: "IBM",
            jobId: card.closest(".bx--card")?.getAttribute("data-job-id") || "",
            function: functionElement ? functionElement.textContent.trim() : "",
            location: location,
            title: titleElement ? titleElement.textContent.trim() : "",
            description: titleElement ? titleElement.textContent.trim() : "", // Using title as description
            postedOn: new Date().toISOString().split("T")[0], // Current date as posting date
            page: pageNum,
            professionalLevel: professionalLevel,
          };
        });
      }, currentPage); // Pass currentPage as an argument to evaluate

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

      // Increment currentPage
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
