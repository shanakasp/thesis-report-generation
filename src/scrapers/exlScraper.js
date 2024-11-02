const { Builder, By, Key, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const path = require("path");
const fs = require("fs").promises;

// Helper function for delays
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function for retrying operations
async function retryOperation(operation, maxAttempts = 3, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await delay(delayMs);
    }
  }
}

// New helper function to get function and location
async function getFunctionAndLocation(driver) {
  return await retryOperation(async () => {
    try {
      const ul = await driver.findElement(
        By.css(".card-designation .list-reset.clearfix.listing-inline")
      );
      const lis = await ul.findElements(By.css("li"));

      let functionText = "";
      let locationText = "";

      for (const li of lis) {
        const className = await li.getAttribute("class");
        const text = await li.getText();

        if (className.includes("last-child")) {
          locationText = text.trim();
        } else if (text.trim()) {
          functionText = text.trim();
        }
      }

      return {
        function: functionText,
        location: locationText,
      };
    } catch (error) {
      console.error("Error extracting function/location:", error);
      return {
        function: "",
        location: "",
      };
    }
  });
}

async function scrapeJobs(baseUrl, startPage = 1, endPage = null) {
  const outputDir = path.join(__dirname, "../output");
  await fs.mkdir(outputDir, { recursive: true });

  // Configure Chrome options
  const options = new chrome.Options();
  options.addArguments("--no-sandbox");
  options.addArguments("--disable-dev-shm-usage");
  options.addArguments("--disable-gpu");
  options.addArguments("--window-size=1920,1080");
  options.addArguments("--start-maximized");

  // Create WebDriver
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  // Configure CSV Writer
  const csvWriter = createCsvWriter({
    path: path.join(outputDir, "EXL.csv"),
    header: [
      { id: "sno", title: "S.No." },
      { id: "company", title: "Company" },
      { id: "jobId", title: "Job ID" },
      { id: "function", title: "Function" },
      { id: "location", title: "Location" },
      { id: "title", title: "Title" },
      { id: "description", title: "Description" },
      { id: "postedOn", title: "Posted On" },
      { id: "pageNumber", title: "Page Number" },
    ],
  });

  let jobCounter = 0;
  let currentPageUrl = baseUrl;

  try {
    await driver.get(baseUrl);
    await driver.wait(
      until.elementLocated(By.css(".card-row.card-top-job")),
      10000,
      "Initial job cards not found"
    );

    // Function to scroll and click with enhanced reliability
    async function scrollAndClick(element) {
      await retryOperation(async () => {
        await driver.executeScript(
          "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
          element
        );
        await delay(1000);

        await driver.wait(until.elementIsVisible(element), 5000);
        await driver.wait(until.elementIsEnabled(element), 5000);

        try {
          await element.click();
        } catch (error) {
          await driver.executeScript("arguments[0].click();", element);
        }
      });
    }

    // Get total pages
    const totalPages = await retryOperation(async () => {
      try {
        const totalText = await driver
          .findElement(By.css(".totale-num"))
          .getText();
        return Math.ceil(parseInt(totalText.replace("OF ", "")) / 45);
      } catch (error) {
        console.error("Error getting total pages:", error);
        return 1;
      }
    });

    const effectiveEndPage = endPage
      ? Math.min(endPage, totalPages)
      : totalPages;
    console.log(`Total pages available: ${totalPages}`);
    console.log(`Scraping from page ${startPage} to ${effectiveEndPage}`);

    // Navigate to start page if not first page
    if (startPage > 1) {
      for (let i = 1; i < startPage; i++) {
        const nextButton = await driver.findElement(By.css(".nextview a"));
        await scrollAndClick(nextButton);
        await driver.wait(
          until.elementLocated(By.css(".card-row.card-top-job")),
          10000
        );
        await delay(2000);
      }
      currentPageUrl = await driver.getCurrentUrl();
    }

    // Process each page
    for (
      let currentPage = startPage;
      currentPage <= effectiveEndPage;
      currentPage++
    ) {
      console.log(`Processing page ${currentPage}`);

      if ((await driver.getCurrentUrl()) !== currentPageUrl) {
        await driver.get(currentPageUrl);
        await driver.wait(
          until.elementLocated(By.css(".card-row.card-top-job")),
          10000
        );
      }

      await delay(2000);

      const jobCards = await retryOperation(async () => {
        const cards = await driver.findElements(
          By.css(".card-row.card-top-job")
        );
        if (cards.length === 0) throw new Error("No job cards found");
        return cards;
      });

      // Process each job
      for (let i = 0; i < jobCards.length; i++) {
        try {
          console.log(`Processing job ${i + 1} on page ${currentPage}`);

          const freshJobCards = await retryOperation(async () => {
            const cards = await driver.findElements(
              By.css(".card-row.card-top-job")
            );
            if (cards.length === 0) throw new Error("No job cards found");
            return cards;
          });

          const currentCard = freshJobCards[i];
          if (!currentCard) {
            console.error(`No card found at index ${i}`);
            continue;
          }

          await retryOperation(async () => {
            await driver.executeScript(
              "arguments[0].scrollIntoView({behavior: 'smooth', block: 'center'});",
              currentCard
            );
            await delay(1000);
          });

          const jobLink = await retryOperation(async () => {
            const link = await currentCard.findElement(By.css(".link"));
            if (!link) throw new Error("Job link not found");
            return link;
          });

          const jobUrl = await jobLink.getAttribute("href");
          const jobTitle = await jobLink.getText();
          const jobId = jobUrl
            .split("/")
            .pop()
            .replace("EXL*", "EXL/")
            .replace(/_/g, "/");

          const originalWindow = await driver.getWindowHandle();
          await jobLink.sendKeys(Key.CONTROL, Key.RETURN);

          const windows = await driver.getAllWindowHandles();
          const newWindow = windows.find((handle) => handle !== originalWindow);
          await driver.switchTo().window(newWindow);

          await driver.wait(
            until.elementLocated(By.css(".job-details-card")),
            15000,
            "Job details page did not load"
          );
          await delay(2000);

          // Get function and location using the new method
          const { function: jobFunction, location: jobLocation } =
            await getFunctionAndLocation(driver);

          const jobDetails = {
            sno: ++jobCounter,
            company: "EXL",
            jobId: jobId,
            function: jobFunction,
            location: jobLocation,
            title: jobTitle,
            description: await getCompleteDescription(driver),
            postedOn: await getTextContent(
              driver,
              ".text-bold-cell",
              "Posted On"
            ),
            pageNumber: currentPage,
          };

          await csvWriter.writeRecords([jobDetails]);
          console.log(`Saved job ${jobCounter}: ${jobTitle}`);

          await driver.close();
          await driver.switchTo().window(originalWindow);
          await delay(1500);
        } catch (error) {
          console.error(
            `Error processing job ${i + 1} on page ${currentPage}:`,
            error
          );

          try {
            console.log("Attempting to recover from error...");
            await driver.get(currentPageUrl);
            await delay(3000);
          } catch (recoveryError) {
            console.error("Recovery failed:", recoveryError);
          }
          continue;
        }
      }

      if (currentPage < effectiveEndPage) {
        const nextButton = await driver.findElement(By.css(".nextview a"));
        await scrollAndClick(nextButton);
        await driver.wait(
          until.elementLocated(By.css(".card-row.card-top-job")),
          10000
        );
        currentPageUrl = await driver.getCurrentUrl();
        await delay(2000);
      }
    }

    console.log(
      `Scraping completed successfully. Total jobs saved: ${jobCounter}`
    );
  } catch (error) {
    console.error(`Critical error during scraping: ${error.message}`);
    throw error;
  } finally {
    await driver.quit();
  }
}

// Helper function to get complete description
async function getCompleteDescription(driver) {
  try {
    await driver.wait(
      until.elementLocated(
        By.css(".panel-title.theme-color.fl-left.text-capitalize")
      ),
      10000
    );

    const sections = await driver.findElements(By.css(".panel.panel-open"));
    let fullDescription = [];

    for (const section of sections) {
      const titleElement = await section.findElement(By.css(".panel-title"));
      const title = await titleElement.getText();

      if (
        [
          "Job Description",
          "Basic Section",
          "Skills",
          "Organisational",
        ].includes(title)
      ) {
        const content = await section.findElement(By.css(".panel-body"));
        const text = await content.getText();
        fullDescription.push(`${title}:\n${text}\n`);
      }
    }

    return fullDescription.join("\n");
  } catch (error) {
    console.error("Error getting description:", error);
    return "";
  }
}

// Helper function to get text content safely (for other fields)
async function getTextContent(driver, selector, labelText = null) {
  return await retryOperation(async () => {
    try {
      if (labelText) {
        const elements = await driver.findElements(By.css(selector));
        for (const element of elements) {
          const parentText = await element
            .findElement(By.xpath("./.."))
            .getText();
          if (parentText.includes(labelText)) {
            return await element.getText();
          }
        }
        return "";
      } else {
        const element = await driver.findElement(By.css(selector));
        return await element.getText();
      }
    } catch (error) {
      return "";
    }
  });
}

module.exports = { scrapeJobs };
