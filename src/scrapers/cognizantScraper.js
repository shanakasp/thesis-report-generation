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
  const seenJobIds = new Set();

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;
    let consecutiveEmptyPages = 0;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const listingsPage = await browser.newPage();
      await listingsPage.setDefaultNavigationTimeout(60000);
      await listingsPage.setDefaultTimeout(30000);

      const pageUrl = `${baseUrl}/?page=${currentPage}&location=India&radius=100&cname=India&ccode=IN&pagesize=10#results`;

      await listingsPage.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Delay instead of `waitForTimeout`
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const currentUrl = await listingsPage.url();
      console.log(`Current URL: ${currentUrl}`);

      const jobCardsPresent = await listingsPage
        .waitForSelector(".card.card-job", {
          timeout: 30000,
        })
        .catch(() => false);

      if (!jobCardsPresent) {
        console.log(`No job cards found on page ${currentPage}`);
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 3) {
          console.log("Three consecutive empty pages found. Stopping scraper.");
          hasMoreJobs = false;
          break;
        }
        currentPage++;
        await listingsPage.close();
        continue;
      }

      consecutiveEmptyPages = 0;

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

      const newJobListings = jobListings.filter((job) => {
        if (!job.jobId || seenJobIds.has(job.jobId)) {
          return false;
        }
        seenJobIds.add(job.jobId);
        return true;
      });

      if (newJobListings.length === 0) {
        console.log(`No new unique jobs found on page ${currentPage}`);
        consecutiveEmptyPages++;
        if (consecutiveEmptyPages >= 3) {
          console.log(
            "Three consecutive pages with no new jobs. Stopping scraper."
          );
          hasMoreJobs = false;
          break;
        }
        currentPage++;
        continue;
      }

      console.log(
        `Found ${newJobListings.length} new unique jobs on page ${currentPage}`
      );

      for (const job of newJobListings) {
        try {
          if (job.detailUrl) {
            const detailPage = await browser.newPage();
            await detailPage.setDefaultNavigationTimeout(60000);
            await detailPage.setDefaultTimeout(30000);

            await detailPage.goto(job.detailUrl, {
              waitUntil: "networkidle0",
              timeout: 60000,
            });

            await detailPage.waitForSelector(".cms-content", {
              timeout: 30000,
            });

            const details = await detailPage.evaluate(() => {
              const descriptionContent = document.querySelector(".cms-content");
              const description = descriptionContent
                ? descriptionContent.innerText
                    .replace(/\s+/g, " ")
                    .replace(/\n+/g, "\n")
                    .trim()
                : "";

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

            job.description = details.description || "No description available";
            job.postedOn = details.postedOn || "";

            await detailPage.close();
            console.log(`Successfully scraped details for: ${job.title}`);
          }
        } catch (error) {
          console.error(
            `Error getting job details for ${job.title}: ${error.message}`
          );
          job.description = "Error fetching details";
          job.postedOn = "";
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await csvWriter.writeRecords(
        newJobListings.map((job) => ({
          ...job,
          sno: ++globalCounter,
        }))
      );

      console.log(
        `Scraped ${newJobListings.length} new jobs from page ${currentPage}`
      );
      console.log(`Total unique jobs scraped so far: ${globalCounter}`);

      await new Promise((resolve) => setTimeout(resolve, 3000));
      currentPage++;
    }
  } catch (error) {
    console.error(`Error scraping jobs: ${error.message}`);
    throw error;
  } finally {
    await browser.close();
  }

  console.log(`Scraping complete. Total unique jobs scraped: ${globalCounter}`);
  return globalCounter;
}

module.exports = { scrapeJobs };
