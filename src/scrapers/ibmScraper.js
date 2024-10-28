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

      const pageUrl = `${baseUrl}&page=${currentPage}`;

      // Navigate to page and wait for content
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job cards to load
      await page
        .waitForSelector(".bx--card__content", { timeout: 10000 })
        .catch(() => null);

      // Extract job details
      const jobs = await page.evaluate(async (pageNum) => {
        const jobCards = document.querySelectorAll(
          ".bx--card-group__cards__col"
        );
        const jobDetails = [];

        for (const card of Array.from(jobCards)) {
          const link = card.querySelector("a");
          if (!link) continue;

          // Get the job URL
          const jobUrl = link.href;

          // Extract the Req ID from the URL (assuming it's in the format /job/21205795/)
          const reqIdMatch = jobUrl.match(/\/job\/(\d+)\//);
          const jobId = reqIdMatch ? reqIdMatch[1] : "";

          const content = card.querySelector(".bx--card__content");
          if (!content) continue;

          const functionElement = content.querySelector(".bx--card__eyebrow");
          const titleElement = content.querySelector(".bx--card__heading");
          const innerDetails = content.querySelector(".ibm--card__copy__inner");

          let professionalLevel = "";
          let location = "";

          if (innerDetails) {
            const text = innerDetails.innerHTML; // Use innerHTML to retain the <br> tag
            const parts = text.split("<br>").map((part) => part.trim()); // Split by <br> and trim spaces
            professionalLevel = parts[0] || ""; // First part is the professional level
            location = parts[1]
              ? parts[1]
                  .replace("Multiple Cities", "")
                  .replace(/,\s*IN/g, "")
                  .trim()
              : ""; // Remove "Multiple Cities" and ", IN"
          }

          jobDetails.push({
            company: "IBM",
            jobId: `REQ${jobId}`, // Format as REQ followed by the number
            function: titleElement ? titleElement.textContent.trim() : "",
            location: location,
            title: functionElement ? functionElement.textContent.trim() : "",
            description: professionalLevel, // Set description to professional level
            postedOn: new Date().toISOString().split("T")[0],
            page: pageNum,
          });
        }

        return jobDetails;
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
      console.log(`Scraped jobs from IBM page ${currentPage}`);

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
