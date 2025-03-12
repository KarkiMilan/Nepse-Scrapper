import { test, expect } from '@playwright/test';
import * as fs from 'fs';

test('scrape nepal stock floor sheet', async ({ page }) => {
  const dataFileName = 'nepal_stock_floorsheet.json';

  interface FloorSheetEntry {
    SN: string;
    "Contract No.": string;
    "Stock Symbol": string;
    Buyer: string;
    Seller: string;
    Quantity: string;
    "Rate (Rs)": string;
    "Amount (Rs)": string;
  }

  let floorSheetData: FloorSheetEntry[] = [];

  if (fs.existsSync(dataFileName)) {
    const existingData = fs.readFileSync(dataFileName, 'utf8');
    floorSheetData = JSON.parse(existingData);
    console.log('Resuming from previously scraped data...');
  }

  try {
    await page.goto('https://www.nepalstock.com/floor-sheet');
    await page.getByRole('combobox').selectOption('500');
    await page.getByRole('button', { name: 'Filter' }).click();
    await page.waitForTimeout(2000);

    let pageNumber = 1;
    let isLastPage = false;
    const allPagesData: FloorSheetEntry[] = []; 
    while (!isLastPage) {
      console.log(`Scraping page ${pageNumber}`);

      const pageData: FloorSheetEntry[] = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));
        return rows
          .map(row => {
            const cells = row.querySelectorAll('td');

            const isTotalRow = (row as HTMLElement).innerText.includes('Total Amount:') || (row as HTMLElement).innerText.includes('Total Turnover:');
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
          })
          .filter(entry => entry !== null); 
      });

      allPagesData.push(...pageData);

      // verify "Next" button is disabled
      const nextButton = await page.locator('//li[contains(@class, "pagination-next")]');
      const isNextButtonDisabled = await nextButton.evaluate(button => button.classList.contains('disabled'));

      isLastPage = isNextButtonDisabled;

      if (!isLastPage) {
        await nextButton.click();
        await page.waitForTimeout(1000); 
      }
      pageNumber++;
    }

    // save all  data
    fs.writeFileSync(dataFileName, JSON.stringify(allPagesData, null, 2), 'utf8');
    console.log(`All data saved to ${dataFileName}`);

  } catch (error) {
    console.error("Unexpected error:", error);
    fs.writeFileSync(dataFileName, JSON.stringify(floorSheetData, null, 2), 'utf8');
    console.log(`Data saved to ${dataFileName} due to unexpected error.`);
  }
});
