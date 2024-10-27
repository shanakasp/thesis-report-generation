const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const fastCsv = require("fast-csv");

// Define the path for input and output
const inputFilePath = path.join(__dirname, "./input.csv");
const outputDirectory = path.join(__dirname, "./output");

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDirectory)) {
  fs.mkdirSync(outputDirectory);
}

// Function to read input CSV
const readInputCsv = () => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(inputFilePath)
      .pipe(fastCsv.parse({ headers: true }))
      .on("data", (row) => results.push(row))
      .on("end", () => resolve(results))
      .on("error", (error) => reject(error));
  });
};

// Function to fetch job data from Accenture's job portal
const fetchJobDataAccenture = async (startPage = 1, maxPages = 100) => {
  const jobListings = [];
  let currentPage = startPage;

  try {
    while (currentPage <= maxPages) {
      const url = `https://www.accenture.com/in-en/careers/jobsearch?jk=&sb=1&vw=0&is_rj=0&pg=${currentPage}`;
      console.log(`Fetching data from: ${url}`);

      const response = await axios.get(url);
      if (response.status !== 200) {
        console.error(`Failed to fetch data: ${response.status}`);
        break; // Stop if fetch fails
      }

      const $ = cheerio.load(response.data);

      const jobCountOnPage = $(".cmp-teaser__title").length;
      if (jobCountOnPage === 0) {
        console.log("No jobs found on this page. Exiting...");
        break; // Exit loop if no jobs found
      }

      $(".cmp-teaser__title").each((_, element) => {
        const title = $(element).text().trim(); // Job title
        const location = $(element)
          .siblings(".cmp-teaser__pretitle")
          .text()
          .trim(); // Job location

        const descriptionElement = $(element).parent(); // Parent of title for description
        const description = descriptionElement
          .find("span")
          .last()
          .text()
          .trim(); // Job description

        const postedOn =
          descriptionElement
            .find(".cmp-teaser__job-listing-posted-date")
            .text()
            .trim() || ""; // Posted date

        const skills = descriptionElement
          .text()
          .match(/Must have skills : (.+?)Good to have skills :/);
        const mustHaveSkills = skills ? skills[1].trim() : ""; // Must-have skills extraction

        const jobId = `${currentPage}-${title
          .replace(/\s+/g, "-")
          .toLowerCase()}`; // Simple job ID generation

        // Push job details into the jobListings array
        jobListings.push({
          S_No: jobListings.length + 1, // S.No. starts from 1
          Company: "Accenture",
          Job_ID: jobId,
          Function: mustHaveSkills, // Assuming function refers to must-have skills
          Location: location,
          Title: title,
          Description: description,
          Posted_On: postedOn,
        });
      });

      console.log(`Found ${jobCountOnPage} jobs on page ${currentPage}.`);

      currentPage++;
    }
  } catch (error) {
    console.error(`Error fetching data for Accenture: ${error.message}`);
  }

  console.log("Fetched job data:", jobListings); // Log job data before returning
  return jobListings;
};

// Function to save output to CSV
const saveOutputCsv = (company, data) => {
  const outputFilePath = path.join(outputDirectory, `${company}.csv`);
  const ws = fs.createWriteStream(outputFilePath);

  // Check if data is available before writing
  if (data.length === 0) {
    console.error("No data available to save.");
    return;
  }

  fastCsv
    .write(data, { headers: true })
    .pipe(ws)
    .on("finish", () => console.log(`Data saved to ${outputFilePath}`))
    .on("error", (error) =>
      console.error(`Error writing to CSV: ${error.message}`)
    );
};

// Main function to execute the scraping
const main = async () => {
  const startPage = 1; // Start from page 1
  const maxPages = 300; // Specify the maximum number of pages to scrape

  const jobData = await fetchJobDataAccenture(startPage, maxPages);

  // Log job data before saving to CSV
  console.log("Job Data to be saved:", jobData);

  saveOutputCsv("Accenture", jobData);
};

// Execute the main function
main().catch((error) => console.error(error));
