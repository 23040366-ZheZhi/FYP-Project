const express = require("express");
const mysql = require("mysql2");
const https = require("https");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();

/* trust proxy */
app.enable("trust proxy");

/* static */
app.use(express.static("public"));
app.use("/videos", express.static("videos"));

/* rotation.json loader */
const ROT_FILE = path.join(__dirname, "rotation.json");

function readRotateCfg() {
  try {
    return JSON.parse(fs.readFileSync(ROT_FILE, "utf8"));
  } catch (e) {
    return { enabled: false, idleSeconds: 30, routes: ["/"] };
  }
}

app.use((req, res, next) => {
  res.locals.rotateCfg = readRotateCfg();
  next();
});

/* enforce HTTPS */
app.use((req, res, next) => {
  if (!req.secure) return res.redirect("https://" + req.headers.host + req.url);
  next();
});

/* session */
app.use(
  session({
    name: "esg-admin-session",
    secret: "secret123",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 60 * 60 * 1000,
      secure: true,
      httpOnly: true,
      sameSite: "none"
    }
  })
);

app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.disableInteractive = req.session.disableInteractive;
  next();
});



app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function adminOnly(req, res, next) {
  if (!req.session.isAdmin) return res.redirect("/login");
  next();
}

app.get("/manage-rotation", adminOnly, (req, res) => {
  res.render("manage_rotation", { cfg: readRotateCfg() });
});

app.post("/manage-rotation", adminOnly, (req, res) => {
  const enabled = req.body.enabled === "on";

  const idleSeconds = Math.max(
    5,
    Math.min(600, Number(req.body.idleSeconds) || 30)
  );

  const routes = String(req.body.routes || "")
    .split("\n")
    .map(r => r.trim())
    .filter(Boolean)
    .map(r => (r.startsWith("/") ? r : "/" + r));

  fs.writeFileSync(
    ROT_FILE,
    JSON.stringify({ enabled, idleSeconds, routes }, null, 2),
    "utf8"
  );

  res.redirect("/manage-rotation");
});


/* defaults */
app.use((req, res, next) => {
  if (!req.session.yearMode) req.session.yearMode = "current";
  if (!req.session.graphType) req.session.graphType = "bar";
  if (!req.session.individualMode) req.session.individualMode = "interactive";
  if (req.session.disableInteractive === undefined) req.session.disableInteractive = false;
  next();
});

/* locals */
app.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.individualMode = req.session.individualMode;
  res.locals.disableInteractive = req.session.disableInteractive;
  next();
});

/* excel conversion */
const runExcelConversion = require("./public/scripts/exceltojson.js");

runExcelConversion()
  .then(() => console.log("Excel files converted successfully on server startup"))
  .catch(err => console.error("Excel conversion failed:", err));

/* nodemailer */
let transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "aarvalanmathiyazhagan@gmail.com",
    pass: "REPLACE_WITH_GMAIL_APP_PASSWORD"
  }
});

function clearOutputFolder() {
  const outputDir = path.join(__dirname, "public/output");

  if (!fs.existsSync(outputDir)) return;

  const files = fs.readdirSync(outputDir);
  for (const file of files) {
    if (file.endsWith(".json") || file.endsWith(".csv")) {
      fs.unlinkSync(path.join(outputDir, file));
    }
  }

  console.log("Output folder cleared");
}

/* uploads */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/images"),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "videos"),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});

const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/") || file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only video and image files are allowed"));
  }
});

const upload = multer({ storage });

/* db */
const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "data"
});

connection.connect(err => {
  if (err) {
    console.error("Error connecting to MySQL:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

app.set("view engine", "ejs");

/* settings api */
app.get("/api/graph-settings", (req, res) => {
  res.json({
    yearMode: req.session.yearMode,
    graphType: req.session.graphType,
    individualMode: req.session.individualMode
  });
});

app.post("/set-individual-settings", adminOnly, (req, res) => {
  const { individualMode } = req.body;

  if (!["interactive", "non-interactive"].includes(individualMode)) {
    return res.status(400).send("Invalid individual mode");
  }

  req.session.individualMode = individualMode;
  console.log("Individual mode set to:", individualMode);

  res.redirect("/manage_graph");
});

/* disableInteractive toggle locals already handled above */

/* home */
app.get("/", (req, res) => {
  const sql = "SELECT * FROM videos ORDER BY position ASC, id ASC";

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Database query error:", error.message);
      return res.status(500).send("Error retrieving videos");
    }

    res.render("dashboard", { videos: results });
  });
});

/* xlsx upload */
const xlsxStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "public/excel"),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const uploadXlsx = multer({
  storage: xlsxStorage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".xlsx")) cb(null, true);
    else cb(new Error("Only .xlsx files allowed"));
  }
});

app.post("/upload-xlsx", adminOnly, uploadXlsx.single("xlsx"), async (req, res) => {
  try {
    const excelDir = path.join(__dirname, "public/excel");

    if (!req.file) return res.status(400).send("No Excel file uploaded");

    console.log("New Excel uploaded:", req.file.originalname);

    const files = fs.readdirSync(excelDir);
    for (const file of files) {
      if (file.endsWith(".xlsx") && file !== req.file.originalname) {
        fs.unlinkSync(path.join(excelDir, file));
        console.log(`Deleted old Excel: ${file}`);
      }
    }

    clearOutputFolder();
    await runExcelConversion();

    console.log("Excel conversion completed (latest Excel only)");
    res.redirect("/manage_graph");
  } catch (err) {
    console.error("Excel upload/conversion failed:", err);
    res.status(500).send("Excel upload failed");
  }
});

app.post("/set-graph-year", adminOnly, (req, res) => {
  const { yearMode } = req.body;

  if (!["current", "previous", "both"].includes(yearMode)) {
    return res.status(400).send("Invalid year mode");
  }

  req.session.yearMode = yearMode;
  console.log("Graph year mode set to:", yearMode);

  res.redirect("/manage_graph");
});

app.delete("/delete-xlsx/:filename", adminOnly, (req, res) => {
  const filePath = path.join(__dirname, "public/excel", req.params.filename);

  fs.unlink(filePath, err => {
    if (err) {
      console.error(err);
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});

app.get("/updateGame/:id", (req, res) => {
  const id = req.params.id;
  const sql = "SELECT * FROM videos where id = ?";

  connection.query(sql, [id], (error, results) => {
    if (error) {
      console.error("Database query error:", error.message);
      return res.status(500).send("Error retrieving game ID");
    }
    if (results.length > 0) res.render("updateGame", { video: results[0] });
    else res.status(404).send("Game not found");
  });
});

app.post("/updateGame/:id", upload.single("image"), (req, res) => {
  const id = req.params.id;

  const { name, price, description, age } = req.body;
  let image = req.body.currentImage;
  if (req.file) image = req.file.filename;

  const sql = "UPDATE videos SET name = ? , description = ? , image = ? WHERE id = ?";

  connection.query(sql, [name, description, image, id], error => {
    if (error) {
      console.error("Error updating game:", error);
      return res.status(500).send("Error updating game");
    }
    res.redirect("/");
  });
});


/* summary api */
app.get("/api/summary", (req, res) => {
  try {
    const electricity = require("./public/output/1_Elec Bill.json");
    const water = require("./public/output/2_Water Bill.json");
    const solar = require("./public/output/3_Solar Data.json");
    const waste = require("./public/output/4_Waste and Recycled (Pivot).json");

    const cleanNum = v => Number(String(v ?? "").replace(/,/g, "").trim());

    const isMonthLike = s => {
      const str = String(s ?? "").trim();
      if (!str) return false;
      if (/^\d{4}$/.test(str)) return false;
      return true;
    };

    const pickMonthFromRow = r => {
      for (const k of Object.keys(r || {})) {
        if (isMonthLike(r[k])) return String(r[k]).trim();
      }
      return "";
    };

    const toMonthlySeries = (rows, valueKey = "field3") =>
      rows
        .slice(1)
        .map(r => ({
          month: pickMonthFromRow(r),
          value: cleanNum(r[valueKey])
        }))
        .filter(x => x.month && Number.isFinite(x.value));

    const lastN = 6;

    const eSeries = toMonthlySeries(electricity).slice(-lastN);
    const sSeries = toMonthlySeries(solar).slice(-lastN);
    const wSeries = toMonthlySeries(water).slice(-lastN);

    const wasteSeries = waste
      .map(r => ({
        month: String(r["General & Recyclable Waste"] || "").trim(),
        value: cleanNum(r.field2)
      }))
      .filter(x => x.month && Number.isFinite(x.value))
      .slice(-lastN);

    res.json({
      labels: eSeries.map(x => x.month),
      energy: eSeries.map(x => x.value),
      solar: sSeries.map(x => x.value),
      water: wSeries.map(x => x.value),
      waste: wasteSeries.map(x => x.value)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Summary data load failed" });
  }
});

app.get("/api/solar-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[require.resolve("./public/output/3_Solar Data.json")];
    const solar = require("./public/output/3_Solar Data.json");

    const getYear = row => {
      if (row.field1 && /^\d{4}$/.test(String(row.field1).trim())) return Number(row.field1);
      const m = String(row.Solar || "").match(/-(\d{2})$/);
      if (m) return 2000 + Number(m[1]);
      return null;
    };

    const years = solar.map(getYear).filter(y => Number.isFinite(y));
    const latestYear = years.length ? Math.max(...years) : null;
    const previousYear = latestYear ? latestYear - 1 : null;

    const filtered = solar.filter(row => {
      const year = getYear(row);
      if (!year) return false;
      if (String(row?.Solar ?? "").toLowerCase() === "month") return false;

      if (yearMode === "current") return year === latestYear;
      if (yearMode === "previous") return year === previousYear;
      return true;
    });

    res.json({ yearMode, latestYear, previousYear, data: filtered });
  } catch (err) {
    console.error("Solar detailed API error:", err);
    res.status(500).json({ error: "Solar detailed data failed" });
  }
});

app.get("/api/water-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[require.resolve("./public/output/2_Water Bill.json")];
    const water = require("./public/output/2_Water Bill.json");

    let activeYear = null;

    const years = water.map(r => Number(r.field1)).filter(y => Number.isInteger(y));
    const latestYear = years.length ? Math.max(...years) : null;
    const previousYear = latestYear ? latestYear - 1 : null;

    const filtered = water.filter(row => {
      if (!row.Water || row.Water === "Month") return false;

      if (row.field1 && /^\d{4}$/.test(String(row.field1))) activeYear = Number(row.field1);
      if (!activeYear) return false;

      if (yearMode === "current" && activeYear !== latestYear) return false;
      if (yearMode === "previous" && activeYear !== previousYear) return false;

      const value = Number(String(row.field3 || "").replace(/,/g, ""));
      if (!Number.isFinite(value)) return false;
      if (value === 0) return false;

      return true;
    });

    res.json({ yearMode, latestYear, previousYear, data: filtered });
  } catch (err) {
    console.error("Water detailed API error:", err);
    res.status(500).json({ error: "Water detailed data failed" });
  }
});

app.get("/api/electric-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[require.resolve("./public/output/1_Elec Bill.json")];
    const electricity = require("./public/output/1_Elec Bill.json");

    const years = electricity.map(r => Number(r.field1)).filter(y => Number.isInteger(y));
    const latestYear = years.length ? Math.max(...years) : null;
    const previousYear = latestYear ? latestYear - 1 : null;

    let activeYear = null;

    const filtered = electricity.filter(row => {
      if (!row.Elect || row.Elect === "Month") return false;

      if (row.field1 && /^\d{4}$/.test(String(row.field1))) activeYear = Number(row.field1);
      if (!activeYear) return false;

      if (yearMode === "current" && activeYear !== latestYear) return false;
      if (yearMode === "previous" && activeYear !== previousYear) return false;

      const value = Number(String(row.field3 || "").replace(/,/g, ""));
      return Number.isFinite(value);
    });

    res.json({ yearMode, latestYear, previousYear, data: filtered });
  } catch (err) {
    console.error("Electric detailed API error:", err);
    res.status(500).json({ error: "Electric detailed data failed" });
  }
});

app.get("/api/waste-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[require.resolve("./public/output/4_Waste and Recycled (Pivot).json")];
    const waste = require("./public/output/4_Waste and Recycled (Pivot).json");

    const years = waste
      .map(r => {
        const m = String(r["General & Recyclable Waste"] || "").match(/-(\d{4})$/);
        return m ? Number(m[1]) : null;
      })
      .filter(y => Number.isInteger(y));

    const latestYear = Math.max(...years);
    const previousYear = latestYear - 1;

    const monthlyRows = waste.filter(row => {
      const label = row["General & Recyclable Waste"];
      if (!/^[A-Za-z]{3}-\d{4}$/.test(label)) return false;

      const year = Number(label.slice(-4));
      if (yearMode === "current" && year !== latestYear) return false;
      if (yearMode === "previous" && year !== previousYear) return false;

      return true;
    });

    const fyTotals = waste.filter(row => /^FY\d{4}$/.test(row["General & Recyclable Waste"]));

    res.json({
      monthly: monthlyRows,
      totals: fyTotals,
      yearMode,
      latestYear,
      previousYear
    });
  } catch (err) {
    console.error("Waste detailed API error:", err);
    res.status(500).json({ error: "Waste detailed data failed" });
  }
});

app.get("/api/water-individual", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[require.resolve("./public/output/2.1_Individual Pod.json")];
    const data = require("./public/output/2.1_Individual Pod.json");

    if (!Array.isArray(data) || data.length < 2) return res.json([]);

    const header = data[0];
    const rows = data.slice(1);

    const getYear = val => {
      const m = String(val || "").match(/^(\d{2})-/);
      return m ? 2000 + Number(m[1]) : null;
    };

    const years = rows.map(r => getYear(r[Object.keys(header)[0]])).filter(y => Number.isInteger(y));
    if (!years.length) return res.json([header]);

    const latestYear = Math.max(...years);
    const previousYear = latestYear - 1;

    const filteredRows = rows.filter(r => {
      const year = getYear(r[Object.keys(header)[0]]);
      if (!year) return false;

      if (yearMode === "current") return year === latestYear;
      if (yearMode === "previous") return year === previousYear;
      return true;
    });

    res.json([header, ...filteredRows]);
  } catch (err) {
    console.error("Individual water API error:", err);
    res.status(500).json({ error: "Individual water load failed" });
  }
});

app.get("/api/electric-building", (req, res) => {
  const yearMode = req.session.yearMode || "current";

  const data = require("./public/output/1.1_Individual Pod.json");

  const years = [...new Set(data.map(r => r.year))].sort();
  const latestYear = Math.max(...years);
  const previousYear = latestYear - 1;

  let filtered;
  if (yearMode === "current") filtered = data.filter(r => r.year === latestYear);
  else if (yearMode === "previous") filtered = data.filter(r => r.year === previousYear);
  else filtered = data.filter(r => r.year === latestYear || r.year === previousYear);

  res.json({
    yearMode,
    latestYear,
    previousYear,
    data: filtered
  });
});

app.post("/addVideo", uploadVideo.array("videos[]"), (req, res) => {
  const videoFiles = req.files || [];
  const descriptionsRaw = req.body.descriptions || [];
  const descriptions = Array.isArray(descriptionsRaw) ? descriptionsRaw : [descriptionsRaw];

  if (videoFiles.length === 0) {
    return res.status(400).send("No files uploaded. Please select a video/image file.");
  }

  videoFiles.forEach((file, index) => {
    const sql = "INSERT INTO videos (name, description, video, position) VALUES (?, ?, ?, ?)";
    connection.query(sql, [file.originalname, descriptions[index] || "", file.filename, 999], err => {
      if (err) console.error(err);
    });
  });

  res.redirect("/media_management");
});

/* upload error middleware */
app.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).send(`<script>
      alert("Upload failed: Video file size exceeds 100MB.")
      window.history.back();
    </script>`);
  }
  if (err) {
    return res.status(400).send(`<script>
      alert("Upload failed: ${err.message}");
      window.history.back();
    </script>`);
  }
  next();
});

app.post("/deleteVideo/:id", adminOnly, (req, res) => {
  const id = req.params.id;
  const vidfolder = __dirname + "/videos/";

  const getSql = "SELECT video FROM videos WHERE id = ?";
  connection.query(getSql, [id], (err, results) => {
    if (err) {
      console.error("Error finding video", err);
      return res.status(500).send("Error finding video");
    }
    if (results.length === 0) return res.redirect("/media_management");

    const filename = results[0].video;
    const filePath = vidfolder + filename;

    fs.unlink(filePath, err2 => {
      if (err2) {
        console.error("Failed to delete file:", err2);
        return res.status(500).send("Failed to delete video file");
      }

      const deletefile = "DELETE FROM videos WHERE id= ?";
      connection.query(deletefile, [id], err3 => {
        if (err3) {
          console.error("Error deleting video record:", err3);
          return res.status(500).send("Error deleting video");
        }
        res.redirect("/media_management");
      });
    });
  });
});

app.get("/purchase", (req, res) => res.render("purchase"));
app.get("/cardmethod", (req, res) => res.render("cardmethod"));
app.get("/paynow", (req, res) => res.render("paynow"));

app.get("/addVideo", adminOnly, (req, res) => res.render("addVideo"));

app.get("/electgraph", (req, res) => res.render("electgraph"));
app.get("/watergraph", (req, res) => res.render("watergraph"));
app.get("/solargraph", (req, res) => res.render("solargraph"));
app.get("/waste", (req, res) => res.render("waste"));

app.get("/indivwater", (req, res) => {
  const mode = req.session.individualMode || "interactive";
  if (mode === "interactive") return res.render("IndivWater");
  return res.render("IndivWater_noninteractive");
});

app.get("/indivelect", (req, res) => {
  const mode = req.session.individualMode || "interactive";
  if (mode === "interactive") return res.render("Indivelect");
  return res.render("Indivelect_noninteractive");
});

app.get("/media_management", adminOnly, (req, res) => {
  connection.query("SELECT * FROM videos ORDER BY position ASC, id ASC", (err, results) => {
    if (err) return res.status(500).send("Error loading videos");
    res.render("media_management", { videos: results });
  });
});

app.get("/manage_graph", adminOnly, (req, res) => {
  const excelDir = path.join(__dirname, "public/excel");

  fs.readdir(excelDir, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Failed to load excel files");
    }

    const xlsxFiles = files.filter(f => f.endsWith(".xlsx"));

    res.render("manage_graph", {
      files: xlsxFiles,
      yearMode: req.session.yearMode || "current",
      graphType: req.session.graphType || "bar",
      individualMode: req.session.individualMode || "interactive"
    });
  });
});

app.post("/set-graph-format", adminOnly, (req, res) => {
  const { graphType } = req.body;

  if (!["bar", "line"].includes(graphType)) {
    return res.status(400).send("Invalid graph type");
  }

  req.session.graphType = graphType;
  console.log("Graph type set to:", graphType);

  res.redirect("/manage_graph");
});

app.post("/media_management", adminOnly, (req, res) => {
  console.log("BODY: ", req.body);
  console.log("ORDER RECEIVED: ", req.body.order);

  const orderArray = req.body.order.split(",");

  orderArray.forEach((id, index) => {
    connection.query("UPDATE videos SET position=? WHERE id=?", [index, id]);
  });

  res.redirect("/");
});

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", (req, res) => {
  const { username, password, email } = req.body;

  const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";
  connection.query(sql, [username, password], (err, results) => {
    if (err) {
      console.error(err);
      return res.render("login", { error: "Server error" });
    }

    if (results.length === 0) {
      return res.render("login", { error: "Invalid username or password" });
    }

    const admin = results[0];

    if (admin.email !== email) {
      return res.render("login", { error: "Sorry, this email is not linked to this account" });
    }

    if (admin.twofa_enabled === 0) {
      req.session.isAdmin = true;
      return res.redirect("/");
    }

    const code = Math.floor(100000 + Math.random() * 900000);

    req.session.tempAdmin = { id: admin.id, email: admin.email, code };

    transporter.sendMail({
      from: "usec0750@gmail.com",
      to: admin.email,
      subject: "Your Admin Login Code",
      text: `Your verification code is: ${code}`
    });

    res.redirect("/verify");
  });
});

app.get("/verify", (req, res) => {
  if (!req.session.tempAdmin) return res.redirect("/login");
  res.render("verify", { error: null });
});

app.post("/verify", (req, res) => {
  const { code } = req.body;

  if (!req.session.tempAdmin) return res.redirect("/login");

  if (parseInt(code) === req.session.tempAdmin.code) {
    req.session.isAdmin = true;
    delete req.session.tempAdmin;
    return res.redirect("/");
  }

  res.render("verify", { error: "Incorrect verification code" });
});

app.get("/toggle-off", adminOnly, (req, res) => {
  req.session.disableInteractive = true;
  res.redirect("/");
});

app.get("/toggle-on", adminOnly, (req, res) => {
  req.session.disableInteractive = false;
  res.redirect("/");
});

app.get("/logout", (req, res) => {
  const keepDisable = req.session.disableInteractive;

  req.session.isAdmin = false;
  delete req.session.tempAdmin;

  req.session.disableInteractive = keepDisable;

  res.redirect("/");
});

app.get("/create-admin", adminOnly, (req, res) => res.render("createAdmin"));

app.post("/create-admin", adminOnly, (req, res) => {
  const { username, password, email, twofa } = req.body;

  const sql = `
        INSERT INTO admins (username, password, email, twofa_enabled)
        VALUES (?, ?, ?, ?)
    `;

  connection.query(sql, [username, password, email, twofa ? 1 : 0], err => {
    if (err) {
      console.error(err);
      return res.send("Error creating admin");
    }
    res.redirect("/");
  });
});

app.get("/admins", adminOnly, (req, res) => {
  const sql = "SELECT id, username, email, twofa_enabled FROM admins";
  connection.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      return res.send("Error loading admins");
    }
    res.render("admins", { admins: results });
  });
});

app.get("/admins/edit/:id", adminOnly, (req, res) => {
  const sql = "SELECT * FROM admins WHERE id = ?";
  connection.query(sql, [req.params.id], (err, results) => {
    if (err || results.length === 0) return res.redirect("/admins");
    res.render("editAdmin", { admin: results[0] });
  });
});

app.post("/admins/edit/:id", adminOnly, (req, res) => {
  const { email, password, twofa } = req.body;

  const sql = `
        UPDATE admins
        SET email = ?, password = ?, twofa_enabled = ?
        WHERE id = ?
    `;

  connection.query(sql, [email, password, twofa ? 1 : 0, req.params.id], err => {
    if (err) console.error(err);
    res.redirect("/admins");
  });
});

app.post("/admins/delete/:id", adminOnly, (req, res) => {
  const sql = "DELETE FROM admins WHERE id = ?";
  connection.query(sql, [req.params.id], err => {
    if (err) console.error(err);
    res.redirect("/admins");
  });
});

const PORT = process.env.PORT || 3000;

const httpsOptions = {
  key: fs.readFileSync("./cert/mtls/server.key"),
  cert: fs.readFileSync("./cert/mtls/server.crt"),
  ca: fs.readFileSync("./cert/mtls/ca.crt"),
  requestCert: true,
  rejectUnauthorized: true
};

https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`HTTPS Server running at https://localhost:${PORT}`);
});
