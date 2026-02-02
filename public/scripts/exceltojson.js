const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const csv = require("csvtojson");


const excelFolder = path.join(__dirname, "../excel");
const outputFolder = path.join(__dirname, "../output");


if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}


function safeFileName(name) {
  return name.replace(/[/\?%*:|"<>]/g, "_");
}


function parseNumber(v) {
  const n = Number(String(v || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

async function runExcelConversion() {
  if (!fs.existsSync(excelFolder)) {
    throw new Error(`Excel folder not found: ${excelFolder}`);
  }

  const files = fs.readdirSync(excelFolder).filter(f => f.endsWith(".xlsx"));

  for (const file of files) {
    const filePath = path.join(excelFolder, file);
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
      console.log(`Processing ${file} - sheet: ${sheetName}`);

      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const safeName = safeFileName(sheetName);
      const csvFilePath = path.join(outputFolder, `${safeName}.csv`);
      const jsonFilePath = path.join(outputFolder, `${safeName}.json`);

      
      if (sheetName !== "1.1_Individual Pod") {
        const csvData = XLSX.utils.sheet_to_csv(sheet);
        fs.writeFileSync(csvFilePath, csvData);

        const jsonArray = await csv().fromString(csvData);
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonArray, null, 4));

        console.log(`Standard JSON saved: ${jsonFilePath}`);
        continue;
      }

      
      const output = [];
      let currentYear = null;
      let headers = [];

      for (const row of rows) {
        if (!row.length) continue;

        const firstCell = String(row[0] || "").trim();

        
        const yearMatch = firstCell.match(/^CY(\d{4})/);
        if (yearMatch) {
          currentYear = Number(yearMatch[1]);
          continue;
        }

        
        if (firstCell === "BUILDING NAME") {
          headers = row.slice(1);
          continue;
        }

        
        if (!currentYear) continue;

        // Month row
        const month = firstCell;
        if (!month) continue;

        const record = {
          year: currentYear,
          month
        };

        headers.forEach((h, i) => {
          record[h] = parseNumber(row[i + 1]);
        });

        output.push(record);
      }

      fs.writeFileSync(jsonFilePath, JSON.stringify(output, null, 4));
      console.log(`✅ Normalized JSON saved: ${jsonFilePath}`);
    }
  }
}

module.exports = runExcelConversion;
