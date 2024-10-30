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
      // Get job description
      const descriptions = Array.from(
        document.querySelectorAll(
          '.article-text div[style="padding:10.0px 0.0px;border:1.0px solid transparent"]'
        )
      )
        .filter((div) => {
          const header = div.querySelector("h2");
          return (
            header &&
            (header.textContent.includes("Job Description") ||
              header.textContent.includes("Grade Specific"))
          );
        })
        .map((div) => {
          const content = div.querySelector(
            'div:not([style*="font-size:16.0px"])'
          );
          return content ? content.textContent.trim() : "";
        })
        .filter((text) => text)
        .join("\n\n");

      // Get posted date - specifically looking for the "Posted on" label
      const postedDateElement = Array.from(
        document.querySelectorAll(".job-meta-box-detail")
      ).find(
        (box) => box.querySelector(".label")?.textContent.trim() === "Posted on"
      );

      const postedDate = postedDateElement
        ? postedDateElement.querySelector(".value")?.textContent.trim()
        : "";

      return {
        description: descriptions,
        postedDate: postedDate,
      };
    });

    return jobDetails;
  } catch (error) {
    console.error(`Error fetching job details for ${jobId}:`, error.message);
    return { description: "", postedDate: "" };
  }
}

async function scrapeJobs(baseUrl, startPage, endPage) {
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
  const jobsPerPage = 30;
  let currentPage = startPage;

  try {
    while (currentPage <= endPage) {
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
        console.log(`No more jobs found on Withing Range. Stopping.`);
        break;
      }

      // Fetch detailed information for each job
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

          // Add a small delay between requests
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

      await csvWriter.writeRecords(jobsWithDetails);
      globalCounter += jobsWithDetails.length;

      if (globalCounter >= jobsPerPage * (endPage - startPage + 1)) {
        console.log(
          `Fetched ${globalCounter} jobs. Stopping as limit reached.`
        );
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

  console.log(`Capgemini scraping complete with ${globalCounter} jobs.`);
}

module.exports = { scrapeJobs };
