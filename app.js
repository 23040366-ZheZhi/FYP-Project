const express = require('express');

const mysql = require('mysql2');

const app = express();




const session = require('express-session');
const runExcelConversion = require('./public/scripts/exceltojson.js');
app.use(express.static('public'));



// ---------------- Excel conversion ----------------
runExcelConversion()
.then(() => console.log("Excel files converted successfully on server startup"))
.catch(err => console.error("Excel conversion failed:", err));


//HTTPS module
const https = require('https');
const fs = require('fs');

// Allow Express to detect HTTPS correctly
app.enable('trust proxy');

// Enforce HTTPS
app.use((req, res, next) => {
    if (!req.secure) {
        return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
});

app.use('/videos', express.static('videos'));



app.use(session({
    secret: 'secret123',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1 * 60 * 60 * 1000 }
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

function adminOnly(req, res, next) {
    if (!req.session.isAdmin) {
        return res.redirect('/login');
    }
    next();
}

const nodemailer = require('nodemailer');

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'aarvalanmathiyazhagan@gmail.com',
        pass: 'cxlr feug mhaq xezz'
    }
});

function clearOutputFolder() {
    const outputDir = path.join(__dirname, 'public/output');

    if (!fs.existsSync(outputDir)) return;

    const files = fs.readdirSync(outputDir);
    for (const file of files) {
        if (file.endsWith('.json') || file.endsWith('.csv')) {
            fs.unlinkSync(path.join(outputDir, file));
        }
    }

    console.log("Output folder cleared");
}


const path = require('path');

const multer = require('multer');


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});

const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'videos'),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
    });
const uploadVideo = multer({
     storage: videoStorage,
     limits: {
        fileSize: 80 * 1024 * 1024 // 80 MB file size limit
     },
     fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('/video')) {
            cb(null, true);
        } else {
            cb(new Error("Please upload video files only"))
        }
     }
});

const upload = multer({ storage: storage });


const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'data'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }

    console.log('Connected to MySQL database');
});


app.set('view engine', 'ejs');


app.use(express.static('public'));

app.use(express.urlencoded({
    extended: false
}));


app.use((req, res, next) => {
    if (req.session.disableInteractive === undefined) {
        req.session.disableInteractive = false;
    }
    res.locals.disableInteractive = req.session.disableInteractive;
    next();
});


app.get('/', (req, res) => {
    const sql = 'SELECT * FROM videos ORDER BY position ASC, id ASC';

    connection.query( sql, (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving videos')
        }

        res.render('index', { videos:results });
    });
});

// XLSX upload storage (output folder)
const xlsxStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/excel');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); // keep original name
    }
});

const uploadXlsx = multer({
    storage: xlsxStorage,
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.xlsx')) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx files allowed'));
        }
    }
});

app.post(
    '/upload-xlsx',
    adminOnly,
    uploadXlsx.single('xlsx'),
    async (req, res) => {
        try {
            const excelDir = path.join(__dirname, 'public/excel');

            if (!req.file) {
                return res.status(400).send('No Excel file uploaded');
            }

            console.log('New Excel uploaded:', req.file.originalname);

            // 🧹 STEP 1: Delete ALL old Excel files except the new one
            const files = fs.readdirSync(excelDir);

            for (const file of files) {
                if (
                    file.endsWith('.xlsx') &&
                    file !== req.file.originalname
                ) {
                    fs.unlinkSync(path.join(excelDir, file));
                    console.log(`Deleted old Excel: ${file}`);
                }
            }
            // clear old graph outputs
            clearOutputFolder();

            // Convert latest Excel
            await runExcelConversion();


            console.log('Excel conversion completed (latest Excel only)');

            res.redirect('/manage_graph');
        } catch (err) {
            console.error('Excel upload/conversion failed:', err);
            res.status(500).send('Excel upload failed');
        }
    }
);
app.post('/set-graph-year', adminOnly, (req, res) => {
    const { yearMode } = req.body;

    // allow only safe values
    if (!['current', 'previous', 'both'].includes(yearMode)) {
        return res.status(400).send('Invalid year mode');
    }

    req.session.yearMode = yearMode;
    console.log('Graph year mode set to:', yearMode);

    res.redirect('/manage_graph');
});
app.use((req, res, next) => {
    if (!req.session.yearMode) {
        req.session.yearMode = "current";
    }
    next();
});

app.delete('/delete-xlsx/:filename', adminOnly, (req, res) => {
    const filePath = path.join(__dirname, 'public/excel', req.params.filename);

    fs.unlink(filePath, err => {
        if (err) {
            console.error(err);
            return res.json({ success: false });
        }
        res.json({ success: true });
    });
});


app.get('/game/:id', (req, res) => {
    const id = req.params.id;
 

    if (!Number.isInteger(Number(id))) {
        return res.status(400).send('Invalid game ID');
    }
 
    const sql = 'SELECT * FROM videos WHERE id = ?';
 
    connection.query(sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Internal Server Error');
        }
 
        if (results.length > 0) {
            res.render('video', { video: results[0] });
        } else {
            res.status(404).send('Game not found');
        }
    });
});

app.get('/updateGame/:id', (req ,res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM videos where id = ?';

    connection.query( sql, [id], (error, results) => {
        if (error) {
            console.error('Database query error:', error.message);
            return res.status(500).send('Error retrieving game ID');
        }
        if (results.length > 0) {
            res.render('updateGame', { video: results[0] });
        } else {
            res.status(404).send('Game not found');
        }
    });
});

app.post('/updateGame/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;

    const { name, price, description, age } = req.body;
    let image = req.body.currentImage;
    if (req.file) {
        image = req.file.filename;
    }
 
    const sql = 'UPDATE videos SET name = ? , description = ? , image = ? WHERE id = ?';
 

    connection.query( sql , [name, description, image], (error, results) => {
        if (error) {

            console.error("Error updating game:", error);
            res.status(500).send('Error updating game');
        } else {

            res.redirect('/');
        }
    });
});

app.get('/deleteGame/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'DELETE FROM videos WHERE id = ?';
    connection.query( sql , [id], (error, results) => {
        if (error) {
            console.error("Error deleting game:", error);
            res.status(500).send('Error deleting game');
        } else {
            res.redirect('/');
        }
    });
});


app.get("/api/summary", (req, res) => {
  try {
    // ✅ FRONT DASHBOARD → IGNORE admin yearMode
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

    // ✅ SEND DATA (FRONT GRAPHS)
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
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    delete require.cache[
      require.resolve("./public/output/3_Solar Data.json")
    ];

    const solar = require("./public/output/3_Solar Data.json");

    const getYear = row => {
      // 1️⃣ Prefer explicit year column
      if (row.field1 && /^\d{4}$/.test(row.field1)) {
        return Number(row.field1);
      }

      // 2️⃣ Fallback: Jan-25 → 2025
      const m = String(row.Solar || "").match(/-(\d{2})$/);
      if (m) return 2000 + Number(m[1]);

      return null;
    };

    const filtered = solar.filter(row => {
      const year = getYear(row);
      if (!year) return false;

      if (yearMode === "current") return year === currentYear;
      if (yearMode === "previous") return year === previousYear;
      return true; // both
    });

    res.json(filtered);

  } catch (err) {
    console.error("Solar detailed API error:", err);
    res.status(500).json({ error: "Solar detailed data failed" });
  }
});

// =======================================
// WATER – DETAILED GRAPH (ADMIN YEAR MODE)
// =======================================
app.get("/api/water-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    // clear cache so Excel re-upload works
    delete require.cache[
      require.resolve("./public/output/2_Water Bill.json")
    ];

    const water = require("./public/output/2_Water Bill.json");

    let activeYear = null;

    // 🔑 determine latest year FROM DATA
    const years = water
      .map(r => Number(r.field1))
      .filter(y => Number.isInteger(y));

    const latestYear = Math.max(...years);
    const previousYear = latestYear - 1;

    const filtered = water.filter(row => {
      if (!row.Water || row.Water === "Month") return false;

      // track current year from field1
      if (row.field1 && /^\d{4}$/.test(row.field1)) {
        activeYear = Number(row.field1);
      }
      if (!activeYear) return false;

      // admin year mode filter
      if (yearMode === "current" && activeYear !== latestYear) return false;
      if (yearMode === "previous" && activeYear !== previousYear) return false;
      // both → no filter

      // numeric value check (allow negative, reject 0)
      const value = Number(String(row.field3 || "").replace(/,/g, ""));
      if (!Number.isFinite(value)) return false;
      if (value === 0) return false;

      return true;
    });

    res.json(filtered);

  } catch (err) {
    console.error("Water detailed API error:", err);
    res.status(500).json({ error: "Water detailed data failed" });
  }
});

app.get("/api/electric-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[
      require.resolve("./public/output/1_Elec Bill.json")
    ];

    const electricity = require("./public/output/1_Elec Bill.json");

    // Detect years dynamically (future-proof)
    const years = electricity
      .map(r => Number(r.field1))
      .filter(y => Number.isInteger(y));

    const latestYear = Math.max(...years);
    const previousYear = latestYear - 1;

    let activeYear = null;

    const filtered = electricity.filter(row => {
      if (!row.Elect || row.Elect === "Month") return false;

      if (row.field1 && /^\d{4}$/.test(row.field1)) {
        activeYear = Number(row.field1);
      }
      if (!activeYear) return false;

      if (yearMode === "current" && activeYear !== latestYear) return false;
      if (yearMode === "previous" && activeYear !== previousYear) return false;

      const value = Number(String(row.field3 || "").replace(/,/g, ""));
      return Number.isFinite(value);
    });

    res.json(filtered);

  } catch (err) {
    console.error("Electric detailed API error:", err);
    res.status(500).json({ error: "Electric detailed data failed" });
  }
});
// =======================================
// WASTE – DETAILED GRAPH (ADMIN YEAR MODE)
// =======================================
app.get("/api/waste-detailed", (req, res) => {
  try {
    const yearMode = req.session.yearMode || "current";

    delete require.cache[
      require.resolve("./public/output/4_Waste and Recycled (Pivot).json")
    ];

    const waste = require("./public/output/4_Waste and Recycled (Pivot).json");

    // 🔑 Extract years dynamically
    const years = waste
      .map(r => {
        const m = String(r["General & Recyclable Waste"] || "")
          .match(/-(\d{4})$/);
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

    const fyTotals = waste.filter(row =>
      /^FY\d{4}$/.test(row["General & Recyclable Waste"])
    );

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


app.post('/addVideo', uploadVideo.array('videos[]'), (req, res) => {

    uploadVideo.array('videos[]')(req, res, err => {
        if (err) {
            return (err.message);
        }
    })

    const videoFiles = req.files; //upload video files
    const descriptions = req.body.descriptions; // matching descriptions

    videoFiles.forEach((file, index) => {
        const sql = "INSERT INTO videos (name, description, video, position) VALUES (?, ?, ?, ?)";
        connection.query(sql, [file.originalname, descriptions[index], file.filename, 999], (err) => {    //999 to push to end of sequence
            if (err) console.error(err);
        });
    });

    res.redirect('/sequence');
});

app.delete('/deleteVideo/:id', adminOnly, (req, res) => {
    const id = req.params.id;

    const sql = "DELETE FROM videos WHERE id = ?";
    connection.query(sql, [id], (err) => {
        if (err) {
            console.error("Error deleting video:", err);
            return res.json({ success: false });
        }
        res.json({ success: true });
    });
});







app.get('/purchase', (req, res) => {

    res.render('purchase');
});

app.get('/cardmethod', (req, res) => {
    
    res.render('cardmethod');
});

app.get('/reachingend', (req, res) => {
    
    res.render('reachingend');
});

app.get('/paynow', (req, res) => {
    
    res.render('paynow');
});

app.get('/end', (req, res) => {
    
    res.render('end');
});


//Renders page for adding and sequencing of videos
app.get('/addVideo', adminOnly, (req, res) => {
    res.render('addVideo');
});

// electric graph
app.get('/electgraph', (req, res) => res.render('electgraph'));
// water graph
app.get('/watergraph', (req, res) => res.render('watergraph'));
// solar graph
app.get('/solargraph', (req, res) => res.render('solargraph'));
// wastegraph
app.get('/waste', (req, res) => res.render('waste'));
// IndivWater
app.get('/indivwater', (req, res) => res.render('IndivWater'));
// IndivEnergy
app.get('/indivelect', (req, res) => res.render('Indivelect'));

//only accessible by admin to sequence videos
app.get('/sequence', adminOnly, (req, res) => {
    connection.query("SELECT * FROM videos ORDER BY position ASC, id ASC", (err, results) => {
        if (err) return res.status(500).send("Error loading videos");

        res.render('sequence', { videos: results });
    });
});
app.get('/manage_graph', adminOnly, (req, res) => {
    const excelDir = path.join(__dirname, 'public/excel');

    fs.readdir(excelDir, (err, files) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Failed to load excel files');
        }

        const xlsxFiles = files.filter(f => f.endsWith('.xlsx'));
       res.render('manage_graph', {
        files: xlsxFiles,
        yearMode: req.session.yearMode || 'current'
    });

    });
});




//
app.post('/sequence', adminOnly, (req, res) => {
    console.log("BODY: ", req.body);
    console.log("ORDER RECEIVED: ", req.body.order);


    const orderArray = req.body.order.split(",");

    orderArray.forEach((id, index) => {
        connection.query("UPDATE videos SET position=? WHERE id=?", [index, id]);
    });

    res.redirect('/');
});


// LOGIN PAGE
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});


app.post('/login', (req, res) => {
    const { username, password, email } = req.body;

    const sql = "SELECT * FROM admins WHERE username = ? AND password = ?";
    connection.query(sql, [username, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.render('login', { error: 'Server error' });
        }

        if (results.length === 0) {
            return res.render('login', { error: 'Invalid username or password' });
        }

        const admin = results[0];

        // If 2FA disabled in DB → login directly
        if (admin.twofa_enabled === 0) {
            req.session.isAdmin = true;
            return res.redirect('/');
        }

        // Otherwise send 2FA code
        const code = Math.floor(100000 + Math.random() * 900000);

        req.session.tempAdmin = {
            id: admin.id,
            email: admin.email,
            code
        };

        transporter.sendMail({
            from: "usec0750@gmail.com",
            to: admin.email,
            subject: "Your Admin Login Code",
            text: `Your verification code is: ${code}`
        });

        res.redirect('/verify');
    });
});


app.get('/verify', (req, res) => {
    if (!req.session.tempAdmin) return res.redirect('/login');
    res.render('verify', { error: null });
});

app.post('/verify', (req, res) => {
    const { code } = req.body;

    if (!req.session.tempAdmin) return res.redirect('/login');

    if (parseInt(code) === req.session.tempAdmin.code) {
        req.session.isAdmin = true;
        delete req.session.tempAdmin;
        return res.redirect('/');
    }

    res.render('verify', { error: 'Incorrect verification code' });
});


app.get('/toggle-off', adminOnly, (req, res) => {
    req.session.disableInteractive = true;
    res.redirect('/');
});

app.get('/toggle-on', adminOnly, (req, res) => {
    req.session.disableInteractive = false;
    res.redirect('/');
});


app.get('/logout', (req, res) => {
    req.session.isAdmin = false;     // logout admin
    // DO NOT reset disableInteractive
    res.redirect('/');
});

app.get('/create-admin', adminOnly, (req, res) => {
    res.render('createAdmin');
});

app.post('/create-admin', adminOnly, (req, res) => {
    const { username, password, email, twofa } = req.body;

    const sql = `
        INSERT INTO admins (username, password, email, twofa_enabled)
        VALUES (?, ?, ?, ?)
    `;

    connection.query(
        sql,
        [username, password, email, twofa ? 1 : 0],
        err => {
            if (err) {
                console.error(err);
                return res.send("Error creating admin");
            }
            res.redirect('/');
        }
    );
});

app.get('/admins', adminOnly, (req, res) => {
    const sql = "SELECT id, username, email, twofa_enabled FROM admins";
    connection.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.send("Error loading admins");
        }
        res.render('admins', { admins: results });
    });
});

// Edit admin page
app.get('/admins/edit/:id', adminOnly, (req, res) => {
    const sql = "SELECT * FROM admins WHERE id = ?";
    connection.query(sql, [req.params.id], (err, results) => {
        if (err || results.length === 0) return res.redirect('/admins');
        res.render('editAdmin', { admin: results[0] });
    });
});

// Save admin changes
app.post('/admins/edit/:id', adminOnly, (req, res) => {
    const { email, password, twofa } = req.body;

    const sql = `
        UPDATE admins 
        SET email = ?, password = ?, twofa_enabled = ?
        WHERE id = ?
    `;

    connection.query(
        sql,
        [email, password, twofa ? 1 : 0, req.params.id],
        err => {
            if (err) console.error(err);
            res.redirect('/admins');
        }
    );
});

app.post('/admins/delete/:id', adminOnly, (req, res) => {
    const sql = "DELETE FROM admins WHERE id = ?";
    connection.query(sql, [req.params.id], err => {
        if (err) console.error(err);
        res.redirect('/admins');
    });
});


const PORT = process.env.PORT || 3000;

//app.listen(PORT, () => console.log(`SERVER RUNNING ON PORT --> http://localhost:${PORT}`));

//HTTPS module 2
const httpsOptions = {
    key: fs.readFileSync('./cert/mtls/server.key'),
    cert: fs.readFileSync('./cert/mtls/server.crt'),
    ca: fs.readFileSync('./cert/mtls/ca.crt'),
    requestCert: true,
    rejectUnauthorized: true
};


https.createServer(httpsOptions, app)
    .listen(PORT, () => {
        console.log(`HTTPS Server running at https://localhost:${PORT}`);
    });
