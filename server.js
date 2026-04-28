const express = require("express");
const XLSX = require("xlsx");
const path = require("path");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

const USERS_FILE = "users.json";
const SECRET = "supersecretkey";
const SHEETS_API_URL = process.env.SHEETS_API_URL;

function load(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ================= AUTH =================

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

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  let users = load(USERS_FILE);

  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).send("Foute login");

  const token = jwt.sign({ email }, SECRET);
  res.json({ token });
});

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

// ================= GOOGLE SHEETS =================

async function sheetsPost(data) {
  return fetch(SHEETS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
}

async function sheetsGet() {
  const res = await fetch(SHEETS_API_URL);
  return res.json();
}

// ================= TIME =================

app.post("/inklokken", auth, async (req, res) => {
  await sheetsPost({
    action: "clockIn",
    user: req.user,
    start: new Date().toISOString()
  });

  res.send("Ingeklokt");
});

app.post("/uitklokken", auth, async (req, res) => {
  const data = await sheetsGet();

  const last = [...data].reverse().find(d => d.user === req.user && !d.end);

  if (!last) return res.send("Geen actieve sessie");

  const end = new Date();
  let uren = (end - new Date(last.start)) / (1000 * 60 * 60);

  if (uren > 6) uren -= 0.5;

  uren = Math.round(uren * 100) / 100;

  await sheetsPost({
    action: "clockOut",
    user: req.user,
    end: end.toISOString(),
    hours: uren
  });

  res.send("Uitgeklokt");
});

const ADMIN_EMAIL = "kimwikkerink9@gmail.com";

app.get("/data", auth, async (req, res) => {
  const data = await sheetsGet();

  if (req.user === ADMIN_EMAIL) {
    return res.json(data); // admin ziet alles
  }

  res.json(data.filter(d => d.user === req.user));
});

app.get("/export", auth, async (req, res) => {
  const data = await sheetsGet();
  const userData = data.filter(d => d.user === req.user);

  const ws = XLSX.utils.json_to_sheet(userData.length ? userData : [{
    user: req.user,
    start: "",
    end: "",
    hours: ""
  }]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Uren");

  const filePath = path.join(__dirname, "uren.xlsx");
  XLSX.writeFile(wb, filePath);

  res.download(filePath);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server draait op port " + PORT);
});