const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

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

      const pageUrl = `${baseUrl}/?page=${currentPage}&location=India&radius=100&cname=India&ccode=IN&pagesize=10#results`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Wait for job cards to load
      await page
        .waitForSelector(".card-job", { timeout: 10000 })
        .catch(() => null);

      // Extract basic job details from listing page
      const jobListings = await page.evaluate((pageNum) => {
        const cards = document.querySelectorAll(".card-job");
        return Array.from(cards).map((card) => {
          const link = card.querySelector(".card-title a");
          const meta = card.querySelector(".job-meta");
          return {
            company: "Cognizant",
            title: link?.textContent.trim() || "",
            detailUrl: link?.href || "",
            location: meta?.children[0]?.textContent.trim() || "",
            function: meta?.children[1]?.textContent.trim() || "",
            jobId: card.querySelector(".card-job-actions")?.dataset?.id || "",
            page: pageNum,
          };
        });
      }, currentPage);

      // If no jobs are found, stop the loop
      if (jobListings.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Get detailed information for each job
      for (let i = 0; i < jobListings.length; i++) {
        try {
          if (jobListings[i].detailUrl) {
            const detailPage = await browser.newPage();
            await detailPage.goto(jobListings[i].detailUrl, {
              waitUntil: "networkidle0",
            });

            // Extract additional details from the job detail page
            const details = await detailPage.evaluate(() => {
              const description =
                document
                  .querySelector(".job-description p")
                  ?.textContent.replace(/<o:p><\/o:p>|<o:p> <\/o:p>/g, "")
                  .trim() || "";

              const jobMeta = document.querySelector(".job-meta");
              const postedDate =
                Array.from(jobMeta?.querySelectorAll("dt"))
                  .find((dt) => dt.textContent.trim() === "Date published:")
                  ?.nextElementSibling?.textContent.trim() || "";

              return {
                description,
                postedOn: postedDate,
              };
            });

            jobListings[i].description = details.description;
            jobListings[i].postedOn = details.postedOn;

            await detailPage.close();
          }
        } catch (error) {
          console.error(`Error getting job details: ${error.message}`);
          jobListings[i].description = "Error fetching details";
          jobListings[i].postedOn = "";
        }

        // Add delay between detail page requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobListings.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobListings.length;
      console.log(`Scraped Jobs from Cognizant Page ${currentPage}`);

      // Add delay between pages to avoid rate limiting
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
