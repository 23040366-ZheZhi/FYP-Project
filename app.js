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
    saveUninitialized: true,
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
const uploadVideo = multer({ storage: videoStorage });

const upload = multer({ storage: storage });


const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'gamelist',
    port: '3306'
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
            if (!req.file) {
                return res.status(400).send('No Excel file uploaded');
            }

            console.log('Excel uploaded:', req.file.originalname);

            // 🔥 Run conversion immediately after upload
            await runExcelConversion();

            console.log('Excel conversion completed');

            res.redirect('/manage_graph');
        } catch (err) {
            console.error('Excel conversion failed:', err);
            res.status(500).send('Excel conversion failed');
        }
    }
);


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
    const electricity = require("./public/output/1_Elec Bill.json");
    const water = require("./public/output/2_Water Bill.json");
    const solar = require("./public/output/3_Solar Data.json");
    const waste = require("./public/output/4_Waste and Recycled (Pivot).json");


    const cleanNum = v => Number(String(v ?? "").replace(/,/g, "").trim());

    const isMonthLike = s => {
      const str = String(s ?? "").trim();
      if (!str) return false;

      // reject plain year like "2024"
      if (/^\d{4}$/.test(str)) return false;

      // common month formats
      if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s\-\/]?\d{2,4}$/i.test(str)) return true;
      if (/^\d{4}[\-\/]\d{1,2}([\-\/*]\d{1,2})?$/.test(str)) return true; // 2025-08 or 2025/08
      if (/^\d{1,2}[\-\/]\d{4}$/.test(str)) return true; // 08-2025
      return false;
    };

    const pickMonthFromRow = r => {
      // try known keys first
      const preferredKeys = ["Month", "month", "DATE", "Date", "MonthYear", "monthYear", "field1", "field2"];
      for (const k of preferredKeys) {
        if (r && Object.prototype.hasOwnProperty.call(r, k) && isMonthLike(r[k])) {
          return String(r[k]).trim();
        }
      }
      // otherwise scan all fields and pick the first month-like value
      for (const k of Object.keys(r || {})) {
        if (isMonthLike(r[k])) return String(r[k]).trim();
      }
      return "";
    };

    const toMonthlySeries = (rows, valueKey = "field3") => {
      return rows
        .slice(1)
        .map(r => ({ month: pickMonthFromRow(r), value: cleanNum(r[valueKey]) }))
        .filter(x => x.month !== "" && Number.isFinite(x.value));
    };

    const lastN = 6;

    const eSeries = toMonthlySeries(electricity).slice(-lastN);
    const sSeries = toMonthlySeries(solar).slice(-lastN);
    const wSeries = toMonthlySeries(water).slice(-lastN);
    const wasteSeries = waste
        .filter(r => /^[A-Za-z]{3}-\d{4}$/.test(String(r["General & Recyclable Waste"] || "").trim()))
        .map(r => ({
            month: String(r["General & Recyclable Waste"]).trim(),
            value: cleanNum(String(r.field2 ?? "0").replace(/%/g, ""))
        }))
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



app.post('/addVideo', uploadVideo.array('videos[]'), (req, res) => {
    const videoFiles = req.files; //upload video files
    const descriptions = req.body.descriptions; // matching descriptions

    videoFiles.forEach((file, index) => {
        const sql = "INSERT INTO videos (name, description, video, position) VALUES (?, ?, ?, ?)";
        connection.query(sql, [file.originalname, descriptions[index], file.filename, 999], (err) => {                          //999 to push to end of sequence
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
        res.render('manage_graph', { files: xlsxFiles });
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

    if (username === 'admin' && password === 'password') {

        const code = Math.floor(100000 + Math.random() * 900000);

        req.session.tempAdmin = {
            username: username,
            email: email,
            code: code
        };

        transporter.sendMail({
            from: "aarvalanmathiyazhagan@gmail.com",
            to: email,    // <-- Send code to user email
            subject: "Your Admin Login Code",
            text: `Your verification code is: ${code}`
        });

        return res.redirect('/verify');
    }

    res.render('login', { error: 'Invalid username or password' });
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
