const puppeteer = require("puppeteer");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

async function scrapeJobDescription(page, jobUrl) {
  try {
    await page.goto(jobUrl, { waitUntil: "domcontentloaded" }); // Faster load

    // Wait for description element
    await page.waitForSelector(".jd-description", { timeout: 8000 });

    const description = await page.evaluate(() => {
      const descElement = document.querySelector(".jd-description");
      if (!descElement) return "";

      const processNode = (node) => {
        let result = "";

        if (node.nodeType === Node.TEXT_NODE) {
          result += node.textContent.trim() + " ";
        } else if (node.nodeName === "BR") {
          result += "\n";
        } else if (node.nodeName === "LI") {
          result += "\n• " + node.textContent.trim();
        } else if (node.nodeName === "P") {
          result += "\n" + node.textContent.trim() + "\n";
        } else {
          for (const child of node.childNodes) {
            result += processNode(child);
          }
        }
        return result;
      };

      return processNode(descElement)
        .replace(/\s+/g, " ")
        .replace(/\n\s+/g, "\n")
        .trim();
    });

    return description;
  } catch (error) {
    console.error(`Error scraping job description: ${error.message}`);
    return "Failed to load description";
  }
}

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
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  // Enable request interception to block images, CSS, and fonts
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    if (["image", "stylesheet", "font"].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  let globalCounter = 0;

  try {
    let currentPage = startPage;
    let hasMoreJobs = true;

    while (hasMoreJobs && (!endPage || currentPage <= endPage)) {
      console.log(`Scraping page ${currentPage}...`);

      const pageUrl = `${baseUrl}&p=${currentPage}`;
      await page.goto(pageUrl, { waitUntil: "domcontentloaded" }); // Use faster load

      // Wait for job cards to load
      await page
        .waitForSelector(".bx--card__content", { timeout: 8000 })
        .catch(() => null);

      const jobs = await page.evaluate((pageNum) => {
        const jobCards = document.querySelectorAll(
          ".bx--card-group__cards__col"
        );
        const jobDetails = [];

        for (const card of Array.from(jobCards)) {
          const link = card.querySelector("a");
          if (!link) continue;

          const jobUrl = link.href;
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
            const text = innerDetails.innerHTML;
            const parts = text.split("<br>").map((part) => part.trim());
            professionalLevel = parts[0] || "";
            location = parts[1] ? parts[1].replace(/,\s*IN/g, "").trim() : "";
          }

          jobDetails.push({
            company: "IBM",
            jobId: `REQ${jobId}`,
            title: titleElement ? titleElement.textContent.trim() : "",
            location: location,
            function: functionElement ? functionElement.textContent.trim() : "",
            description: "",
            postedOn: new Date().toISOString().split("T")[0],
            page: pageNum,
            url: jobUrl,
          });
        }

        return jobDetails;
      }, currentPage);

      if (jobs.length === 0) {
        console.log(`No jobs found on page ${currentPage}. Stopping.`);
        hasMoreJobs = false;
        break;
      }

      for (const job of jobs) {
        console.log(`Fetching description for job ${job.jobId}...`);
        const description = await scrapeJobDescription(page, job.url);
        job.description = description;
        delete job.url;

        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      await csvWriter.writeRecords(
        jobs.map((job, idx) => ({
          ...job,
          sno: globalCounter + idx + 1,
        }))
      );

      globalCounter += jobs.length;
      console.log(`Scraped jobs from IBM page ${currentPage}`);

      await new Promise((resolve) => setTimeout(resolve, 2000));
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
