const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const requiredFiles = [
  "package.json",
  "package-lock.json",
  "server.js",
  "railway.json",
  "database/schema.sql",
  "scripts/setup-db.js",
  "scripts/db-config.js",
  "assets/garcita-logo.svg",
  "assets/garcita-main.js",
  "assets/garcita-hero-3d.js",
  "assets/vendor/three.module.js",
  "assets/garcita-panel-ios.jpeg",
  "assets/garcita-diamantes.jpeg",
  "assets/garcita-instagram.jpeg",
  "assets/garcita-fragmentos.jpeg"
];

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`Falta archivo requerido: ${file}`);
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.start !== "node scripts/setup-db.js && node server.js") {
  fail("package.json debe tener start = node scripts/setup-db.js && node server.js");
}

const railwayJson = JSON.parse(read("railway.json"));
if (railwayJson.deploy?.startCommand !== "npm start") fail("railway.json debe usar npm start");
if (railwayJson.deploy?.healthcheckPath !== "/health") fail("railway.json debe usar /health");

const schema = read("database/schema.sql");
for (const table of ["users", "products", "sales", "analytics_events", "settings"]) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) fail(`schema.sql no crea ${table}`);
}
if (!schema.includes("whatsapp_click")) fail("schema.sql debe usar whatsapp_click");

for (const file of ["server.js", "scripts/setup-db.js", "scripts/db-config.js", "assets/garcita-main.js"]) {
  new vm.Script(read(file), { filename: file });
}
new vm.Script(read("assets/garcita-hero-3d.js").replace(/^import[^\n]+\n/, ""), { filename: "assets/garcita-hero-3d.js" });

const dbEnvBackup = { ...process.env };
process.env.MYSQLHOST = "mysql.railway.internal";
process.env.MYSQLPORT = "3306";
process.env.MYSQLUSER = "root";
process.env.MYSQLPASSWORD = "secret";
process.env.MYSQLDATABASE = "railway";
delete process.env.MYSQL_URL;
const { getDbConfig } = require("./db-config");
const { config, database } = getDbConfig({ includeDatabase: true, multipleStatements: true });
Object.assign(process.env, dbEnvBackup);

if (config.host !== "mysql.railway.internal") fail("db-config no detecto MYSQLHOST");
if (config.port !== 3306) fail("db-config no detecto MYSQLPORT");
if (config.user !== "root") fail("db-config no detecto MYSQLUSER");
if (config.password !== "secret") fail("db-config no detecto MYSQLPASSWORD");
if (database !== "railway" || config.database !== "railway") fail("db-config no detecto MYSQLDATABASE");

const stalePatterns = [
  new RegExp(["local", "host"].join(""), "i"),
  /127\.0\.0\.1/i,
  new RegExp(["dis", "cord"].join(""), "i"),
  new RegExp(["fire", "cheat"].join(""), "i"),
  new RegExp(["Sx", "nsi"].join(""), "i"),
  new RegExp(["INICIAR", "-SERVIDOR"].join(""), "i"),
  new RegExp(["CREAR", "-TABLAS"].join(""), "i")
];
for (const file of ["index.html", "admin.html", "server.js", "assets/garcita-main.js", "database/schema.sql", "package.json", "README.md", "PASOS-RAILWAY.md", "railway.json"]) {
  const content = read(file);
  for (const pattern of stalePatterns) {
    if (pattern.test(content)) fail(`Referencia antigua encontrada en ${file}: ${pattern}`);
  }
}

console.log("Verificacion Railway OK");
