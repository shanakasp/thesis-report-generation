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
const fetchJobDataAccenture = async (startPage = 1, endPage = Infinity) => {
  const jobListings = [];
  let currentPage = startPage;

  try {
    while (currentPage <= endPage) {
      const url = `https://www.accenture.com/in-en/careers/jobsearch?jk=&sb=1&vw=0&is_rj=0&pg=${currentPage}`;
      console.log(`Fetching data from: ${url}`); // Log URL

      const response = await axios.get(url);
      if (response.status !== 200) {
        console.error(`Failed to fetch data: ${response.status}`);
        return jobListings; // Return empty list if fetch fails
      }

      const $ = cheerio.load(response.data);

      // Parse job data - Adjust selectors based on actual HTML structure
      $(".job-card").each((_, element) => {
        const jobId = $(element).attr("data-job-id") || ""; // Modify based on actual attribute or class
        const title = $(element).find(".job-title").text().trim(); // Adjust selector
        const location = $(element).find(".job-location").text().trim(); // Adjust selector
        const description = $(element).find(".job-description").text().trim(); // Adjust selector
        const postedOn = $(element).find(".posted-date").text().trim() || ""; // Adjust selector

        jobListings.push({
          company: "Accenture",
          jobId,
          title,
          location,
          description,
          postedOn,
        });
      });

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
  fastCsv
    .write(data, { headers: true })
    .pipe(ws)
    .on("finish", () => console.log(`Data saved to ${outputFilePath}`));
};

// Main function to execute the scraping
const main = async () => {
  const startPage = 1; // Adjust as necessary
  const endPage = 3; // Adjust as necessary

  const jobData = await fetchJobDataAccenture(startPage, endPage);
  saveOutputCsv("Accenture", jobData);
};

// Execute the main function
main().catch((error) => console.error(error));
