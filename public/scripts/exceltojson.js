const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const csv = require("csvtojson");

// Folder containing Excel files
const excelFolder = path.join(__dirname, "../excel"); // points to public/excel
const outputFolder = path.join(__dirname, "../output"); // adjust relative to project root

// Create output folder if it doesn't exist
if (!fs.existsSync(outputFolder)) {
fs.mkdirSync(outputFolder, { recursive: true });
}

// Replace illegal filename characters for Windows
function safeFileName(name) {
return name.replace(/[/\?%*:|"<>]/g, "_");
}

async function runExcelConversion() {
if (!fs.existsSync(excelFolder)) {
throw new Error(`Excel folder not found: ${excelFolder}`);
}

``
const files = fs.readdirSync(excelFolder).filter(file => file.endsWith(".xlsx"));

for (const file of files) {
    const filePath = path.join(excelFolder, file);
    const workbook = XLSX.readFile(filePath);

    for (const sheetName of workbook.SheetNames) {
        console.log(`Processing ${file} - sheet: ${sheetName}`);

        const csvData = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        const safeName = safeFileName(sheetName); // use only sheet name

        const csvFilePath = path.join(outputFolder, `${safeName}.csv`);
        const jsonFilePath = path.join(outputFolder, `${safeName}.json`);

        fs.writeFileSync(csvFilePath, csvData);
        console.log(`✔ CSV saved: ${csvFilePath}`);

        const jsonArray = await csv().fromString(csvData);
        fs.writeFileSync(jsonFilePath, JSON.stringify(jsonArray, null, 4));
        console.log(`✔ JSON saved: ${jsonFilePath}`);
    }
}
``

}

module.exports = runExcelConversion;
