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
  let currentPage = startPage;

  try {
    while (true) {
      if (endPage && currentPage > endPage) {
        console.log(`Reached defined end page: ${endPage}. Stopping.`);
        break;
      }

      const pageUrl = `${baseUrl}&pg=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "networkidle0" });

      // Get all job links and basic info from the listing page
      const jobListings = await page.evaluate(() => {
        const cards = document.querySelectorAll(".card-job");
        return Array.from(cards).map((card) => {
          const link = card.querySelector(".card-title a");
          const meta = card.querySelector(".job-meta");
          return {
            title: link?.textContent.trim() || "",
            url: link?.href || "",
            location: meta?.children[0]?.textContent.trim() || "",
            function: meta?.children[1]?.textContent.trim() || "",
            jobId: card.querySelector(".card-job-actions")?.dataset?.id || "",
          };
        });
      });

      if (jobListings.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        break;
      }

      // Visit each job's detail page and get complete information
      const detailedJobs = [];
      for (const listing of jobListings) {
        try {
          const detailPage = await browser.newPage();
          await detailPage.goto(listing.url, { waitUntil: "networkidle0" });

          const jobDetails = await detailPage.evaluate((basicInfo) => {
            const jobMeta = document.querySelector(".job-meta");

            // Get description from the first paragraph in the content area
            const description =
              document
                .querySelector(".job-description p")
                ?.textContent.replace(/<o:p><\/o:p>|<o:p> <\/o:p>/g, "") // Remove o:p tags
                .trim() || "";

            const postedDate =
              Array.from(jobMeta?.querySelectorAll("dt"))
                .find((dt) => dt.textContent.trim() === "Date published:")
                ?.nextElementSibling?.textContent.trim() || "";

            return {
              ...basicInfo,
              description: description,
              postedOn: postedDate,
            };
          }, listing);

          detailedJobs.push(jobDetails);
          await detailPage.close();
        } catch (error) {
          console.error(`Error scraping job details: ${error.message}`);
          detailedJobs.push({
            ...listing,
            description: "Error fetching job details",
            postedOn: "",
          });
        }

        // Add delay between job detail requests
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Write the detailed jobs to CSV
      await csvWriter.writeRecords(
        detailedJobs.map((job, idx) => ({
          sno: globalCounter + idx + 1,
          company: "Cognizant",
          jobId: job.jobId,
          function: job.function,
          location: job.location,
          title: job.title,
          description: job.description,
          postedOn: job.postedOn,
          page: currentPage,
        }))
      );

      globalCounter += detailedJobs.length;
      console.log(
        `Scraped ${detailedJobs.length} jobs from page ${currentPage}`
      );

      currentPage++;
      // Add delay between pages
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  } catch (error) {
    console.error(`Error during scraping: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }

  console.log(
    `Cognizant scraping complete. Total jobs scraped: ${globalCounter}`
  );
}

module.exports = { scrapeJobs };
