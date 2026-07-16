const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const requiredFiles = [
  "package.json",
  "package-lock.json",
  "server.js",
  "railway.json",
  "database/schema.sql",
  "scripts/setup-db.js",
  "scripts/db-config.js",
  "scripts/simulate-railway-start.js",
  "assets/garcita-logo.svg",
  "assets/garcita-main.js",
  "assets/garcita-hero-3d.js",
  "assets/vendor/three.module.js",
  "assets/vendor/three.core.js",
  "assets/garcita-panel-ios.jpeg",
  "assets/garcita-diamantes.jpeg",
  "assets/garcita-instagram.jpeg",
  "assets/garcita-fragmentos.jpeg"
];

const legacyDbKeys = [
  ["DB", "HOST"].join("_"),
  ["DB", "PORT"].join("_"),
  ["DB", "USER"].join("_"),
  ["DB", "PASSWORD"].join("_"),
  ["DB", "NAME"].join("_"),
  ["DB", "DATABASE"].join("_"),
  ["DB", "URL"].join("_"),
  ["DATABASE", "URL"].join("_")
];

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function resetMysqlEnv(overrides = {}) {
  for (const key of Object.keys(process.env)) {
    if (/^MYSQL/i.test(key) || legacyDbKeys.includes(key)) delete process.env[key];
  }
  Object.assign(process.env, overrides);
}

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) fail(`Falta archivo requerido: ${file}`);
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.start !== "node server.js") {
  fail("package.json debe tener start = node server.js");
}
if (packageJson.scripts?.["deploy-start"] !== "node server.js") {
  fail("package.json debe tener deploy-start = node server.js");
}
if (String(packageJson.scripts?.start || "").includes("setup-db")) {
  fail("npm start no debe ejecutar setup-db antes de Express");
}
if (packageJson.scripts?.["simulate:railway"] !== "node scripts/simulate-railway-start.js") {
  fail("package.json debe incluir simulate:railway");
}

const railwayJson = JSON.parse(read("railway.json"));
if (railwayJson.deploy?.startCommand !== "npm start") fail("railway.json debe usar npm start");
if (railwayJson.deploy?.healthcheckPath !== "/health") fail("railway.json debe usar /health");
if (Number(railwayJson.deploy?.healthcheckTimeout || 0) < 120) fail("railway.json necesita un healthcheckTimeout amplio");

const schema = read("database/schema.sql");
for (const table of ["users", "products", "sales", "analytics_events", "settings"]) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) fail(`schema.sql no crea ${table}`);
}
if (!schema.includes("whatsapp_click")) fail("schema.sql debe usar whatsapp_click");

for (const file of [
  "server.js",
  "scripts/setup-db.js",
  "scripts/db-config.js",
  "scripts/simulate-railway-start.js",
  "assets/garcita-main.js"
]) {
  new vm.Script(read(file), { filename: file });
}
new vm.Script(read("assets/garcita-hero-3d.js").replace(/^import[^\n]+\n/, ""), { filename: "assets/garcita-hero-3d.js" });

const serverSource = read("server.js");
if (serverSource.includes("process.exit(")) fail("server.js no debe cerrar el proceso con process.exit()");
if (!serverSource.includes("initializeDatabaseInBackground();")) fail("server.js debe inicializar MySQL en segundo plano");
if (!serverSource.includes("res.status(200).json")) fail("/health debe responder 200 sin consultar MySQL");

const dbConfigSource = read("scripts/db-config.js");
const forbiddenHelperName = ["require", "Value"].join("");
if (dbConfigSource.includes(forbiddenHelperName)) fail(`db-config.js no debe usar ${forbiddenHelperName}()`);
for (const key of legacyDbKeys) {
  if (dbConfigSource.includes(key)) fail(`db-config.js no debe depender de ${key}`);
}

const originalEnv = { ...process.env };
const { getDbConfig, getSafeEnvDiagnostics } = require("./db-config");

resetMysqlEnv({
  MYSQL_URL: "mysql://root:secret@mysql.railway.internal:3306/railway",
  MYSQLHOST: "wrong-host",
  MYSQLPORT: "9999",
  MYSQLUSER: "wrong-user",
  MYSQLPASSWORD: "wrong-password",
  MYSQLDATABASE: "wrong_database"
});
const urlResult = getDbConfig({ includeDatabase: true, multipleStatements: true });
if (urlResult.source !== "MYSQL_URL") fail("db-config no priorizo MYSQL_URL");
if (urlResult.config.host !== "mysql.railway.internal") fail("db-config no tomo host desde MYSQL_URL");
if (urlResult.config.port !== 3306) fail("db-config no tomo port desde MYSQL_URL");
if (urlResult.config.user !== "root") fail("db-config no tomo user desde MYSQL_URL");
if (urlResult.config.password !== "secret") fail("db-config no tomo password desde MYSQL_URL");
if (urlResult.database !== "railway" || urlResult.config.database !== "railway") fail("db-config no tomo database desde MYSQL_URL");

const diagnosticsText = JSON.stringify(getSafeEnvDiagnostics(process.env));
if (diagnosticsText.includes("secret") || diagnosticsText.includes("wrong-password")) {
  fail("El diagnostico de entorno esta exponiendo secretos");
}

const legacyOverrides = {};
for (const key of legacyDbKeys) legacyOverrides[key] = key.endsWith("PASSWORD") ? "legacy-secret" : "legacy-value";
resetMysqlEnv(legacyOverrides);
let missingConfigFailed = false;
try {
  getDbConfig({ includeDatabase: true, multipleStatements: true });
} catch (error) {
  missingConfigFailed = true;
  if (!String(error.stack || error).includes("MYSQL_URL")) fail("El error de configuracion debe mencionar MYSQL_URL");
}
if (!missingConfigFailed) fail("db-config no debe conectarse usando variables antiguas");

resetMysqlEnv({
  MYSQLHOST: "mysql.railway.internal",
  MYSQLPORT: "3306",
  MYSQLUSER: "root",
  MYSQLPASSWORD: "secret",
  MYSQLDATABASE: "railway"
});
const fieldResult = getDbConfig({ includeDatabase: true, multipleStatements: true });
if (fieldResult.config.host !== "mysql.railway.internal") fail("db-config no detecto MYSQLHOST");
if (fieldResult.config.port !== 3306) fail("db-config no detecto MYSQLPORT");
if (fieldResult.config.user !== "root") fail("db-config no detecto MYSQLUSER");
if (fieldResult.config.password !== "secret") fail("db-config no detecto MYSQLPASSWORD");
if (fieldResult.database !== "railway" || fieldResult.config.database !== "railway") fail("db-config no detecto MYSQLDATABASE");

process.env = originalEnv;

const stalePatterns = [
  new RegExp(["local", "host"].join(""), "i"),
  /127\.0\.0\.1/i,
  new RegExp(["INICIAR", "-SERVIDOR"].join(""), "i"),
  new RegExp(["CREAR", "-TABLAS"].join(""), "i")
];
for (const file of [
  "index.html",
  "admin.html",
  "server.js",
  "assets/garcita-main.js",
  "database/schema.sql",
  "package.json",
  "README.md",
  "PASOS-RAILWAY.md",
  "railway.json"
]) {
  const content = read(file);
  for (const pattern of stalePatterns) {
    if (pattern.test(content)) fail(`Referencia antigua encontrada en ${file}: ${pattern}`);
  }
}

if (process.env.SKIP_SIMULATED_SERVER_START !== "1") {
  const simulation = spawnSync(process.execPath, [path.join(root, "scripts", "simulate-railway-start.js")], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    env: { ...originalEnv }
  });
  if (simulation.error) fail(`No se pudo ejecutar la simulacion Railway: ${simulation.error.message}`);
  if (simulation.status !== 0) {
    fail([
      "La simulacion Railway fallo.",
      simulation.stdout,
      simulation.stderr
    ].join("\n"));
  }
}

console.log("Verificacion Railway OK");
