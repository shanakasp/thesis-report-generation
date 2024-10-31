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

  let globalCounter = 0;

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      // Create new page for listings
      const listingsPage = await browser.newPage();
      await listingsPage.setDefaultNavigationTimeout(60000);
      await listingsPage.setDefaultTimeout(30000);

      const pageUrl = `${baseUrl}/?page=${currentPage}&location=India&radius=100&cname=India&ccode=IN&pagesize=10#results`;

      // Navigate to the listings page
      await listingsPage.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Wait for job cards to load
      await listingsPage
        .waitForSelector(".card.card-job", { timeout: 30000 })
        .catch(() => {
          console.log("No job cards found on page");
          return null;
        });

      // Extract basic job details from listing page
      const jobListings = await listingsPage.evaluate((pageNum) => {
        const cards = document.querySelectorAll(".card.card-job");
        return Array.from(cards).map((card) => {
          const link = card.querySelector(".card-title a");
          const metaItems = card.querySelectorAll(
            ".job-meta .list-inline-item"
          );
          const jobIdElement = card.querySelector(".card-job-actions");

          return {
            company: "Cognizant",
            title: link?.textContent?.trim() || "",
            detailUrl: link?.href || "",
            location: metaItems[0]?.textContent?.trim() || "",
            function: metaItems[1]?.textContent?.trim() || "",
            jobId: jobIdElement?.dataset?.id || "",
            page: pageNum,
          };
        });
      }, currentPage);

      await listingsPage.close();

      // If no jobs are found, stop the loop
      if (!jobListings.length) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Get detailed information for each job
      for (let i = 0; i < jobListings.length; i++) {
        try {
          if (jobListings[i].detailUrl) {
            const detailPage = await browser.newPage();
            await detailPage.setDefaultNavigationTimeout(60000);
            await detailPage.setDefaultTimeout(30000);

            await detailPage.goto(jobListings[i].detailUrl, {
              waitUntil: "networkidle0",
              timeout: 60000,
            });

            // Wait for content to load
            await detailPage.waitForSelector(".cms-content", {
              timeout: 30000,
            });

            // Extract additional details from the job detail page
            const details = await detailPage.evaluate(() => {
              // Get description
              const descriptionContent = document.querySelector(".cms-content");
              const description = descriptionContent
                ? descriptionContent.innerText
                    .replace(/\s+/g, " ")
                    .replace(/\n+/g, "\n")
                    .trim()
                : "";

              // Get posted date
              const dateElements = document.querySelectorAll("dt");
              const dateLabel = Array.from(dateElements).find((el) =>
                el.textContent.trim().toLowerCase().includes("date")
              );
              const postedDate = dateLabel
                ? dateLabel.nextElementSibling?.textContent?.trim()
                : "";

              return {
                description,
                postedOn: postedDate,
              };
            });

            jobListings[i].description =
              details.description || "No description available";
            jobListings[i].postedOn = details.postedOn || "";

            await detailPage.close();

            console.log(
              `Successfully scraped details for: ${jobListings[i].title}`
            );
          }
        } catch (error) {
          console.error(
            `Error getting job details for ${jobListings[i].title}: ${error.message}`
          );
          jobListings[i].description = "Error fetching details";
          jobListings[i].postedOn = "";
        }

        // Add delay between detail page requests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobListings.map((job) => ({
          ...job,
          sno: ++globalCounter,
        }))
      );

      console.log(
        `Scraped ${jobListings.length} jobs from Cognizant Page ${currentPage}`
      );

      // Add delay between pages
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
  return globalCounter;
}

module.exports = { scrapeJobs };
