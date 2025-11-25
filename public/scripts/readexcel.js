const fs = require("fs");
const path = require("path");

function readJson(filename) {
    const jsonFile = path.join(__dirname, "../output", filename); // go up to output folder
    if (!fs.existsSync(jsonFile)) throw new Error(`JSON file not found: ${jsonFile}`);// check if theres JSON files
    const jsonData = fs.readFileSync(jsonFile, "utf-8");// read the file and ensure is text 
    return JSON.parse(jsonData); //return data as a object
}

module.exports = readJson;//It allows other Node.js files to import and use it with require().
