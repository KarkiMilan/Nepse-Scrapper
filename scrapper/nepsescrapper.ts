const { chromium } = require('playwright');
const fs = require('fs');

const DATA_FILE_NAME = 'nepal_stock_floorsheet.json';
const BASE_URL = 'https://www.nepalstock.com/floor-sheet';
const PAGE_SIZE = '500';
const TIMEOUT = 2000;
const SELECTORS = {
  pageSizeDropdown: 'select',
  filterButton: 'button:has-text("Filter")',
  tableRows: 'table tbody tr',
  nextButton: '//li[contains(@class, "pagination-next")]',
};

// Timeout (20 minutes)
const PROCESS_TIMEOUT = 1200000;

let floorSheetData = [];

const FloorSheetEntry = {
  SN: '',
  "Contract No.": '',
  "Stock Symbol": '',
  Buyer: '',
  Seller: '',
  Quantity: '',
  "Rate (Rs)": '',
  "Amount (Rs)": ''
};

async function scrapeNepseData() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  if (fs.existsSync(DATA_FILE_NAME)) {
    const existingData = fs.readFileSync(DATA_FILE_NAME, 'utf8');
    floorSheetData = JSON.parse(existingData);
    console.log('Resuming from previously scraped data...');
  }

  try {
    await page.goto(BASE_URL);
    await page.selectOption(SELECTORS.pageSizeDropdown, PAGE_SIZE);
    await page.click(SELECTORS.filterButton);
    await page.waitForTimeout(TIMEOUT);

    let pageNumber = 1;
    let isLastPage = false;

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Process timed out')), PROCESS_TIMEOUT)
    );

    await Promise.race([
      (async () => {
        while (!isLastPage) {
          console.log(`Scraping page ${pageNumber}`);

          const pageData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('table tbody tr'));
            return rows.map(row => {
              const cells = row.querySelectorAll('td');
              const isTotalRow = row.innerText.includes('Total Amount:') || row.innerText.includes('Total Turnover:');
              if (isTotalRow) return null;
              
              return {
                SN: cells[0]?.innerText.trim() || "",
                "Contract No.": cells[1]?.innerText.trim() || "",
                "Stock Symbol": cells[2]?.innerText.trim() || "",
                Buyer: cells[3]?.innerText.trim() || "",
                Seller: cells[4]?.innerText.trim() || "",
                Quantity: cells[5]?.innerText.trim() || "",
                "Rate (Rs)": cells[6]?.innerText.trim() || "",
                "Amount (Rs)": cells[7]?.innerText.trim() || "",
              };
            }).filter(entry => entry !== null);
          });

          // Add new entries 
          pageData.forEach(entry => {
            if (!floorSheetData.some(item => item["Contract No."] === entry["Contract No."])) {
              floorSheetData.push(entry);
            }
          });

        //last page verification
          const nextButton = await page.locator(SELECTORS.nextButton);
          const isNextButtonDisabled = await nextButton.evaluate(button => button.classList.contains('disabled'));
          isLastPage = isNextButtonDisabled;

          if (!isLastPage) {
            await nextButton.click();
            await page.waitForTimeout(1000);
          }
          pageNumber++;
        }

        //  save the data in bulk
        fs.writeFileSync(DATA_FILE_NAME, JSON.stringify(floorSheetData, null, 2), 'utf8');
        console.log(`All data saved to ${DATA_FILE_NAME}`);
      })(),

      timeoutPromise 
    ]);
  } catch (error) {
    console.error("Unexpected error:", error);
    fs.writeFileSync(DATA_FILE_NAME, JSON.stringify(floorSheetData, null, 2), 'utf8');
    console.log(`Data saved to ${DATA_FILE_NAME} on error.`);
  } finally {
    await browser.close();
  }
}

scrapeNepseData().catch(error => console.error("Scraping failed:", error));
