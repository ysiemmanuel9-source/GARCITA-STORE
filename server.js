require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const {
  getDbConfigCandidates,
  getDbSearchOrder,
  hasMysqlConfig,
  logMysqlError,
  printEnvDiagnostics,
  serializeMysqlError,
  summarizeDbCandidate,
  getSafeEnvDiagnostics
} = require("./scripts/db-config");

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "garcita_store_dev_secret";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "garcita_store_admin";
const BRAND_NAME = "GARCITA STORE";
const BRAND_LOGO = "assets/garcita-logo.svg";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3";
const WHATSAPP_NUMBER = "5216863387186";
const CHAT_CLICK_EVENT = "whatsapp_click";
const MYSQL_RETRY_MS = Math.max(5000, Number(process.env.MYSQL_RETRY_MS || 30000));
const ADMIN_DEFAULT_USERNAME = "Garcita9";
const ADMIN_DEFAULT_PASSWORD_HASH = "$2a$10$pAySt1sPQcUqivIlqMZvKe3vq.HeNMWBYG2OZUsBMd45QmNUsZh5W";
const ADMIN_FAILED_LOGIN_LIMIT = 3;
const ADMIN_BLOCK_MS = 24 * 60 * 60 * 1000;
const ADMIN_WARNING_MESSAGE = "Si no eres admin, no pongas mas la contrasena.";
const ADMIN_BLOCK_MESSAGE = "Bloqueado por querer acceder al panel de admin sin permiso ni contrasena.";

const DEFAULT_PRODUCTS = [
  {
    name: "Panel iOS Garcita",
    category: "panel",
    description: "Panel premium para Free Fire con proxy iOS, aim pecho, aim cuello, aim drag, balas mágicas y visuales.",
    imageUrl: "assets/garcita-panel-ios.jpeg",
    oldPrice: null,
    price: 300,
    badge: "panel",
    options: [
      { label: "Semanal", price: "300 MX / 18 dólares" },
      { label: "Mensual", price: "700 MX / 40 dólares" },
      { label: "Primer mes", price: "500 MX / 30 dólares" }
    ]
  },
  {
    name: "Diamantes Free Fire",
    category: "diamantes",
    description: "Recargas de diamantes básicos, VIP y combos para Free Fire. Todo se hace por ID.",
    imageUrl: "assets/garcita-diamantes.jpeg",
    oldPrice: null,
    price: 15,
    badge: "diamantes",
    options: [
      { label: "120 diamantes básicos", price: "15 MX" },
      { label: "341 diamantes básicos", price: "50 MX" },
      { label: "520 diamantes básicos", price: "70 MX" },
      { label: "1166 diamantes básicos", price: "150 MX" },
      { label: "2398 diamantes básicos", price: "330 MX" },
      { label: "6160 diamantes básicos", price: "620 MX" },
      { label: "120 diamantes VIP", price: "18 MX" },
      { label: "341 diamantes VIP", price: "70 MX" },
      { label: "572 diamantes VIP", price: "90 MX" },
      { label: "1166 diamantes VIP", price: "170 MX" },
      { label: "2398 diamantes VIP", price: "365 MX" },
      { label: "6160 diamantes VIP", price: "800 MX" },
      { label: "913 diamantes combo VIP", price: "160 MX" },
      { label: "3563 diamantes combo VIP", price: "570 MX" },
      { label: "8558 diamantes combo VIP", price: "1200 MX" }
    ]
  },
  {
    name: "Seguidores Instagram",
    category: "redes",
    description: "Seguidores para Instagram por link del perfil, con garantía de 20 días.",
    imageUrl: "assets/garcita-instagram.jpeg",
    oldPrice: null,
    price: 50,
    badge: "instagram",
    options: [
      { label: "500 seguidores", price: "50 MX" },
      { label: "1300 seguidores", price: "120 MX" },
      { label: "3700 seguidores", price: "300 MX" },
      { label: "5000 seguidores", price: "450 MX" },
      { label: "7500 seguidores", price: "680 MX" },
      { label: "10000 seguidores", price: "890 MX" },
      { label: "15000 seguidores", price: "1100 MX" }
    ]
  },
  {
    name: "Likes, experiencia y fragmentos",
    category: "free fire",
    description: "Likes básicos, experiencia para cuenta Free Fire, fragmentos y honor clan.",
    imageUrl: "assets/garcita-fragmentos.jpeg",
    oldPrice: null,
    price: 20,
    badge: "servicios",
    options: [
      { label: "Honor clan 380K-420K", price: "500 MX" },
      { label: "Likes básicos 200", price: "20 MX" },
      { label: "Likes básicos 1400", price: "65 MX" },
      { label: "Likes básicos 2800", price: "100 MX" },
      { label: "Likes básicos 4200", price: "140 MX" },
      { label: "Likes básicos 6600", price: "250 MX" },
      { label: "Experiencia cuenta FF 250K", price: "340 MX" },
      { label: "Experiencia cuenta FF 500K", price: "440 MX" },
      { label: "Experiencia cuenta FF 750K", price: "620 MX" },
      { label: "Experiencia cuenta FF 1.5M", price: "1000 MX" },
      { label: "Fragmentos 100", price: "160 MX" },
      { label: "Fragmentos 200", price: "300 MX" },
      { label: "Fragmentos 500", price: "500 MX" },
      { label: "Fragmentos 600", price: "580 MX" }
    ]
  }
];

class DatabaseUnavailableError extends Error {
  constructor(message = "Base de datos no disponible.") {
    super(message);
    this.name = "DatabaseUnavailableError";
    this.statusCode = 503;
  }
}

let pool = null;
let dbRetryTimer = null;
let dbInitializationPromise = null;
const dbState = {
  status: "starting",
  source: null,
  database: null,
  lastAttemptAt: null,
  lastReadyAt: null,
  lastError: null,
  lastErrorDetails: null,
  lastConnectionErrors: [],
  lastSearchOrder: [],
  lastCandidateSources: []
};

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'"],
      upgradeInsecureRequests: null
    }
  }
}));
app.use(cors({
  credentials: true,
  origin: true
}));
app.use(express.json({ limit: "6mb" }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: demasiadas solicitudes. Espera un momento antes de continuar." }
}));
app.use((req, res, next) => {
  let decodedRequest = "";
  try {
    decodedRequest = decodeURIComponent(req.originalUrl || "");
  } catch {
    return res.status(400).json({ error: "Advertencia de seguridad: dirección inválida bloqueada." });
  }
  if (decodedRequest.includes("..") || /<script|javascript:|union\s+select/i.test(decodedRequest)) {
    return res.status(400).json({ error: "Advertencia de seguridad: solicitud bloqueada por actividad sospechosa." });
  }
  next();
});
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 220,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: la API recibió demasiadas solicitudes seguidas." }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Advertencia de seguridad: demasiados intentos de acceso. Espera 15 minutos." }
});
app.use("/api", apiLimiter);
app.use(["/admin", "/admin.html", "/api/admin", "/api/auth"], (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  next();
});
app.use(["/admin", "/admin.html", "/api/admin", "/api/me"], blockAdminAreaIfNeeded);

const eventClients = new Set();
const activeVisitors = new Map();
const adminLoginAttempts = new Map();

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function serializeDbState() {
  return {
    status: dbState.status,
    database: dbState.database,
    source: dbState.source,
    lastAttemptAt: dbState.lastAttemptAt,
    lastReadyAt: dbState.lastReadyAt,
    lastError: dbState.lastError,
    lastErrorDetails: dbState.lastErrorDetails,
    lastConnectionErrors: dbState.lastConnectionErrors,
    lastSearchOrder: dbState.lastSearchOrder,
    lastCandidateSources: dbState.lastCandidateSources
  };
}

function mysqlEnvPresence() {
  return Object.fromEntries(
    Object.entries(getSafeEnvDiagnostics()).map(([key, value]) => [key, Boolean(value.present)])
  );
}

function mysqlConfigSources() {
  try {
    return getDbConfigCandidates({ includeDatabase: true, multipleStatements: true }).map((candidate) => candidate.source);
  } catch {
    return [];
  }
}

function mysqlCandidateSummaries() {
  try {
    return getDbConfigCandidates({ includeDatabase: true, multipleStatements: true }).map(summarizeDbCandidate);
  } catch {
    return [];
  }
}

function setDbState(status, updates = {}) {
  dbState.status = status;
  Object.assign(dbState, updates);
}

function isDatabaseReady() {
  return Boolean(pool) && dbState.status === "ready";
}

function requirePool() {
  if (!pool) {
    throw new DatabaseUnavailableError("La base de datos aun no esta disponible. El servidor sigue activo.");
  }
  return pool;
}

function query(sql, params = {}) {
  return requirePool().execute(sql, params).then(([rows]) => rows);
}

async function closePool() {
  if (!pool) return;
  const previousPool = pool;
  pool = null;
  try {
    await previousPool.end();
  } catch (error) {
    console.warn("No se pudo cerrar el pool MySQL anterior:");
    console.warn(error.stack || error);
  }
}

async function createDatabaseIfNeeded(config, database) {
  const connectionConfig = { ...config };
  delete connectionConfig.database;
  const connection = await mysql.createConnection(connectionConfig);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  } catch (error) {
    logMysqlError(`[server-db] Error ORIGINAL creando la base "${database}". Se intentara usar la base configurada.`, error, {
      database
    });
  } finally {
    await connection.end();
  }
}

async function applySchema(config, database) {
  await createDatabaseIfNeeded(config, database);
  const schemaSql = fs.readFileSync(path.join(__dirname, "database", "schema.sql"), "utf8");
  await requirePool().query(schemaSql);
}

async function ensureSchema() {
  const productColumns = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'purchase_options'`
  );
  if (!productColumns.length) {
    await query("ALTER TABLE products ADD COLUMN purchase_options LONGTEXT NULL AFTER badge");
  }

  const saleColumns = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'selected_option'`
  );
  if (!saleColumns.length) {
    await query("ALTER TABLE sales ADD COLUMN selected_option VARCHAR(220) NULL AFTER price");
  }

  await query("ALTER TABLE sales MODIFY status ENUM('pendiente', 'pagado', 'cancelado', 'entregado') NOT NULL DEFAULT 'pendiente'");
  await query("ALTER TABLE analytics_events MODIFY event_type ENUM('page_view', 'discord_click', 'whatsapp_click', 'buy_click') NOT NULL");
  await query("UPDATE analytics_events SET event_type = 'whatsapp_click' WHERE event_type = 'discord_click'");
  await query("ALTER TABLE analytics_events MODIFY event_type ENUM('page_view', 'whatsapp_click', 'buy_click') NOT NULL");
}

function scheduleDatabaseInitialization(delayMs = MYSQL_RETRY_MS) {
  if (dbRetryTimer) clearTimeout(dbRetryTimer);
  dbRetryTimer = setTimeout(() => {
    dbRetryTimer = null;
    initializeDatabaseInBackground();
  }, delayMs);
  dbRetryTimer.unref();
}

async function initializeDatabaseInBackground() {
  if (dbInitializationPromise) return dbInitializationPromise;

  dbInitializationPromise = (async () => {
    setDbState("connecting", {
      lastAttemptAt: new Date().toISOString(),
      lastError: null,
      lastErrorDetails: null,
      lastConnectionErrors: [],
      lastSearchOrder: getDbSearchOrder(),
      lastCandidateSources: []
    });
    printEnvDiagnostics("server-db");

    let connectionErrors = [];
    let searchOrder = getDbSearchOrder();
    let candidateSummaries = [];

    try {
      const candidates = getDbConfigCandidates({ includeDatabase: true, multipleStatements: true });
      candidateSummaries = candidates.map(summarizeDbCandidate);

      console.log("[server-db] Orden de busqueda MySQL:");
      console.log(JSON.stringify(searchOrder, null, 2));
      console.log("[server-db] Candidatos MySQL detectados (sin contrasenas):");
      console.log(JSON.stringify(candidateSummaries, null, 2));
      setDbState("connecting", {
        lastSearchOrder: searchOrder,
        lastCandidateSources: candidateSummaries
      });

      for (const { config, database, source } of candidates) {
        const candidateSummary = summarizeDbCandidate({ config, database, source });
        try {
          console.log(`[server-db] Intentando conectar MySQL usando: ${source}`);
          console.log("[server-db] Configuracion seleccionada para crear pool (sin contrasena):");
          console.log(JSON.stringify(candidateSummary, null, 2));
          await closePool();
          pool = mysql.createPool(config);
          setDbState("connecting", { database, source, lastError: null, lastErrorDetails: null });

          await applySchema(config, database);
          await requirePool().query("SELECT 1");
          await ensureSchema();
          await syncConfiguredAdmin();
          await syncBrandDefaults();
          await syncDefaultCatalog();

          setDbState("ready", {
            database,
            source,
            lastReadyAt: new Date().toISOString(),
            lastError: null
          });
          console.log(`MySQL conectado correctamente. Base: ${database}. Fuente: ${source}.`);
          return;
        } catch (candidateError) {
          const errorDetails = serializeMysqlError(candidateError);
          connectionErrors.push({
            source,
            candidate: candidateSummary,
            error: errorDetails
          });
          logMysqlError(`[server-db] Error ORIGINAL de mysql2 usando ${source}. Probando siguiente configuracion si existe.`, candidateError, {
            source,
            candidate: candidateSummary
          });
          await closePool();
          setDbState("error", {
            database,
            source,
            lastError: candidateError.stack || String(candidateError),
            lastErrorDetails: errorDetails,
            lastConnectionErrors: connectionErrors,
            lastSearchOrder: searchOrder,
            lastCandidateSources: candidateSummaries
          });
        }
      }

      const finalError = new Error(`No se pudo conectar a MySQL con ninguna configuracion disponible. Revisa lastConnectionErrors para ver el error original de mysql2.`);
      finalError.connectionErrors = connectionErrors;
      throw finalError;
    } catch (error) {
      const errorDetails = serializeMysqlError(error);
      await closePool();
      setDbState(hasMysqlConfig() ? "error" : "waiting_for_config", {
        database: null,
        source: null,
        lastError: error.stack || String(error),
        lastErrorDetails: errorDetails,
        lastConnectionErrors: connectionErrors.length ? connectionErrors : [{
          source: "configuration",
          candidate: null,
          error: errorDetails
        }],
        lastSearchOrder: searchOrder,
        lastCandidateSources: candidateSummaries
      });
      logMysqlError("[server-db] MySQL no esta listo. Error final registrado antes de reintentar:", error, {
        searchOrder,
        candidateSources: candidateSummaries,
        connectionErrors
      });
      scheduleDatabaseInitialization();
    }
  })();

  try {
    await dbInitializationPromise;
  } finally {
    dbInitializationPromise = null;
  }
}

function configuredAdminUsername() {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  return username || ADMIN_DEFAULT_USERNAME;
}

function signToken(user, extra = {}) {
  return jwt.sign({ id: user.id, role: user.role, username: user.username, name: user.name, ...extra }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").map((item) => {
    const index = item.indexOf("=");
    if (index === -1) return ["", ""];
    return [item.slice(0, index).trim(), decodeURIComponent(item.slice(index + 1))];
  }).filter(([key]) => key));
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: IS_PRODUCTION,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const cookies = parseCookies(req);
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookies[SESSION_COOKIE] || "";
  if (!token) return res.status(401).json({ error: "Debes iniciar sesion." });
  if (!isDatabaseReady()) return next(new DatabaseUnavailableError("Panel no disponible hasta que MySQL conecte."));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const rows = await query(
      "SELECT id, role, username, name, active FROM users WHERE id = :id AND active = 1 LIMIT 1",
      { id: decoded.id }
    );
    if (!rows.length) return res.status(401).json({ error: "Sesion desactivada. Inicia sesion nuevamente." });
    req.user = rows[0];
    next();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return next(error);
    res.status(401).json({ error: "Sesion invalida o vencida." });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Acceso solo para administradores." });
  next();
}

function cleanText(value, fallback = "") {
  return String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function cleanLimited(value, fallback, limit) {
  return cleanText(value, fallback).slice(0, limit);
}

function escapeHtml(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requestIdentity(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwardedIp = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : String(forwardedFor || "").split(",")[0];
  return cleanLimited(firstForwardedIp || req.ip || req.socket?.remoteAddress || "unknown", "unknown", 120);
}

function getAdminAttemptRecord(key) {
  if (!adminLoginAttempts.has(key)) {
    adminLoginAttempts.set(key, { failures: 0, blockedUntil: 0 });
  }
  return adminLoginAttempts.get(key);
}

function pruneAdminLoginAttempts() {
  const now = Date.now();
  for (const [key, record] of adminLoginAttempts) {
    if (record.blockedUntil && record.blockedUntil <= now) adminLoginAttempts.delete(key);
  }
}

function getAdminBlock(req) {
  pruneAdminLoginAttempts();
  const key = requestIdentity(req);
  const record = adminLoginAttempts.get(key);
  if (!record?.blockedUntil) return null;
  if (record.blockedUntil <= Date.now()) {
    adminLoginAttempts.delete(key);
    return null;
  }
  return { key, record };
}

function registerAdminLoginFailure(req) {
  pruneAdminLoginAttempts();
  const key = requestIdentity(req);
  const record = getAdminAttemptRecord(key);
  record.failures += 1;
  if (record.failures >= ADMIN_FAILED_LOGIN_LIMIT) {
    record.blockedUntil = Date.now() + ADMIN_BLOCK_MS;
  }
  return {
    failures: record.failures,
    remaining: Math.max(0, ADMIN_FAILED_LOGIN_LIMIT - record.failures),
    blocked: Boolean(record.blockedUntil),
    blockedUntil: record.blockedUntil ? new Date(record.blockedUntil).toISOString() : null
  };
}

function clearAdminLoginFailures(req) {
  adminLoginAttempts.delete(requestIdentity(req));
}

function sendAdminLoginFailure(req, res) {
  const attempt = registerAdminLoginFailure(req);
  if (attempt.blocked) {
    return res.status(403).json({
      error: ADMIN_BLOCK_MESSAGE,
      blocked: true,
      attempts: attempt.failures,
      blockedUntil: attempt.blockedUntil
    });
  }
  return res.status(401).json({
    error: `${ADMIN_WARNING_MESSAGE} Intento ${attempt.failures} de ${ADMIN_FAILED_LOGIN_LIMIT}.`,
    attempts: attempt.failures,
    attemptsRemaining: attempt.remaining
  });
}

function adminBlockPayload(record) {
  return {
    error: ADMIN_BLOCK_MESSAGE,
    blocked: true,
    blockedUntil: record.blockedUntil ? new Date(record.blockedUntil).toISOString() : null
  };
}

function blockAdminLoginIfNeeded(req, res, next) {
  const block = getAdminBlock(req);
  if (!block) return next();
  return res.status(403).json(adminBlockPayload(block.record));
}

function renderAdminBlockPage(blockedUntil) {
  const untilText = blockedUntil ? new Date(blockedUntil).toLocaleString("es-MX") : "mas tarde";
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acceso bloqueado | ${escapeHtml(BRAND_NAME)}</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; color: #fff; background: radial-gradient(circle at 25% 20%, rgba(255,37,56,.28), transparent 34%), #03050b; }
    main { width: min(92vw, 560px); padding: 34px; border: 1px solid rgba(255,37,56,.55); border-radius: 18px; background: rgba(18,5,8,.86); box-shadow: 0 30px 90px rgba(0,0,0,.45); }
    h1 { margin: 0 0 12px; font-size: clamp(30px, 6vw, 54px); line-height: 1; }
    p { margin: 0 0 18px; font-size: 18px; line-height: 1.55; color: rgba(255,255,255,.82); }
    strong { color: #ff4051; }
  </style>
</head>
<body>
  <main>
    <h1>Acceso bloqueado</h1>
    <p><strong>${escapeHtml(ADMIN_BLOCK_MESSAGE)}</strong></p>
    <p>Tu acceso al panel queda bloqueado temporalmente hasta ${escapeHtml(untilText)}.</p>
  </main>
</body>
</html>`;
}

function blockAdminAreaIfNeeded(req, res, next) {
  const block = getAdminBlock(req);
  if (!block) return next();
  if ((req.originalUrl || "").startsWith("/api/")) {
    return res.status(403).json(adminBlockPayload(block.record));
  }
  return res.status(403).send(renderAdminBlockPage(block.record.blockedUntil));
}

function cleanImageUrl(value) {
  const imageUrl = cleanLimited(value, BRAND_LOGO, 900000);
  if (!imageUrl) return BRAND_LOGO;
  if (imageUrl.startsWith("data:image/")) return imageUrl;
  if (imageUrl.startsWith("assets/")) return imageUrl;
  if (/^https?:\/\/[^\s]+$/i.test(imageUrl)) return imageUrl;
  return BRAND_LOGO;
}

function normalizeOptions(value) {
  const rawOptions = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/\r?\n/)
        .map((line) => {
          const [label, price = ""] = line.split("|");
          return { label, price };
        });
  return rawOptions
    .map((option) => {
      if (typeof option === "string") return { label: cleanLimited(option, "", 160), price: "" };
      return {
        label: cleanLimited(option?.label, "", 160),
        price: cleanLimited(option?.price, "", 80)
      };
    })
    .filter((option) => option.label)
    .slice(0, 30);
}

function serializeOptions(value) {
  const options = normalizeOptions(value);
  return options.length ? JSON.stringify(options) : null;
}

function parseProductOptions(value) {
  try {
    return normalizeOptions(JSON.parse(value || "[]"));
  } catch {
    return [];
  }
}

function cleanProduct(body) {
  return {
    name: cleanLimited(body.name, "", 180),
    category: cleanLimited(body.category, "scripts", 120) || "scripts",
    description: cleanLimited(body.description, "", 2500),
    imageUrl: cleanImageUrl(body.imageUrl),
    oldPrice: body.oldPrice === "" || body.oldPrice == null ? null : Math.max(0, Number(body.oldPrice || 0)),
    price: Math.max(0, Number(body.price || 0)),
    badge: cleanLimited(body.badge, "", 80) || null,
    active: body.active === false ? 0 : 1,
    sortOrder: Number(body.sortOrder || 0),
    purchaseOptions: serializeOptions(body.options ?? body.purchaseOptions)
  };
}

function productJson(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.image_url,
    oldPrice: product.old_price == null ? null : Number(product.old_price),
    price: Number(product.price),
    badge: product.badge,
    active: Boolean(product.active),
    sortOrder: Number(product.sort_order),
    options: parseProductOptions(product.purchase_options)
  };
}

function defaultProductJson(product, index) {
  return {
    id: index + 1,
    name: product.name,
    category: product.category,
    description: product.description,
    imageUrl: product.imageUrl,
    oldPrice: product.oldPrice,
    price: product.price,
    badge: product.badge,
    active: true,
    sortOrder: index,
    options: normalizeOptions(product.options)
  };
}

function offlineReportJson() {
  const activeProducts = DEFAULT_PRODUCTS.filter(Boolean).length;
  return {
    activeVisitors: activeVisitorCount(),
    totalVisits: 0,
    whatsappClicks: 0,
    buyClicks: 0,
    totalSales: 0,
    pendingSales: 0,
    completedSales: 0,
    revenue: 0,
    totalProducts: activeProducts,
    activeProducts,
    dailyVisits: [],
    offline: true,
    database: serializeDbState()
  };
}

function databaseWriteUnavailable(res) {
  return res.status(503).json({
    error: "MySQL no esta conectado todavia. No se guardo ningun cambio. Revisa /health y redeploya cuando las variables MySQL esten en el servicio web.",
    database: serializeDbState()
  });
}

async function getSetting(key, fallback = "") {
  if (!isDatabaseReady()) return fallback;
  try {
    const rows = await query("SELECT setting_value FROM settings WHERE setting_key = :key LIMIT 1", { key });
    return rows[0]?.setting_value || fallback;
  } catch (error) {
    console.warn(`No se pudo leer setting "${key}". Usando valor por defecto.`);
    console.warn(error.stack || error);
    return fallback;
  }
}

async function logEvent(eventType, data = {}) {
  if (!isDatabaseReady()) return false;
  try {
    await query(
      `INSERT INTO analytics_events (event_type, source, session_id, product_id, metadata)
       VALUES (:eventType, :source, :sessionId, :productId, :metadata)`,
      {
        eventType,
        source: cleanText(data.source) || null,
        sessionId: cleanText(data.sessionId) || null,
        productId: data.productId ? Number(data.productId) : null,
        metadata: JSON.stringify(data.metadata || {})
      }
    );
    return true;
  } catch (error) {
    console.warn("No se pudo guardar evento analitico:");
    console.warn(error.stack || error);
    return false;
  }
}

function markActive(sessionId) {
  const id = cleanText(sessionId);
  if (id) activeVisitors.set(id, Date.now());
}

function activeVisitorCount() {
  const cutoff = Date.now() - 45000;
  for (const [id, lastSeen] of activeVisitors.entries()) {
    if (lastSeen < cutoff) activeVisitors.delete(id);
  }
  return activeVisitors.size;
}

function broadcast(event, data = {}) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of eventClients) client.write(message);
}

async function syncConfiguredAdmin() {
  const configuredUsername = configuredAdminUsername();
  const configuredPasswordHash = process.env.ADMIN_PASSWORD
    ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)
    : (process.env.ADMIN_PASSWORD_HASH || ADMIN_DEFAULT_PASSWORD_HASH);
  const adminSeeds = [
    {
      username: configuredUsername,
      passwordHash: configuredPasswordHash,
      name: `Administrador ${BRAND_NAME}`
    }
  ];

  if (configuredUsername !== ADMIN_DEFAULT_USERNAME) {
    adminSeeds.push({
      username: ADMIN_DEFAULT_USERNAME,
      passwordHash: ADMIN_DEFAULT_PASSWORD_HASH,
      name: `Administrador ${BRAND_NAME}`
    });
  }

  for (const admin of adminSeeds) {
    await upsertAdminUser(admin);
  }
}

async function upsertAdminUser({ username, passwordHash, name }) {
  const rows = await query("SELECT id FROM users WHERE username = :username LIMIT 1", { username });
  if (rows.length) {
    await query(
      "UPDATE users SET role = 'admin', password_hash = :passwordHash, name = :name, active = 1, updated_at = NOW() WHERE id = :id",
      { passwordHash, name, id: rows[0].id }
    );
  } else {
    await query(
      "INSERT INTO users (role, username, password_hash, name, active) VALUES ('admin', :username, :passwordHash, :name, 1)",
      { username, passwordHash, name }
    );
  }
}

async function syncBrandDefaults() {
  await query(
    `INSERT INTO settings (setting_key, setting_value) VALUES
      ('whatsappGroup', :whatsappGroup),
      ('whatsappNumber', :whatsappNumber),
      ('storeName', :storeName)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    { whatsappGroup: WHATSAPP_GROUP, whatsappNumber: WHATSAPP_NUMBER, storeName: BRAND_NAME }
  );
}

async function upsertDefaultProduct(existingProduct, product, index) {
  const data = {
    ...product,
    purchaseOptions: serializeOptions(product.options),
    sortOrder: index
  };
  if (existingProduct) {
    await query(
      `UPDATE products SET name = :name, category = :category, description = :description,
       image_url = :imageUrl, old_price = :oldPrice, price = :price, badge = :badge,
       purchase_options = :purchaseOptions, active = 1, sort_order = :sortOrder WHERE id = :id`,
      { ...data, id: existingProduct.id }
    );
    return;
  }

  await query(
    `INSERT INTO products (name, category, description, image_url, old_price, price, badge, purchase_options, active, sort_order)
     VALUES (:name, :category, :description, :imageUrl, :oldPrice, :price, :badge, :purchaseOptions, 1, :sortOrder)`,
    data
  );
}

async function syncDefaultCatalog() {
  const rows = await query("SELECT id, name FROM products ORDER BY sort_order ASC, id ASC");
  if (!rows.length) {
    for (let index = 0; index < DEFAULT_PRODUCTS.length; index += 1) {
      await upsertDefaultProduct(rows[index], DEFAULT_PRODUCTS[index], index);
    }
    return;
  }

  if (rows.length < DEFAULT_PRODUCTS.length) {
    for (let index = rows.length; index < DEFAULT_PRODUCTS.length; index += 1) {
      await upsertDefaultProduct(null, DEFAULT_PRODUCTS[index], index);
    }
  }
}

function safeLoginUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    active: user.active,
    hasPasswordHash: Boolean(user.password_hash),
    name: user.name
  };
}

function logAdminLogin(step, data = {}) {
  console.log(`[admin-login] ${step}`);
  console.log(JSON.stringify(data, null, 2));
}

function sendAdminLoginJson(res, statusCode, payload) {
  logAdminLogin("JSON exacto que responde al frontend", { statusCode, payload });
  return res.status(statusCode).json(payload);
}

async function adminLoginHandler(req, res) {
  const username = cleanLimited(req.body.username, "", 80);
  const password = cleanLimited(req.body.password, "", 180);

  logAdminLogin("Peticion recibida", {
    method: req.method,
    originalUrl: req.originalUrl,
    endpointUsadoPorFrontend: "/api/auth/admin-login",
    aliasDisponible: "/api/admin/login",
    username,
    passwordLength: password.length,
    poolExists: Boolean(pool),
    dbStatus: dbState.status,
    dbSource: dbState.source,
    dbDatabase: dbState.database,
    isDatabaseReady: isDatabaseReady()
  });

  if (!isDatabaseReady()) {
    return sendAdminLoginJson(res, 503, {
      error: "MySQL aun no conecto. Revisa /health: mysqlConfigSources debe mostrar al menos una fuente y database.lastError dira que conexion fallo.",
      database: serializeDbState(),
      mysqlEnvPresent: mysqlEnvPresence(),
      mysqlConfigSources: mysqlConfigSources(),
      mysqlCandidateSummaries: mysqlCandidateSummaries()
    });
  }

  const sql = "SELECT * FROM users WHERE username = :username AND role = 'admin' AND active = 1 LIMIT 1";
  const sqlParams = { username };
  logAdminLogin("Ejecutando consulta SQL", { sql, params: sqlParams, poolExists: Boolean(pool), dbStatus: dbState.status });

  let rows;
  try {
    rows = await query(sql, sqlParams);
  } catch (error) {
    const sqlError = serializeMysqlError(error);
    logMysqlError("[admin-login] Error ORIGINAL ejecutando consulta SQL de login", error, {
      sql,
      params: sqlParams,
      poolExists: Boolean(pool),
      dbStatus: dbState.status,
      dbSource: dbState.source,
      dbDatabase: dbState.database
    });
    return sendAdminLoginJson(res, 500, {
      error: "Error ejecutando consulta SQL del login admin. Revisa mysqlError para ver el error original.",
      mysqlError: sqlError,
      database: serializeDbState()
    });
  }

  logAdminLogin("Resultado de consulta SQL", {
    rowCount: rows.length,
    firstRow: safeLoginUser(rows[0])
  });

  const user = rows[0];
  let passwordMatches = false;
  if (user) {
    passwordMatches = await bcrypt.compare(password, user.password_hash);
  }

  logAdminLogin("Resultado de validacion de credenciales", {
    userFound: Boolean(user),
    passwordMatches
  });

  if (!user || !passwordMatches) {
    const attempt = registerAdminLoginFailure(req);
    if (attempt.blocked) {
      return sendAdminLoginJson(res, 403, {
        error: ADMIN_BLOCK_MESSAGE,
        blocked: true,
        attempts: attempt.failures,
        blockedUntil: attempt.blockedUntil
      });
    }
    return sendAdminLoginJson(res, 401, {
      error: `${ADMIN_WARNING_MESSAGE} Intento ${attempt.failures} de ${ADMIN_FAILED_LOGIN_LIMIT}.`,
      attempts: attempt.failures,
      attemptsRemaining: attempt.remaining
    });
  }

  clearAdminLoginFailures(req);
  setSessionCookie(res, signToken(user));
  return sendAdminLoginJson(res, 200, {
    user: { id: user.id, username: user.username, name: user.name, role: user.role }
  });
}

app.post("/api/auth/admin-login", loginLimiter, blockAdminLoginIfNeeded, asyncHandler(adminLoginHandler));
app.post("/api/admin/login", loginLimiter, blockAdminLoginIfNeeded, asyncHandler(adminLoginHandler));

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "strict", secure: IS_PRODUCTION, path: "/" });
  res.json({ ok: true });
});

app.get("/api/me", auth, adminOnly, asyncHandler(async (req, res) => {
  const rows = await query("SELECT id, username, name, role, active FROM users WHERE id = :id LIMIT 1", {
    id: req.user.id
  });
  if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado." });
  res.json({ user: rows[0] });
}));

app.get("/api/settings", asyncHandler(async (_req, res) => {
  res.json({
    whatsappGroup: await getSetting("whatsappGroup", WHATSAPP_GROUP),
    whatsappNumber: await getSetting("whatsappNumber", WHATSAPP_NUMBER),
    storeName: await getSetting("storeName", BRAND_NAME)
  });
}));

app.get("/api/products", asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) {
    return res.json(DEFAULT_PRODUCTS.map(defaultProductJson));
  }
  const rows = await query("SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC, id DESC");
  res.json(rows.map(productJson));
}));

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`event: connected\ndata: {"ok":true}\n\n`);
  eventClients.add(res);
  req.on("close", () => eventClients.delete(res));
});

app.post("/api/track/pageview", asyncHandler(async (req, res) => {
  markActive(req.body.sessionId);
  await logEvent("page_view", { sessionId: req.body.sessionId, source: "pagina-principal" });
  broadcast("reports-updated", {});
  res.json({ ok: true });
}));

app.post("/api/track/heartbeat", (req, res) => {
  markActive(req.body.sessionId);
  res.json({ ok: true, activeVisitors: activeVisitorCount() });
});

async function trackChatClick(req, res) {
  markActive(req.body.sessionId);
  await logEvent(CHAT_CLICK_EVENT, {
    sessionId: req.body.sessionId,
    source: cleanText(req.body.source, "pagina-principal")
  });
  broadcast("reports-updated", {});
  res.json({ ok: true, whatsappGroup: await getSetting("whatsappGroup", WHATSAPP_GROUP) });
}

app.post("/api/track/whatsapp-click", asyncHandler(trackChatClick));

app.post("/api/sales/lead", asyncHandler(async (req, res) => {
  const productId = Number(req.body.productId || 0);
  if (!isDatabaseReady()) {
    const product = DEFAULT_PRODUCTS[productId - 1];
    if (!product) return res.status(404).json({ error: "Producto no encontrado." });
    const productOptions = normalizeOptions(product.options);
    const selectedOption = cleanLimited(req.body.selectedOption, "", 220);
    const selectedPrice = cleanLimited(req.body.selectedPrice, "", 80);
    const selectedLabel = selectedOption
      ? `${selectedOption}${selectedPrice ? ` - ${selectedPrice}` : ""}`
      : productOptions[0]
        ? `${productOptions[0].label}${productOptions[0].price ? ` - ${productOptions[0].price}` : ""}`
        : null;
    await logEvent("buy_click", {
      sessionId: req.body.sessionId,
      source: "producto",
      productId,
      metadata: { productName: product.name, selectedOption: selectedLabel, offline: true }
    });
    return res.status(201).json({
      id: null,
      offline: true,
      whatsappGroup: WHATSAPP_GROUP
    });
  }

  const rows = await query("SELECT * FROM products WHERE id = :id AND active = 1 LIMIT 1", { id: productId });
  if (!rows.length) return res.status(404).json({ error: "Producto no encontrado." });
  const product = rows[0];
  const productOptions = parseProductOptions(product.purchase_options);
  const selectedOption = cleanLimited(req.body.selectedOption, "", 220);
  const selectedPrice = cleanLimited(req.body.selectedPrice, "", 80);
  const selectedLabel = selectedOption
    ? `${selectedOption}${selectedPrice ? ` - ${selectedPrice}` : ""}`
    : productOptions[0]
      ? `${productOptions[0].label}${productOptions[0].price ? ` - ${productOptions[0].price}` : ""}`
      : null;
  const result = await query(
    `INSERT INTO sales (product_id, product_name, price, selected_option, status, source, session_id)
     VALUES (:productId, :productName, :price, :selectedOption, 'pendiente', 'pagina-principal', :sessionId)`,
    {
      productId: product.id,
      productName: product.name,
      price: product.price,
      selectedOption: selectedLabel,
      sessionId: cleanText(req.body.sessionId) || null
    }
  );
  await logEvent("buy_click", {
    sessionId: req.body.sessionId,
    source: "producto",
    productId: product.id,
    metadata: { saleId: result.insertId, productName: product.name, selectedOption: selectedLabel }
  });
  await logEvent(CHAT_CLICK_EVENT, {
    sessionId: req.body.sessionId,
    source: "compra-producto",
    productId: product.id,
    metadata: { saleId: result.insertId, productName: product.name, selectedOption: selectedLabel }
  });
  broadcast("reports-updated", {});
  res.status(201).json({
    id: result.insertId,
    whatsappGroup: await getSetting("whatsappGroup", WHATSAPP_GROUP)
  });
}));

app.get("/api/admin/products", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) {
    return res.json(DEFAULT_PRODUCTS.map(defaultProductJson));
  }
  const rows = await query("SELECT * FROM products ORDER BY sort_order ASC, id DESC");
  res.json(rows.map(productJson));
}));

app.post("/api/admin/products", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const product = cleanProduct(req.body);
  if (!product.name || !product.description) return res.status(400).json({ error: "Nombre y descripcion son obligatorios." });
  const result = await query(
    `INSERT INTO products (name, category, description, image_url, old_price, price, badge, purchase_options, active, sort_order)
     VALUES (:name, :category, :description, :imageUrl, :oldPrice, :price, :badge, :purchaseOptions, :active, :sortOrder)`,
    product
  );
  broadcast("products-updated", { id: result.insertId });
  broadcast("reports-updated", {});
  res.status(201).json({ id: result.insertId });
}));

app.put("/api/admin/products/:id", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const product = cleanProduct(req.body);
  if (!product.name || !product.description) return res.status(400).json({ error: "Nombre y descripcion son obligatorios." });
  await query(
    `UPDATE products SET name = :name, category = :category, description = :description,
     image_url = :imageUrl, old_price = :oldPrice, price = :price, badge = :badge,
     purchase_options = :purchaseOptions, active = :active, sort_order = :sortOrder WHERE id = :id`,
    { ...product, id: Number(req.params.id) }
  );
  broadcast("products-updated", { id: Number(req.params.id) });
  res.json({ ok: true });
}));

app.delete("/api/admin/products/:id", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  await query("DELETE FROM products WHERE id = :id", { id: Number(req.params.id) });
  broadcast("products-updated", { id: Number(req.params.id) });
  broadcast("reports-updated", {});
  res.json({ ok: true });
}));

app.get("/api/admin/sales", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json([]);
  const rows = await query("SELECT * FROM sales ORDER BY id DESC LIMIT 200");
  res.json(rows.map((sale) => ({ ...sale, price: Number(sale.price) })));
}));

app.put("/api/admin/sales/:id/status", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const allowed = new Set(["pendiente", "pagado", "cancelado", "entregado"]);
  const status = cleanText(req.body.status);
  if (!allowed.has(status)) return res.status(400).json({ error: "Estado invalido." });
  await query("UPDATE sales SET status = :status WHERE id = :id", { status, id: Number(req.params.id) });
  broadcast("reports-updated", {});
  res.json({ ok: true });
}));

app.get("/api/admin/reports", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json(offlineReportJson());
  const [eventTotals, salesTotals, productTotals, dailyVisits] = await Promise.all([
    query(
      `SELECT
        SUM(event_type = 'page_view') AS total_visits,
        SUM(event_type = 'whatsapp_click') AS whatsapp_clicks,
        SUM(event_type = 'buy_click') AS buy_clicks
       FROM analytics_events`
    ),
    query(
      `SELECT
        COUNT(*) AS total_sales,
        SUM(status = 'pendiente') AS pending_sales,
        SUM(status IN ('pagado', 'entregado')) AS completed_sales,
        COALESCE(SUM(CASE WHEN status IN ('pagado', 'entregado') THEN price ELSE 0 END), 0) AS revenue
       FROM sales`
    ),
    query("SELECT COUNT(*) AS total_products, SUM(active = 1) AS active_products FROM products"),
    query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS total
       FROM analytics_events
       WHERE event_type = 'page_view' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    )
  ]);

  res.json({
    activeVisitors: activeVisitorCount(),
    totalVisits: Number(eventTotals[0].total_visits || 0),
    whatsappClicks: Number(eventTotals[0].whatsapp_clicks || 0),
    buyClicks: Number(eventTotals[0].buy_clicks || 0),
    totalSales: Number(salesTotals[0].total_sales || 0),
    pendingSales: Number(salesTotals[0].pending_sales || 0),
    completedSales: Number(salesTotals[0].completed_sales || 0),
    revenue: Number(salesTotals[0].revenue || 0),
    totalProducts: Number(productTotals[0].total_products || 0),
    activeProducts: Number(productTotals[0].active_products || 0),
    dailyVisits: dailyVisits.map((item) => ({ day: item.day, total: Number(item.total) }))
  });
}));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: BRAND_NAME,
    database: serializeDbState(),
    mysqlEnvPresent: mysqlEnvPresence(),
    mysqlConfigSources: mysqlConfigSources(),
    mysqlCandidateSummaries: mysqlCandidateSummaries()
  });
});

app.use(express.static(__dirname, { dotfiles: "ignore" }));
app.get("/admin", (_req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

app.use((error, _req, res, _next) => {
  console.error("Error HTTP no controlado:");
  console.error(error.stack || error);
  const statusCode = error.statusCode || 500;
  res.status(statusCode).json({
    error: error instanceof DatabaseUnavailableError
      ? "Base de datos no disponible. La pagina sigue activa mientras se reintenta la conexion."
      : "Ocurrio un error en el servidor.",
    database: error instanceof DatabaseUnavailableError ? serializeDbState() : undefined,
    detail: IS_PRODUCTION ? undefined : (error.stack || String(error))
  });
});

async function start() {
  setInterval(() => {
    activeVisitorCount();
    broadcast("active-visitors", { activeVisitors: activeVisitorCount() });
  }, 15000).unref();

  return new Promise((resolve) => {
    const server = app.listen(PORT, HOST, () => {
      const address = server.address();
      const activePort = typeof address === "object" && address ? address.port : PORT;
      console.log(`${BRAND_NAME} iniciado correctamente.`);
      console.log(`Puerto: ${activePort}`);
      console.log("El healthcheck /health responde aunque MySQL no este disponible.");
      initializeDatabaseInBackground();
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("No se pudo iniciar el servidor:");
    console.error(error.stack || error);
  });
}

module.exports = { app, start };
