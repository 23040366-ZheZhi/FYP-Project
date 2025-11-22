const fs = require("fs");
const path = require("path");

function readJson(filename) {
    const jsonFile = path.join(__dirname, "../output", filename); // go up to output folder
    if (!fs.existsSync(jsonFile)) throw new Error(`JSON file not found: ${jsonFile}`);
    const jsonData = fs.readFileSync(jsonFile, "utf-8");
    return JSON.parse(jsonData);
}

module.exports = readJson;
