const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobDetails(page, jobId) {
  const jobUrl = `https://www.capgemini.com/jobs/${jobId}+sap_btp/`;
  console.log(`Fetching details from: ${jobUrl}`);

  try {
    await page.goto(jobUrl, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Wait for the content to load
    await page.waitForSelector(".article-text", { timeout: 5000 });

    const jobDetails = await page.evaluate(() => {
      const articleText = document.querySelector(".article-text");
      const description = articleText ? articleText.textContent.trim() : "";

      const postedDateElement = Array.from(
        document.querySelectorAll(".job-meta-box-detail")
      ).find(
        (box) => box.querySelector(".label")?.textContent.trim() === "Posted on"
      );

      const postedDate = postedDateElement
        ? postedDateElement.querySelector(".value")?.textContent.trim()
        : "";

      return {
        description: description,
        postedDate: postedDate,
      };
    });

    return jobDetails;
  } catch (error) {
    console.error(`Error fetching job details for ${jobId}:`, error.message);
    return { description: "", postedDate: "" };
  }
}

async function scrapeJobs(baseUrl) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Capgemini.csv"),
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
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  });

  const page = await browser.newPage();
  let globalCounter = 0;
  let currentPage = 1;
  let hasMoreJobs = true;

  try {
    while (hasMoreJobs) {
      const pageUrl = `${baseUrl}&page=${currentPage}`;
      console.log(`Scraping page ${currentPage}: ${pageUrl}`);

      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      const jobs = await page.evaluate(() => {
        const jobElements = document.querySelectorAll(
          ".table-tr.filter-box.tag-active.joblink"
        );

        return Array.from(jobElements).map((job) => ({
          jobId: job.getAttribute("href").split("/")[2].split("+")[0],
          location:
            job
              .querySelector("div.table-td:nth-child(3) > div")
              ?.textContent.trim() || "",
          title:
            job
              .querySelector("div.table-td:nth-child(1) > div")
              ?.textContent.trim() || "",
          function:
            Array.from(
              job.querySelectorAll('div.table-td[style="display: none;"] div')
            )
              .find((div) =>
                div.previousElementSibling?.textContent.includes(
                  "Business Unit"
                )
              )
              ?.textContent.trim() || "",
        }));
      });

      if (jobs.length === 0) {
        console.log(`No more jobs found. Stopping at page ${currentPage}.`);
        hasMoreJobs = false;
        break;
      }

      const jobsWithDetails = [];
      for (const job of jobs) {
        try {
          console.log(`Fetching details for job ID: ${job.jobId}`);
          const details = await scrapeJobDetails(page, job.jobId);

          jobsWithDetails.push({
            sno: globalCounter + jobsWithDetails.length + 1,
            company: "Capgemini",
            jobId: job.jobId,
            function: job.function,
            location: job.location,
            title: job.title,
            description: details.description || "No description available",
            postedOn: details.postedDate || "",
            page: currentPage,
          });

          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Error processing job ${job.jobId}:`, error);
          jobsWithDetails.push({
            sno: globalCounter + jobsWithDetails.length + 1,
            company: "Capgemini",
            jobId: job.jobId,
            function: job.function,
            location: job.location,
            title: job.title,
            description: "Failed to fetch description",
            postedOn: "",
            page: currentPage,
          });
        }
      }

      // Save jobs for current page
      await csvWriter.writeRecords(jobsWithDetails);
      globalCounter += jobsWithDetails.length;

      console.log(
        `Saved ${jobsWithDetails.length} jobs from page ${currentPage}`
      );
      console.log(`Total jobs scraped so far: ${globalCounter}`);

      // Check if we should continue to next page
      const hasNextPage = await page.evaluate(() => {
        const nextButton = document.querySelector(
          ".pagination-next:not(.disabled)"
        );
        return !!nextButton;
      });

      if (!hasNextPage) {
        console.log("No more pages available");
        hasMoreJobs = false;
        break;
      }

      currentPage += 1;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error("Error during scraping:", error);
  } finally {
    await browser.close();
  }

  console.log(
    `Capgemini scraping complete. Total jobs scraped: ${globalCounter}`
  );
}

module.exports = { scrapeJobs };
