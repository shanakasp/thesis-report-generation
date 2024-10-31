const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobs(baseUrl, startPage, endPage) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "Syngene.csv"),
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

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;
    let globalCounter = 0;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      // Create a new page for the job listings
      const listingsPage = await browser.newPage();
      const startrow = (currentPage - 1) * 25;
      const pageUrl = `${baseUrl}&startrow=${startrow}`;

      // Navigate to the listings page
      await listingsPage.goto(pageUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });
      await listingsPage.waitForSelector(".data-row", { timeout: 60000 });

      // Get all jobs on the current page
      const jobs = await listingsPage.evaluate((pageNum) => {
        const jobRows = document.querySelectorAll(".data-row");
        return Array.from(jobRows).map((row) => {
          const getTextContent = (selector, parent = row) => {
            const element = parent.querySelector(selector);
            return element ? element.textContent.trim() : "";
          };

          return {
            company: "Syngene",
            jobId: getTextContent(".jobFacility"),
            function: getTextContent(".jobDepartment"),
            location: getTextContent(".jobLocation")
              .replace(", India", "")
              .trim(),
            title: getTextContent(".jobTitle-link"),
            postedOn: getTextContent(".jobDate"),
            page: pageNum,
          };
        });
      }, currentPage);

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      // Create a new page for job details that we'll reuse
      const detailPage = await browser.newPage();

      // Process each job
      for (let i = 0; i < jobs.length; i++) {
        try {
          await listingsPage.bringToFront();

          const titleSelector = `.data-row:nth-child(${i + 1}) .jobTitle-link`;
          await listingsPage.waitForSelector(titleSelector, { timeout: 30000 });

          const jobUrl = await listingsPage.$eval(
            titleSelector,
            (el) => el.href
          );

          // Navigate to the job detail page
          await detailPage.goto(jobUrl, {
            waitUntil: "networkidle0",
            timeout: 60000,
          });

          // Wait for the description container
          await detailPage.waitForSelector(".jobdescription", {
            timeout: 30000,
          });

          // Extract the full description including all content and formatting
          const description = await detailPage.evaluate(() => {
            const descContainer = document.querySelector(".jobdescription");
            if (!descContainer) return "";

            // Get all text content while preserving basic formatting
            const processNode = (node) => {
              let text = "";
              node.childNodes.forEach((child) => {
                if (child.nodeType === 3) {
                  // Text node
                  text += child.textContent.trim() + " ";
                } else if (child.nodeType === 1) {
                  // Element node
                  const tagName = child.tagName.toLowerCase();
                  if (
                    tagName === "br" ||
                    tagName === "p" ||
                    tagName === "div"
                  ) {
                    text += "\n";
                  }
                  if (tagName === "li") {
                    text += "• ";
                  }
                  text += processNode(child);
                  if (tagName === "li") {
                    text += "\n";
                  }
                }
              });
              return text;
            };

            let fullText = processNode(descContainer);

            // Clean up unwanted characters
            fullText = fullText
              .replace(/\s+\n/g, "\n")
              .replace(/\n\s+/g, "\n")
              .replace(/\n+/g, "\n")
              .replace(/â€¢|â€“|Â|Â /g, "") // Removes unwanted symbols
              .replace(/â€™/g, "'") // Replaces specific symbols with correct ones
              .trim();

            return fullText;
          });

          jobs[i].description = description;
          console.log(
            `Successfully scraped full description for: ${jobs[i].title}`
          );

          // Add delay between job detail scraping
          await new Promise((resolve) => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(
            `Error scraping job details for ${jobs[i].title}: ${error.message}`
          );
          jobs[i].description = "Error fetching description";
        }
      }

      // Close the detail page
      await detailPage.close();
      await listingsPage.close();

      // Write data to CSV and update globalCounter
      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(
        `Scraped ${jobs.length} jobs from Syngene Page ${currentPage}`
      );

      // Add delay before next page
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
