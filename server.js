const express = require("express");
const fs = require("fs");
const XLSX = require("xlsx");
const path = require("path");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const DATA_FILE = "data.json";
const USERS_FILE = "users.json";
const SECRET = "supersecretkey"; // later veranderen voor veiligheid
const PORT = process.env.PORT || 3000;

function load(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= AUTH =================

// REGISTER
app.post("/register", (req, res) => {
  const { email, password } = req.body;
  let users = load(USERS_FILE);

  if (users.find(u => u.email === email)) {
    return res.status(400).send("Account bestaat al");
  }

  users.push({ email, password });
  save(USERS_FILE, users);

  res.send("Account aangemaakt");
});

// LOGIN
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  let users = load(USERS_FILE);

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).send("Foute login");

  const token = jwt.sign({ email }, SECRET);
  res.json({ token });
});

// AUTH MIDDLEWARE
function auth(req, res, next) {
  const token = req.headers["authorization"];
  if (!token) return res.sendStatus(403);

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded.email;
    next();
  } catch {
    res.sendStatus(401);
  }
}

// ================= TIME TRACKING =================

// INKLOKKEN
app.post("/inklokken", auth, (req, res) => {
  let data = load(DATA_FILE);

  data.push({
    user: req.user,
    start: new Date(),
    end: null,
    hours: 0
  });

  save(DATA_FILE, data);
  res.send("Ingeklokt");
});

// UITKLOKKEN
app.post("/uitklokken", auth, (req, res) => {
  let data = load(DATA_FILE);

  const entry = data.find(e => e.user === req.user && !e.end);
  if (!entry) return res.send("Geen actieve sessie");

  entry.end = new Date();

  let uren = (new Date(entry.end) - new Date(entry.start)) / (1000 * 60 * 60);

  if (uren > 6) uren -= 0.5; // pauze

  entry.hours = Math.round(uren * 100) / 100;

  save(DATA_FILE, data);
  res.send("Uitgeklokt");
});

// DATA OPHALEN
app.get("/export", auth, (req, res) => {
  let data = load(DATA_FILE);
  res.json(data.filter(d => d.user === req.user));
});

// EXPORT EXCEL
app.get("/export", auth, (req, res) => {
  let data = load(DATA_FILE).filter(d => d.user === req.user);

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, ws, "Uren");

  const filePath = path.join(__dirname, "uren.xlsx");
  XLSX.writeFile(wb, filePath);

  res.download(filePath);
});

app.listen(3000, () => {
  console.log("Server draait op http://localhost:3000");
});

app.listen(PORT, () => {
  console.log("Server draait op port " + PORT);
});