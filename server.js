require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dns = require("dns");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");
const nodemailer = require("nodemailer");
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

try {
  dns.setDefaultResultOrder("ipv4first");
} catch (error) {
  console.warn("[email] No se pudo forzar preferencia DNS IPv4:");
  console.warn(error.stack || error);
}

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "garcita_store_dev_secret";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE = "garcita_store_admin";
const CUSTOMER_COOKIE = "garcita_store_customer";
const BRAND_NAME = "GARCITA STORE";
const BRAND_LOGO = "assets/garcita-logo.svg";
const WHATSAPP_GROUP = "https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3";
const WHATSAPP_NUMBER = "5216863387186";
const OWNER_WHATSAPP_NUMBER = "5216863387186";
const YOAN_WHATSAPP_NUMBER = "34643502834";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "mg4563690@gmail.com";
const PURCHASE_REWARD = 15;
const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const VERIFICATION_RESEND_SECONDS = 60;
const VERIFICATION_MAX_ATTEMPTS = 5;
const PROOF_MAX_BYTES = 5 * 1024 * 1024;
const PROOF_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const CHAT_CLICK_EVENT = "whatsapp_click";
const MYSQL_RETRY_MS = Math.max(5000, Number(process.env.MYSQL_RETRY_MS || 30000));
const ADMIN_DEFAULT_USERNAME = "Garcita9";
const ADMIN_DEFAULT_PASSWORD_HASH = "$2a$10$pAySt1sPQcUqivIlqMZvKe3vq.HeNMWBYG2OZUsBMd45QmNUsZh5W";
const ADMIN_FAILED_LOGIN_LIMIT = 3;
const ADMIN_BLOCK_MS = 24 * 60 * 60 * 1000;
const ADMIN_WARNING_MESSAGE = "Si no eres admin, no pongas mas la contrasena.";
const ADMIN_BLOCK_MESSAGE = "Bloqueado por querer acceder al panel de admin sin permiso ni contrasena.";
let emailTransporterCache = null;
let emailTransporterCacheKey = "";
let emailWorkingConfig = null;
const emailState = {
  configured: false,
  verified: false,
  source: null,
  activeSource: null,
  lastVerifyAt: null,
  lastError: null,
  lastAttemptedConfigs: []
};

const DEFAULT_PRODUCTS = [
  {
    key: "proxy-ios",
    aliases: ["Panel iOS Garcita", "Proxy iOS Garcita"],
    name: "Proxy iOS Garcita",
    category: "Proxy",
    description: "Proxy iOS: Aim Pecho/Aim Cuello/Aim Drag/Balas Magicas. Visuales: Holograma/Holograma Arma.",
    imageUrl: "assets/garcita-panel-ios.jpeg",
    oldPrice: null,
    price: 300,
    badge: "Proxy Vip",
    options: [
      { label: "Semanal", price: "300 MX / 18 dolares" },
      { label: "Mensual", price: "700 MX / 40 dolares" },
      { label: "Primer mes", price: "500 MX / 30 dolares" }
    ]
  },
  {
    key: "diamantes",
    aliases: ["Diamantes Free Fire", "Diamantes"],
    name: "Diamantes",
    category: "diamantes",
    description: "Recargas de diamantes basicos, VIP y combos para Free Fire. Todo se hace por ID.",
    imageUrl: "assets/garcita-diamantes.jpeg",
    oldPrice: null,
    price: 15,
    badge: "diamantes",
    options: [
      { label: "120 diamantes basicos", price: "15 MX" },
      { label: "341 diamantes basicos", price: "50 MX" },
      { label: "520 diamantes basicos", price: "70 MX" },
      { label: "1166 diamantes basicos", price: "150 MX" },
      { label: "2398 diamantes basicos", price: "330 MX" },
      { label: "6160 diamantes basicos", price: "620 MX" },
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
    key: "keys-mayoreo",
    aliases: ["KEYS A MAYOREO", "Keys a mayoreo"],
    name: "KEYS A MAYOREO",
    category: "MAYOREO",
    description: "Invierte y duplica tu inversion en ventas de proxys VIP.",
    imageUrl: "assets/garcita-keys-mayoreo.jpeg",
    oldPrice: null,
    price: 840,
    badge: "INVERSION",
    options: [
      { label: "7 KEYS SEMANALES + 1 DE REGALO", price: "840 MX" },
      { label: "7 KEYS MENSUALES + 1 DE REGALO", price: "1150 MX" },
      { label: "MAS DE 7 KEYS O MIXTAS", price: "840 MX minimo / cotiza por WhatsApp" }
    ]
  },
  {
    key: "seguidores-instagram",
    aliases: ["Seguidores Instagram"],
    name: "Seguidores Instagram",
    category: "redes",
    description: "Seguidores para Instagram por link del perfil, con garantia de 20 dias.",
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
    key: "likes-experiencia-fragmentos",
    aliases: ["Likes, experiencia y fragmentos", "Likes/Experiencia/Honor Para Clan Etc"],
    name: "Likes/Experiencia/Honor Para Clan Etc",
    category: "free fire",
    description: "Likes basicos, experiencia para cuenta Free Fire, fragmentos y honor clan.",
    imageUrl: "assets/garcita-fragmentos.jpeg",
    oldPrice: null,
    price: 20,
    badge: "servicios",
    options: [
      { label: "Honor clan 380K-420K", price: "500 MX" },
      { label: "Likes basicos 200", price: "20 MX" },
      { label: "Likes basicos 1400", price: "65 MX" },
      { label: "Likes basicos 2800", price: "100 MX" },
      { label: "Likes basicos 4200", price: "140 MX" },
      { label: "Likes basicos 6600", price: "250 MX" },
      { label: "Experiencia cuenta FF 250K", price: "340 MX" },
      { label: "Experiencia cuenta FF 500K", price: "440 MX" },
      { label: "Experiencia cuenta FF 750K", price: "620 MX" },
      { label: "Experiencia cuenta FF 1.5M", price: "1000 MX" },
      { label: "Fragmentos 100", price: "160 MX" },
      { label: "Fragmentos 200", price: "300 MX" },
      { label: "Fragmentos 500", price: "500 MX" },
      { label: "Fragmentos 600", price: "580 MX" }
    ]
  },
  {
    key: "metodos-vip",
    aliases: ["METODOS VIP", "Metodos VIP"],
    name: "METODOS VIP",
    category: "COMBO",
    description: "Metodos separados y combo VIP.",
    imageUrl: "assets/garcita-metodos-vip.jpeg",
    oldPrice: null,
    price: 600,
    badge: "METODOS",
    options: [
      { label: "1 VEZ X ID", price: "600 MX" },
      { label: "Diamantes 20% bonos", price: "600 MX" },
      { label: "Diamantes ilimitados", price: "600 MX" },
      { label: "Likes FF", price: "600 MX" },
      { label: "Honor para clanes", price: "600 MX" },
      { label: "XP para cuentas", price: "600 MX" },
      { label: "Metodo de fragmentos", price: "600 MX" },
      { label: "Codigos de eventos", price: "600 MX" },
      { label: "Seguidores", price: "600 MX" },
      { label: "Likes para videos", price: "600 MX" },
      { label: "Vistas", price: "600 MX" }
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
app.use(express.json({ limit: "8mb" }));
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

async function columnExists(tableName, columnName) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND COLUMN_NAME = :columnName`,
    { tableName, columnName }
  );
  return rows.length > 0;
}

async function addColumnIfMissing(tableName, columnName, definition) {
  if (await columnExists(tableName, columnName)) return;
  await query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

async function indexExists(tableName, indexName) {
  const rows = await query(
    `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tableName AND INDEX_NAME = :indexName
     LIMIT 1`,
    { tableName, indexName }
  );
  return rows.length > 0;
}

async function addIndexIfMissing(tableName, indexName, definition) {
  if (await indexExists(tableName, indexName)) return;
  await query(`ALTER TABLE ${tableName} ADD ${definition}`);
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

  await addColumnIfMissing("customer_verification_codes", "attempts", "attempts INT NOT NULL DEFAULT 0 AFTER code_hash");
  await addColumnIfMissing("customer_verification_codes", "last_sent_at", "last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER used_at");
  await addColumnIfMissing("customer_verification_codes", "delivery_status", "delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending' AFTER last_sent_at");
  await addColumnIfMissing("customer_verification_codes", "delivery_error", "delivery_error TEXT NULL AFTER delivery_status");

  await addColumnIfMissing("topup_requests", "order_number", "order_number VARCHAR(40) NULL AFTER id");
  await addColumnIfMissing("topup_requests", "buyer_name", "buyer_name VARCHAR(160) NULL AFTER customer_id");
  await addColumnIfMissing("topup_requests", "buyer_email", "buyer_email VARCHAR(180) NULL AFTER buyer_name");
  await addColumnIfMissing("topup_requests", "product_id", "product_id INT NULL AFTER amount");
  await addColumnIfMissing("topup_requests", "product_name", "product_name VARCHAR(180) NULL AFTER product_id");
  await addColumnIfMissing("topup_requests", "selected_option", "selected_option VARCHAR(220) NULL AFTER product_name");
  await addColumnIfMissing("topup_requests", "price", "price DECIMAL(10, 2) NULL AFTER selected_option");
  await addColumnIfMissing("topup_requests", "proof_mime", "proof_mime VARCHAR(80) NULL AFTER proof_image");
  await addColumnIfMissing("topup_requests", "proof_filename", "proof_filename VARCHAR(180) NULL AFTER proof_mime");
  await addColumnIfMissing("topup_requests", "proof_size", "proof_size INT NULL AFTER proof_filename");
  await addIndexIfMissing("topup_requests", "uq_topup_order_number", "UNIQUE KEY uq_topup_order_number (order_number)");
  await addIndexIfMissing("topup_requests", "idx_topup_product", "INDEX idx_topup_product (product_id)");
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

function setCustomerCookie(res, token) {
  res.cookie(CUSTOMER_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: IS_PRODUCTION,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function signCustomerToken(customer) {
  return jwt.sign({
    id: customer.id,
    role: "customer",
    email: customer.email,
    name: customer.name
  }, JWT_SECRET, { expiresIn: "30d" });
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

async function customerAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const cookies = parseCookies(req);
  const token = header.startsWith("Bearer ") ? header.slice(7) : cookies[CUSTOMER_COOKIE] || "";
  if (!token) return res.status(401).json({ error: "Inicia sesion para usar tu saldo." });
  if (!isDatabaseReady()) return next(new DatabaseUnavailableError("La base de datos de clientes aun no esta disponible."));
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "customer") return res.status(401).json({ error: "Sesion de cliente invalida." });
    const rows = await query(
      `SELECT id, name, email, email_verified, active, created_at
       FROM customers
       WHERE id = :id AND active = 1
       LIMIT 1`,
      { id: decoded.id }
    );
    if (!rows.length) return res.status(401).json({ error: "Sesion de cliente desactivada. Inicia sesion nuevamente." });
    req.customer = rows[0];
    next();
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) return next(error);
    res.status(401).json({ error: "Sesion vencida. Inicia sesion nuevamente." });
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

function safeFilename(value, fallback = "comprobante") {
  const base = cleanLimited(value, fallback, 180).replace(/[^\w.\- ]+/g, "_").trim();
  return base || fallback;
}

function extensionFromMime(mime) {
  return {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  }[mime] || "bin";
}

function validProofMagic(buffer, mime) {
  if (!buffer || !buffer.length) return false;
  if (mime === "image/jpeg") return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === "image/png") return buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === "image/webp") return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  if (mime === "application/pdf") return buffer.slice(0, 5).toString("ascii") === "%PDF-";
  return false;
}

function parseProofUpload(dataUrl, filename) {
  const raw = String(dataUrl || "");
  if (!raw) return null;
  const match = raw.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) {
    const error = new Error("El comprobante debe ser una imagen o PDF valido.");
    error.statusCode = 400;
    throw error;
  }
  const mime = match[1].toLowerCase();
  if (!PROOF_ALLOWED_MIME.has(mime)) {
    const error = new Error("Solo se aceptan comprobantes JPG, PNG, WebP o PDF.");
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > PROOF_MAX_BYTES) {
    const error = new Error("El comprobante debe pesar menos de 5 MB.");
    error.statusCode = 400;
    throw error;
  }
  if (!validProofMagic(buffer, mime)) {
    const error = new Error("El comprobante no coincide con el tipo de archivo enviado.");
    error.statusCode = 400;
    throw error;
  }
  const finalFilename = safeFilename(filename, `comprobante.${extensionFromMime(mime)}`);
  return {
    dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
    mime,
    filename: finalFilename.includes(".") ? finalFilename : `${finalFilename}.${extensionFromMime(mime)}`,
    size: buffer.length,
    buffer
  };
}

function proofAttachments(proof) {
  if (!proof) return [];
  return [{
    filename: proof.filename,
    content: proof.buffer,
    contentType: proof.mime
  }];
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

function cleanEmail(value) {
  return cleanLimited(value, "", 180).toLowerCase();
}

function normalizeAmount(value) {
  const amount = Math.round(Number(value || 0) * 100) / 100;
  return Number.isFinite(amount) ? amount : 0;
}

function extractPriceAmount(value, fallback = 0) {
  const text = String(value ?? "");
  const match = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return normalizeAmount(fallback);
  return normalizeAmount(match[1].replace(",", "."));
}

function safeCustomerJson(customer, balance = 0) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    emailVerified: Boolean(customer.email_verified),
    active: Boolean(customer.active),
    balance: normalizeAmount(balance)
  };
}

function paymentMethodsJson(productContext = {}) {
  const productLine = productContext.productName
    ? ` Quiero pagar: ${productContext.productName}${productContext.optionText ? ` - ${productContext.optionText}` : ""}.`
    : "";
  const remitlyMessage = `Hola GARCITA STORE, vengo de la pagina y quiero pagar con Remitly.${productLine} Me ayudas con el proceso?`;
  return [
    {
      id: "transferencia",
      name: "Transferencia STP",
      account: "728969000107398902",
      receiver: "Garcita Store",
      bank: "STP",
      automatic: false
    },
    {
      id: "oxxo",
      name: "Deposito OXXO",
      account: "4217 4702 5163 6722",
      receiver: "Garcita Store",
      automatic: false
    },
    {
      id: "binance",
      name: "Binance",
      account: "1245653717",
      receiver: "Garcita Store",
      automatic: false
    },
    {
      id: "remitly",
      name: "Remitly",
      account: "Trato directo por WhatsApp",
      receiver: "Garcita Store",
      automatic: false,
      whatsappUrl: buildWhatsappUrl(OWNER_WHATSAPP_NUMBER, remitlyMessage)
    }
  ];
}

function buildWhatsappUrl(number, message) {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function supportLinks(order) {
  const baseMessage = [
    "Hola, vengo de la pagina GARCITA STORE.",
    `Ya compre: ${order.productName || order.product_name || "producto"}.`,
    `Comprobante: ${order.receiptCode || order.receipt_code || "pendiente"}.`,
    `Key/PIN: ${order.pinCode || order.pin_code || "pendiente"}.`,
    "",
    "Me dices cuando estes disponible? Te respondo y mando comprobante para que me ayudes a instalar y activar mi key."
  ].join("\n");
  return [
    { label: "Yoan soporte", phone: "+34 643 50 28 34", url: buildWhatsappUrl(YOAN_WHATSAPP_NUMBER, baseMessage) },
    { label: "Dueno Garcita", phone: "+52 1 686 338 7186", url: buildWhatsappUrl(OWNER_WHATSAPP_NUMBER, baseMessage) }
  ];
}

function randomCode(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, "0");
}

function randomToken(prefix, bytes = 5) {
  return `${prefix}-${crypto.randomBytes(bytes).toString("hex").toUpperCase()}`;
}

function smtpConfig() {
  const gmailUser = cleanText(process.env.GMAIL_USER || process.env.SMTP_GMAIL_USER);
  const gmailPass = String(process.env.GMAIL_APP_PASSWORD || process.env.SMTP_GMAIL_APP_PASSWORD || "");
  const explicitUser = cleanText(process.env.SMTP_USER || process.env.EMAIL_USER);
  const explicitPass = String(process.env.SMTP_PASSWORD || process.env.EMAIL_PASSWORD || "");
  let host = cleanText(process.env.SMTP_HOST);
  const secureText = String(process.env.SMTP_SECURE || "").toLowerCase();
  let secure = ["true", "1", "yes"].includes(secureText);
  let port = Number(process.env.SMTP_PORT || 0) || (secure ? 465 : 587);
  secure = secure || port === 465;
  let user = explicitUser || gmailUser;
  let pass = explicitPass || gmailPass;
  let source = "SMTP";

  if (!host && gmailUser && gmailPass) {
    host = "smtp.gmail.com";
    port = 465;
    secure = true;
    user = gmailUser;
    pass = gmailPass;
    source = "Gmail App Password";
  } else if (!host && user && pass && /@gmail\.com$/i.test(user)) {
    host = "smtp.gmail.com";
    port = 465;
    secure = true;
    source = "Gmail SMTP";
  }

  if (!host) return null;
  return {
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    family: 4,
    auth: user ? { user, pass } : undefined,
    from: cleanText(process.env.SMTP_FROM, user || ADMIN_EMAIL),
    source
  };
}

function maskEmail(value) {
  return cleanEmail(value).replace(/^(.{2}).*(@.*)$/, "$1***$2");
}

function safeSmtpConfig(config) {
  if (!config) return null;
  return {
    source: config.source,
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    requireTLS: Boolean(config.requireTLS),
    family: config.family || 4,
    authUser: config.auth?.user || null,
    from: config.from
  };
}

function smtpConfigKey(config) {
  return JSON.stringify({
    host: config.host,
    port: config.port,
    secure: Boolean(config.secure),
    requireTLS: Boolean(config.requireTLS),
    family: config.family || 4,
    user: config.auth?.user || "",
    from: config.from
  });
}

function isSameSmtpConfig(left, right) {
  return Boolean(left && right) && smtpConfigKey(left) === smtpConfigKey(right);
}

function isGmailSmtpConfig(config) {
  return /(^|\.)gmail\.com$/i.test(cleanEmail(config.auth?.user || "").split("@")[1] || "")
    || /smtp\.gmail\.com$/i.test(config.host || "");
}

function gmailStartTlsConfig(config) {
  if (!config?.auth?.user || !config?.auth?.pass || !isGmailSmtpConfig(config)) return null;
  return {
    ...config,
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    family: 4,
    source: `${config.source} STARTTLS fallback`
  };
}

function smtpAttemptConfigs(baseConfig, preferWorking = false) {
  const attempts = [];
  const pushUnique = (config) => {
    if (!config) return;
    if (!attempts.some((item) => isSameSmtpConfig(item, config))) attempts.push(config);
  };
  if (preferWorking) pushUnique(emailWorkingConfig);
  pushUnique(baseConfig);
  pushUnique(gmailStartTlsConfig(baseConfig));
  return attempts;
}

function smtpErrorDetails(error, config = null) {
  const details = {
    code: error?.code || null,
    errno: error?.errno || null,
    syscall: error?.syscall || null,
    address: error?.address || null,
    port: error?.port || null,
    hostname: error?.hostname || null,
    command: error?.command || null,
    responseCode: error?.responseCode || null,
    response: error?.response || null,
    message: error?.message || String(error),
    stack: sanitizeEmailError(error, config)
  };
  details.family = typeof details.address === "string" && details.address.includes(":") ? "IPv6" : (details.address ? "IPv4" : (config?.family || 4));
  return details;
}

function shouldTryStartTlsFallback(error) {
  const text = `${error?.code || ""} ${error?.message || ""} ${error?.stack || ""}`;
  return /ENETUNREACH|ETIMEDOUT|ESOCKET|ECONNECTION|Connection timeout|timeout/i.test(text);
}

function sanitizeEmailError(error, config = null) {
  let text = error?.stack || error?.message || String(error);
  const secretValues = [
    config?.auth?.pass,
    process.env.GMAIL_APP_PASSWORD,
    process.env.SMTP_PASSWORD,
    process.env.EMAIL_PASSWORD
  ].filter(Boolean);
  for (const secret of secretValues) text = text.split(String(secret)).join("[oculto]");
  return text.slice(0, 2000);
}

function safeEmailConfigStatus() {
  const config = smtpConfig();
  if (!config) {
    return {
      configured: false,
      verified: false,
      source: null,
      activeSource: null,
      lastVerifyAt: emailState.lastVerifyAt,
      lastError: emailState.lastError,
      lastAttemptedConfigs: emailState.lastAttemptedConfigs,
      message: "SMTP/Gmail no configurado. Los correos se guardan en email_outbox pero no salen a Gmail."
    };
  }
  return {
    configured: true,
    verified: emailState.verified,
    source: config.source,
    activeSource: emailState.activeSource,
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: Boolean(config.requireTLS),
    family: config.family || 4,
    user: config.auth?.user ? maskEmail(config.auth.user) : null,
    from: config.from,
    lastVerifyAt: emailState.lastVerifyAt,
    lastError: emailState.lastError,
    lastAttemptedConfigs: emailState.lastAttemptedConfigs
  };
}

function getEmailTransporter(config) {
  const cacheKey = smtpConfigKey(config);
  if (emailTransporterCache && emailTransporterCacheKey === cacheKey) return emailTransporterCache;
  emailTransporterCacheKey = cacheKey;
  emailTransporterCache = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: Boolean(config.requireTLS),
    family: config.family || 4,
    auth: config.auth,
    tls: {
      servername: config.host,
      minVersion: "TLSv1.2"
    },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 18000,
    dnsTimeout: 8000
  });
  return emailTransporterCache;
}

async function sendSmtpDiagnosticEmail(config) {
  const to = cleanEmail(ADMIN_EMAIL);
  if (!to || !to.includes("@")) return null;
  try {
    console.log("[email] verify() fallo; intentando correo de prueba con la misma configuracion:");
    console.log(JSON.stringify(safeSmtpConfig(config), null, 2));
    const transporter = getEmailTransporter(config);
    await transporter.sendMail({
      from: `"${BRAND_NAME}" <${config.from}>`,
      to,
      subject: `Prueba SMTP ${BRAND_NAME}`,
      text: "Correo de prueba automatico despues de fallo en verify().",
      html: emailLayout({
        title: "Prueba SMTP",
        subtitle: "Este correo se envio porque verify() fallo y el sistema intento diagnosticar el envio.",
        bodyHtml: emailParagraphs("Correo de prueba automatico despues de fallo en verify().")
      })
    });
    console.log("[email] Correo de prueba enviado correctamente.");
    return { sent: true };
  } catch (testError) {
    const details = smtpErrorDetails(testError, config);
    console.error("[email] Error completo enviando correo de prueba:");
    console.error(JSON.stringify(details, null, 2));
    return { sent: false, error: details };
  }
}

async function verifyEmailTransporterInBackground() {
  const config = smtpConfig();
  emailState.configured = Boolean(config);
  emailState.verified = false;
  emailState.source = config?.source || null;
  emailState.activeSource = null;
  emailState.lastVerifyAt = new Date().toISOString();
  emailState.lastError = null;
  emailState.lastAttemptedConfigs = [];
  emailWorkingConfig = null;
  if (!config) {
    console.warn("[email] SMTP/Gmail no configurado. Se usara email_outbox como respaldo.");
    return;
  }

  const attempts = smtpAttemptConfigs(config, false);
  let lastError = null;
  for (let index = 0; index < attempts.length; index += 1) {
    const attemptConfig = attempts[index];
    emailState.lastAttemptedConfigs.push(safeSmtpConfig(attemptConfig));
    console.log("[email] Verificando SMTP con configuracion:");
    console.log(JSON.stringify(safeSmtpConfig(attemptConfig), null, 2));
    try {
      const transporter = getEmailTransporter(attemptConfig);
      await transporter.verify();
      emailState.verified = true;
      emailState.activeSource = attemptConfig.source;
      emailState.lastError = null;
      emailWorkingConfig = attemptConfig;
      console.log(`[email] SMTP verificado correctamente usando ${attemptConfig.source}.`);
      return;
    } catch (error) {
      lastError = error;
      const details = smtpErrorDetails(error, attemptConfig);
      console.error(`[email] No se pudo verificar SMTP usando ${attemptConfig.source}.`);
      console.error(JSON.stringify(details, null, 2));
      await sendSmtpDiagnosticEmail(attemptConfig);
      const hasNext = index < attempts.length - 1;
      if (hasNext && shouldTryStartTlsFallback(error)) {
        console.warn("[email] Fallo compatible con red/IPv6/timeout. Probando fallback STARTTLS por 587.");
        continue;
      }
      break;
    }
  }

  const safeError = lastError ? smtpErrorDetails(lastError, attempts[attempts.length - 1] || config) : null;
  emailState.verified = false;
  emailState.lastError = safeError ? JSON.stringify(safeError) : "SMTP no verificado.";
}

function emailParagraphs(text) {
  return String(text || "")
    .split("\n")
    .map((line) => `<p style="margin:0 0 12px;color:#f5eef0;font-size:15px;line-height:1.55;">${escapeHtml(line) || "&nbsp;"}</p>`)
    .join("");
}

function emailInfoTable(rows = []) {
  const body = rows
    .filter((row) => row && row[1] !== undefined && row[1] !== null && String(row[1]).trim() !== "")
    .map(([label, value]) => `
      <tr>
        <td style="padding:10px 0;color:#ff9ba5;font-size:13px;font-weight:800;text-transform:uppercase;border-bottom:1px solid rgba(255,71,87,.22);">${escapeHtml(label)}</td>
        <td style="padding:10px 0;color:#ffffff;font-size:14px;text-align:right;border-bottom:1px solid rgba(255,71,87,.22);">${escapeHtml(value)}</td>
      </tr>`)
    .join("");
  return body ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">${body}</table>` : "";
}

function emailLayout({ title, subtitle, bodyHtml, footer }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#050509;font-family:Arial,Helvetica,sans-serif;color:#ffffff;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(135deg,#050509 0%,#24030a 48%,#050509 100%);padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#080b14;border:1px solid rgba(255,37,56,.45);border-radius:18px;overflow:hidden;box-shadow:0 22px 55px rgba(0,0,0,.35);">
            <tr>
              <td style="padding:24px 24px 12px;text-align:center;background:radial-gradient(circle at 50% 0%,rgba(255,37,56,.2),transparent 58%);">
                <div style="display:inline-block;border:1px solid rgba(255,37,56,.65);border-radius:14px;padding:11px 18px;color:#ff3346;font-size:28px;font-weight:900;letter-spacing:1px;text-shadow:0 0 18px rgba(255,37,56,.45);">GS</div>
                <div style="margin-top:9px;color:#ffffff;font-size:18px;font-weight:900;letter-spacing:.8px;">GARCITA VENTAS</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 26px;">
                <h1 style="margin:0;color:#ffffff;font-size:28px;line-height:1.15;text-align:center;">${escapeHtml(title)}</h1>
                ${subtitle ? `<p style="margin:10px 0 18px;color:#d8c3c8;font-size:15px;text-align:center;line-height:1.5;">${escapeHtml(subtitle)}</p>` : ""}
                <div style="background:rgba(24,5,10,.86);border:1px solid rgba(255,71,87,.35);border-radius:14px;padding:18px;">
                  ${bodyHtml}
                </div>
                <p style="margin:18px 4px 0;color:#9f8f95;font-size:12px;line-height:1.5;text-align:center;">${escapeHtml(footer || "Si no solicitaste este correo, puedes ignorarlo.")}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function verificationEmail(customer, code) {
  const text = [
    `Hola ${customer.name},`,
    "",
    `Tu codigo de verificacion de ${BRAND_NAME} es: ${code}`,
    "Expira en 10 minutos.",
    "Si no solicitaste este codigo, ignoralo."
  ].join("\n");
  const html = emailLayout({
    title: "Verifica tu correo",
    subtitle: "Usa este codigo para activar tu cuenta y proteger tu saldo.",
    bodyHtml: `
      <p style="margin:0 0 12px;color:#f5eef0;font-size:16px;line-height:1.55;">Hola ${escapeHtml(customer.name)},</p>
      <p style="margin:0 0 16px;color:#f5eef0;font-size:15px;line-height:1.55;">Este es tu codigo de verificacion:</p>
      <div style="font-size:40px;letter-spacing:8px;font-weight:900;text-align:center;color:#ffffff;background:#03050b;border:1px solid rgba(255,37,56,.65);border-radius:14px;padding:18px 10px;margin:10px 0 16px;">${escapeHtml(code)}</div>
      <p style="margin:0;color:#ffb3bc;font-size:14px;text-align:center;">Expira en 10 minutos y solo se puede usar una vez.</p>`,
    footer: "Si no solicitaste este codigo, ignoralo."
  });
  return { text, html };
}

function genericStoreEmail({ title, subtitle, lines = [], rows = [], footer }) {
  const text = [
    title,
    subtitle || "",
    "",
    ...lines,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`)
  ].filter(Boolean).join("\n");
  const html = emailLayout({
    title,
    subtitle,
    bodyHtml: `${emailParagraphs(lines.join("\n"))}${emailInfoTable(rows)}`,
    footer
  });
  return { text, html };
}

function topupReceivedAdminEmail(customer, topup) {
  return genericStoreEmail({
    title: "Comprobante recibido",
    subtitle: "Hay una recarga pendiente por revisar en el panel admin.",
    lines: ["Revisa el comprobante adjunto y aprueba o rechaza la solicitud desde el panel."],
    rows: [
      ["Orden", topup.orderNumber],
      ["Comprador", customer.name],
      ["Correo", customer.email],
      ["Producto", topup.productName || "Recarga de saldo"],
      ["Opcion", topup.selectedOption || "Sin opcion"],
      ["Metodo", topup.method],
      ["Monto", `${topup.amount.toFixed(2)} MX`],
      ["Precio producto", topup.price ? `${topup.price.toFixed(2)} MX` : ""],
      ["Fecha", new Date().toLocaleString("es")],
      ["Estado", "Pendiente"]
    ]
  });
}

function topupReceivedClientEmail(customer, topup) {
  return genericStoreEmail({
    title: "Comprobante recibido",
    subtitle: "Hemos recibido tu comprobante correctamente.",
    lines: ["Nuestro equipo lo revisara lo antes posible. Te avisaremos por correo cuando sea aprobado o rechazado."],
    rows: [
      ["Orden", topup.orderNumber],
      ["Producto", topup.productName || "Recarga de saldo"],
      ["Metodo", topup.method],
      ["Monto", `${topup.amount.toFixed(2)} MX`],
      ["Estado", "Pendiente"]
    ]
  });
}

function topupApprovedEmail(customer, topup, balance, adminNote) {
  return genericStoreEmail({
    title: "Compra aprobada",
    subtitle: "Tu compra fue aprobada. Gracias por comprar en Garcita Ventas.",
    lines: [
      `Hola ${customer.name},`,
      topup.product_name ? "Tu comprobante fue aprobado y el saldo ya esta disponible para completar tu compra." : "Tu recarga fue aprobada y el saldo ya esta en tu cuenta.",
      adminNote ? `Instrucciones o nota: ${adminNote}` : ""
    ].filter(Boolean),
    rows: [
      ["Orden", topup.order_number || `#${topup.id}`],
      ["Producto", topup.product_name || "Recarga de saldo"],
      ["Monto agregado", `${Number(topup.amount).toFixed(2)} MX`],
      ["Saldo actual", `${balance.toFixed(2)} MX`],
      ["Estado", "Aprobada"]
    ]
  });
}

function topupRejectedEmail(customer, topup, reason) {
  return genericStoreEmail({
    title: "Compra rechazada",
    subtitle: "Tu comprobante no pudo ser aprobado.",
    lines: [
      `Hola ${customer.name},`,
      `Motivo del rechazo: ${reason}`,
      "Puedes subir un nuevo comprobante desde la pagina si el pago fue correcto."
    ],
    rows: [
      ["Orden", topup.order_number || `#${topup.id}`],
      ["Producto", topup.product_name || "Recarga de saldo"],
      ["Estado", "Rechazada"]
    ]
  });
}

async function rememberEmail(recipientEmail, subject, body, status, errorText = null) {
  if (!isDatabaseReady()) return;
  try {
    await query(
      `INSERT INTO email_outbox (recipient_email, subject, body, status, error_text, sent_at)
       VALUES (:recipientEmail, :subject, :body, :status, :errorText, :sentAt)`,
      {
        recipientEmail,
        subject,
        body,
        status,
        errorText: errorText ? String(errorText).slice(0, 2000) : null,
        sentAt: status === "sent" ? new Date() : null
      }
    );
  } catch (error) {
    console.warn("[email] No se pudo guardar el registro en email_outbox:");
    console.warn(error.stack || error);
  }
}

async function sendStoreEmail(input, subject, body) {
  const options = typeof input === "object" && input !== null
    ? input
    : { to: input, subject, text: body };
  const email = cleanEmail(options.to);
  const cleanSubject = cleanLimited(options.subject, "", 220);
  const text = cleanLimited(options.text || "", "", 20000);
  const html = options.html || emailLayout({
    title: cleanSubject,
    bodyHtml: emailParagraphs(text),
    footer: "Garcita Ventas"
  });
  const attachments = Array.isArray(options.attachments) ? options.attachments : [];
  const config = smtpConfig();
  if (!config) {
    console.warn(`[email] SMTP no configurado. Guardando correo pendiente para ${email}: ${cleanSubject}`);
    await rememberEmail(email, cleanSubject, text, "pending", "SMTP no configurado");
    return {
      sent: false,
      queued: true,
      reason: "SMTP/Gmail no configurado en el servidor.",
      provider: null
    };
  }

  const attempts = smtpAttemptConfigs(config, Boolean(emailWorkingConfig));
  let lastError = null;
  let lastConfig = config;
  for (let index = 0; index < attempts.length; index += 1) {
    const attemptConfig = attempts[index];
    lastConfig = attemptConfig;
    try {
      console.log("[email] Enviando correo con configuracion SMTP:");
      console.log(JSON.stringify(safeSmtpConfig(attemptConfig), null, 2));
      const transporter = getEmailTransporter(attemptConfig);
      await transporter.sendMail({
        from: `"${BRAND_NAME}" <${attemptConfig.from}>`,
        to: email,
        subject: cleanSubject,
        text,
        html,
        attachments
      });
      emailWorkingConfig = attemptConfig;
      emailState.verified = true;
      emailState.activeSource = attemptConfig.source;
      emailState.lastError = null;
      await rememberEmail(email, cleanSubject, text, "sent");
      return { sent: true, queued: false, provider: attemptConfig.source };
    } catch (error) {
      lastError = error;
      const details = smtpErrorDetails(error, attemptConfig);
      console.error(`[email] Error completo enviando correo a ${email}:`);
      console.error(JSON.stringify(details, null, 2));
      const hasNext = index < attempts.length - 1;
      if (hasNext && shouldTryStartTlsFallback(error)) {
        console.warn("[email] Envio fallo por red/IPv6/timeout. Probando siguiente configuracion SMTP.");
        continue;
      }
      break;
    }
  }

  const finalError = smtpErrorDetails(lastError, lastConfig);
  const finalErrorText = JSON.stringify(finalError);
  await rememberEmail(email, cleanSubject, text, "failed", finalErrorText);
  emailState.lastError = finalErrorText;
  return {
    sent: false,
    queued: true,
    provider: lastConfig.source,
    reason: finalError.message || "Correo no enviado."
  };
}

function resendSecondsRemaining(record) {
  if (!record?.last_sent_at) return 0;
  const sentAt = new Date(record.last_sent_at).getTime();
  if (!Number.isFinite(sentAt)) return 0;
  return Math.max(0, VERIFICATION_RESEND_SECONDS - Math.floor((Date.now() - sentAt) / 1000));
}

async function sendVerificationCode(customer, { enforceCooldown = true } = {}) {
  const recentRows = await query(
    `SELECT id, last_sent_at, created_at
     FROM customer_verification_codes
     WHERE customer_id = :customerId AND email = :email AND purpose = 'email_verification'
       AND used_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    { customerId: customer.id, email: customer.email }
  );
  const remaining = enforceCooldown ? resendSecondsRemaining(recentRows[0]) : 0;
  if (remaining > 0) {
    const error = new Error(`Espera ${remaining} segundos antes de reenviar otro codigo.`);
    error.statusCode = 429;
    error.retryAfter = remaining;
    throw error;
  }

  await query(
    `UPDATE customer_verification_codes
     SET used_at = NOW()
     WHERE customer_id = :customerId AND email = :email AND purpose = 'email_verification' AND used_at IS NULL`,
    { customerId: customer.id, email: customer.email }
  );

  const code = randomCode(6);
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
  const result = await query(
    `INSERT INTO customer_verification_codes
       (customer_id, email, code_hash, attempts, purpose, expires_at, last_sent_at, delivery_status)
     VALUES
       (:customerId, :email, :codeHash, 0, 'email_verification', :expiresAt, NOW(), 'pending')`,
    {
      customerId: customer.id,
      email: customer.email,
      codeHash,
      expiresAt
    }
  );
  const emailContent = verificationEmail(customer, code);
  const delivery = await sendStoreEmail({
    to: customer.email,
    subject: `Codigo de verificacion ${BRAND_NAME}`,
    text: emailContent.text,
    html: emailContent.html
  });
  await query(
    `UPDATE customer_verification_codes
     SET delivery_status = :status, delivery_error = :errorText
     WHERE id = :id`,
    {
      id: result.insertId,
      status: delivery.sent ? "sent" : "failed",
      errorText: delivery.sent ? null : cleanLimited(delivery.reason, "Correo no enviado.", 1000)
    }
  );
  return {
    delivery,
    retryAfter: VERIFICATION_RESEND_SECONDS,
    resendAvailableAt: new Date(Date.now() + VERIFICATION_RESEND_SECONDS * 1000).toISOString()
  };
}

async function readCustomerBalance(customerId, connection = null) {
  const executor = connection || requirePool();
  const [rows] = await executor.execute(
    "SELECT COALESCE(SUM(amount), 0) AS balance FROM wallet_ledger WHERE customer_id = :customerId",
    { customerId }
  );
  return normalizeAmount(rows[0]?.balance || 0);
}

async function insertLedgerEntry(connection, data) {
  const currentBalance = await readCustomerBalance(data.customerId, connection);
  const amount = normalizeAmount(data.amount);
  const balanceAfter = normalizeAmount(currentBalance + amount);
  if (balanceAfter < 0) {
    const error = new Error("Saldo insuficiente.");
    error.statusCode = 400;
    throw error;
  }
  await connection.execute(
    `INSERT INTO wallet_ledger
      (customer_id, type, amount, balance_after, reference_type, reference_id, description, created_by_admin_id)
     VALUES
      (:customerId, :type, :amount, :balanceAfter, :referenceType, :referenceId, :description, :adminId)`,
    {
      customerId: data.customerId,
      type: data.type,
      amount,
      balanceAfter,
      referenceType: data.referenceType || null,
      referenceId: data.referenceId || null,
      description: cleanLimited(data.description, "", 255),
      adminId: data.adminId || null
    }
  );
  return balanceAfter;
}

function purchaseReceiptEmail(customer, order, balanceAfter) {
  return genericStoreEmail({
    title: "Comprobante de compra",
    subtitle: "Tu compra fue aprobada y pagada con saldo.",
    lines: [
      `Hola ${customer.name},`,
      "Gracias por comprar en Garcita Ventas. Guarda este comprobante y tu PIN/KEY.",
      "Para soporte, escribe a Yoan o al dueno desde los botones de la pagina."
    ],
    rows: [
      ["Cliente", customer.name],
      ["Correo", customer.email],
      ["Producto", order.productName],
      ["Opcion", order.selectedOption || "Sin opcion"],
      ["Precio", `${normalizeAmount(order.price).toFixed(2)} MX`],
      ["Bono agregado", `${normalizeAmount(order.rewardAmount).toFixed(2)} MX`],
      ["Saldo actual", `${normalizeAmount(balanceAfter).toFixed(2)} MX`],
      ["Comprobante", order.receiptCode],
      ["PIN/KEY", order.pinCode]
    ]
  });
}

async function notifyReceipt(customer, order, balanceAfter) {
  const emailContent = purchaseReceiptEmail(customer, order, balanceAfter);
  await Promise.allSettled([
    sendStoreEmail({
      to: customer.email,
      subject: `Comprobante ${order.receiptCode} - ${BRAND_NAME}`,
      text: emailContent.text,
      html: emailContent.html
    }),
    sendStoreEmail({
      to: ADMIN_EMAIL,
      subject: `Copia venta ${order.receiptCode} - ${BRAND_NAME}`,
      text: emailContent.text,
      html: emailContent.html
    })
  ]);
}

function selectedProductPurchase(product, selectedOption) {
  const options = parseProductOptions(product.purchase_options);
  if (options.length) {
    const cleanSelected = cleanLimited(selectedOption, "", 220);
    const option = options.find((item) => item.label === cleanSelected) || options[0];
    const price = extractPriceAmount(option.price, product.price);
    return {
      label: option.label,
      priceText: option.price || `${price} MX`,
      price
    };
  }
  const price = normalizeAmount(product.price);
  return {
    label: cleanLimited(selectedOption, "", 220) || null,
    priceText: `${price} MX`,
    price
  };
}

async function generateUniqueTopupOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const orderNumber = randomToken("ORD", 5);
    const rows = await query("SELECT id FROM topup_requests WHERE order_number = :orderNumber LIMIT 1", { orderNumber });
    if (!rows.length) return orderNumber;
  }
  const error = new Error("No se pudo generar un numero de orden. Intenta de nuevo.");
  error.statusCode = 500;
  throw error;
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

function normalizeCatalogText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function defaultProductMatches(row, product) {
  const rowName = normalizeCatalogText(row.name);
  const aliases = [product.name, ...(product.aliases || [])].map(normalizeCatalogText);
  if (aliases.includes(rowName)) return true;
  if (row.image_url && product.imageUrl && row.image_url === product.imageUrl) return true;
  return false;
}

async function syncDefaultCatalog() {
  const rows = await query("SELECT id, name, image_url, sort_order FROM products ORDER BY sort_order ASC, id ASC");
  const usedIds = new Set();

  for (let index = 0; index < DEFAULT_PRODUCTS.length; index += 1) {
    const product = DEFAULT_PRODUCTS[index];
    const existing = rows.find((row) => !usedIds.has(row.id) && defaultProductMatches(row, product));
    if (existing) usedIds.add(existing.id);
    await upsertDefaultProduct(existing || null, product, index);
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

app.get("/api/payment-methods", (_req, res) => {
  res.json(paymentMethodsJson());
});

app.post("/api/customer/register", asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const name = cleanLimited(req.body.name, "", 160);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  if (!name || !email || !email.includes("@")) return res.status(400).json({ error: "Nombre y correo validos son obligatorios." });
  if (password.length < 6) return res.status(400).json({ error: "La contrasena debe tener minimo 6 caracteres." });

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await query("SELECT * FROM customers WHERE email = :email LIMIT 1", { email });
  let customer;
  if (existing.length && existing[0].email_verified) {
    return res.status(409).json({ error: "Ese correo ya esta registrado. Inicia sesion." });
  }
  if (existing.length) {
    await query(
      `UPDATE customers
       SET name = :name, password_hash = :passwordHash, active = 1, last_ip = :lastIp, updated_at = NOW()
       WHERE id = :id`,
      { name, passwordHash, lastIp: requestIdentity(req), id: existing[0].id }
    );
    customer = { ...existing[0], name, email, id: existing[0].id };
  } else {
    const result = await query(
      `INSERT INTO customers (name, email, password_hash, email_verified, active, last_ip)
       VALUES (:name, :email, :passwordHash, 0, 1, :lastIp)`,
      { name, email, passwordHash, lastIp: requestIdentity(req) }
    );
    customer = { id: result.insertId, name, email };
  }

  const verification = await sendVerificationCode(customer);
  const payload = {
    ok: true,
    message: verification.delivery.sent ? "Codigo enviado." : "Correo no enviado.",
    emailDelivery: verification.delivery,
    retryAfter: verification.retryAfter,
    resendAvailableAt: verification.resendAvailableAt
  };
  res.status(201).json(payload);
}));

app.post("/api/customer/verify-email", asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const email = cleanEmail(req.body.email);
  const code = cleanLimited(req.body.code, "", 12).replace(/\D/g, "");
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Codigo incorrecto." });
  const customers = await query("SELECT * FROM customers WHERE email = :email AND active = 1 LIMIT 1", { email });
  if (!customers.length) return res.status(404).json({ error: "Cliente no encontrado." });
  const customer = customers[0];
  const codes = await query(
    `SELECT * FROM customer_verification_codes
     WHERE customer_id = :customerId AND email = :email AND purpose = 'email_verification'
       AND used_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    { customerId: customer.id, email }
  );

  const record = codes[0];
  if (!record) return res.status(400).json({ error: "Codigo expirado o no solicitado." });
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    await query("UPDATE customer_verification_codes SET used_at = NOW() WHERE id = :id", { id: record.id });
    return res.status(400).json({ error: "Codigo expirado. Solicita uno nuevo." });
  }
  if (Number(record.attempts || 0) >= VERIFICATION_MAX_ATTEMPTS) {
    await query("UPDATE customer_verification_codes SET used_at = NOW() WHERE id = :id", { id: record.id });
    return res.status(429).json({ error: "Demasiados intentos. Solicita un codigo nuevo." });
  }
  const matched = await bcrypt.compare(code, record.code_hash);
  if (!matched) {
    const attempts = Number(record.attempts || 0) + 1;
    await query("UPDATE customer_verification_codes SET attempts = :attempts WHERE id = :id", {
      attempts,
      id: record.id
    });
    if (attempts >= VERIFICATION_MAX_ATTEMPTS) {
      await query("UPDATE customer_verification_codes SET used_at = NOW() WHERE id = :id", { id: record.id });
      return res.status(429).json({ error: "Demasiados intentos. Solicita un codigo nuevo." });
    }
    return res.status(400).json({ error: `Codigo incorrecto. Intentos restantes: ${VERIFICATION_MAX_ATTEMPTS - attempts}.` });
  }

  await query("UPDATE customer_verification_codes SET used_at = NOW() WHERE id = :id", { id: record.id });
  await query("UPDATE customers SET email_verified = 1, updated_at = NOW() WHERE id = :id", { id: customer.id });
  const verifiedCustomer = { ...customer, email_verified: 1 };
  setCustomerCookie(res, signCustomerToken(verifiedCustomer));
  res.json({ customer: safeCustomerJson(verifiedCustomer, await readCustomerBalance(customer.id)) });
}));

app.post("/api/customer/resend-code", asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const email = cleanEmail(req.body.email);
  const customers = await query("SELECT * FROM customers WHERE email = :email AND active = 1 LIMIT 1", { email });
  if (!customers.length) return res.status(404).json({ error: "Cliente no encontrado." });
  if (customers[0].email_verified) return res.status(400).json({ error: "Ese correo ya esta verificado." });
  const verification = await sendVerificationCode(customers[0]);
  const payload = {
    ok: true,
    message: verification.delivery.sent ? "Codigo reenviado." : "Correo no enviado.",
    emailDelivery: verification.delivery,
    retryAfter: verification.retryAfter,
    resendAvailableAt: verification.resendAvailableAt
  };
  res.json(payload);
}));

app.post("/api/customer/login", asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const email = cleanEmail(req.body.email);
  const password = String(req.body.password || "");
  const rows = await query("SELECT * FROM customers WHERE email = :email AND active = 1 LIMIT 1", { email });
  const customer = rows[0];
  if (!customer || !(await bcrypt.compare(password, customer.password_hash))) {
    return res.status(401).json({ error: "Correo o contrasena incorrectos." });
  }
  if (!customer.email_verified) {
    return res.status(403).json({ error: "Verifica tu correo antes de iniciar sesion.", verificationRequired: true });
  }
  await query("UPDATE customers SET last_ip = :lastIp, updated_at = NOW() WHERE id = :id", {
    lastIp: requestIdentity(req),
    id: customer.id
  });
  setCustomerCookie(res, signCustomerToken(customer));
  res.json({ customer: safeCustomerJson(customer, await readCustomerBalance(customer.id)) });
}));

app.post("/api/customer/logout", (_req, res) => {
  res.clearCookie(CUSTOMER_COOKIE, { httpOnly: true, sameSite: "strict", secure: IS_PRODUCTION, path: "/" });
  res.json({ ok: true });
});

app.get("/api/customer/me", customerAuth, asyncHandler(async (req, res) => {
  const balance = await readCustomerBalance(req.customer.id);
  const topups = await query(
    `SELECT id, order_number, method, amount, product_name, selected_option, price, status, proof_note, admin_note, created_at, updated_at
     FROM topup_requests
     WHERE customer_id = :customerId
     ORDER BY id DESC
     LIMIT 10`,
    { customerId: req.customer.id }
  );
  res.json({
    customer: safeCustomerJson(req.customer, balance),
    topups: topups.map((item) => ({ ...item, amount: Number(item.amount), price: item.price == null ? null : Number(item.price) }))
  });
}));

app.post("/api/wallet/topups", customerAuth, asyncHandler(async (req, res) => {
  if (!req.customer.email_verified) return res.status(403).json({ error: "Verifica tu correo antes de recargar saldo." });
  const allowed = new Set(["transferencia", "oxxo", "binance"]);
  const method = cleanLimited(req.body.method, "", 40);
  const amount = normalizeAmount(req.body.amount);
  const proof = parseProofUpload(req.body.proofImage, req.body.proofFilename);
  const proofNote = cleanLimited(req.body.proofNote, "", 2000);
  const productId = Number(req.body.productId || 0) || null;
  let productName = cleanLimited(req.body.productName, "", 180);
  let selectedOption = cleanLimited(req.body.selectedOption, "", 220);
  let price = normalizeAmount(req.body.price || 0);
  if (!allowed.has(method)) return res.status(400).json({ error: "Metodo de pago invalido." });
  if (amount <= 0) return res.status(400).json({ error: "El monto de recarga debe ser mayor a 0 MX." });
  if (!proof && !proofNote) return res.status(400).json({ error: "Sube un comprobante o escribe una nota de referencia." });

  if (productId) {
    const products = await query("SELECT * FROM products WHERE id = :id AND active = 1 LIMIT 1", { id: productId });
    if (products.length) {
      const product = products[0];
      const purchase = selectedProductPurchase(product, selectedOption);
      productName = product.name;
      selectedOption = purchase.label || selectedOption;
      price = purchase.price || price;
    }
  }

  const duplicateRows = await query(
    `SELECT id, order_number
     FROM topup_requests
     WHERE customer_id = :customerId AND method = :method AND amount = :amount
       AND status = 'pending' AND created_at > (NOW() - INTERVAL 60 SECOND)
     ORDER BY id DESC
     LIMIT 1`,
    { customerId: req.customer.id, method, amount }
  );
  if (duplicateRows.length) {
    return res.status(409).json({
      error: `Ya recibimos un comprobante pendiente hace unos segundos. Orden: ${duplicateRows[0].order_number || duplicateRows[0].id}.`
    });
  }

  const orderNumber = await generateUniqueTopupOrderNumber();

  const result = await query(
    `INSERT INTO topup_requests
       (order_number, customer_id, buyer_name, buyer_email, method, amount, product_id, product_name,
        selected_option, price, proof_image, proof_mime, proof_filename, proof_size, proof_note, status)
     VALUES
       (:orderNumber, :customerId, :buyerName, :buyerEmail, :method, :amount, :productId, :productName,
        :selectedOption, :price, :proofImage, :proofMime, :proofFilename, :proofSize, :proofNote, 'pending')`,
    {
      orderNumber,
      customerId: req.customer.id,
      buyerName: req.customer.name,
      buyerEmail: req.customer.email,
      method,
      amount,
      productId,
      productName: productName || null,
      selectedOption: selectedOption || null,
      price: price > 0 ? price : null,
      proofImage: proof?.dataUrl || null,
      proofMime: proof?.mime || null,
      proofFilename: proof?.filename || null,
      proofSize: proof?.size || null,
      proofNote: proofNote || null
    }
  );
  const topupEmail = {
    id: result.insertId,
    orderNumber,
    method,
    amount,
    productName,
    selectedOption,
    price,
    proofNote
  };
  const adminEmail = topupReceivedAdminEmail(req.customer, topupEmail);
  const clientEmail = topupReceivedClientEmail(req.customer, topupEmail);
  await Promise.allSettled([
    sendStoreEmail({
      to: ADMIN_EMAIL,
      subject: `Comprobante ${orderNumber} pendiente - ${BRAND_NAME}`,
      text: adminEmail.text,
      html: adminEmail.html,
      attachments: proofAttachments(proof)
    }),
    sendStoreEmail({
      to: req.customer.email,
      subject: `Comprobante recibido ${orderNumber} - ${BRAND_NAME}`,
      text: clientEmail.text,
      html: clientEmail.html
    })
  ]);
  res.status(201).json({
    id: result.insertId,
    orderNumber,
    status: "pending",
    message: "Comprobante recibido. El saldo se agrega cuando admin lo apruebe."
  });
}));

app.get("/api/wallet/topups", customerAuth, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT id, order_number, method, amount, product_name, selected_option, price, status, proof_note, admin_note, created_at, updated_at
     FROM topup_requests
     WHERE customer_id = :customerId
     ORDER BY id DESC
     LIMIT 50`,
    { customerId: req.customer.id }
  );
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount), price: row.price == null ? null : Number(row.price) })));
}));

app.post("/api/customer/purchase", customerAuth, asyncHandler(async (req, res) => {
  if (!req.customer.email_verified) return res.status(403).json({ error: "Verifica tu correo antes de comprar." });
  const productId = Number(req.body.productId || 0);
  const selectedOption = cleanLimited(req.body.selectedOption, "", 220);
  const connection = await requirePool().getConnection();
  let orderPayload = null;
  let balanceAfterReward = 0;
  try {
    await connection.beginTransaction();
    const [customerRows] = await connection.execute(
      "SELECT * FROM customers WHERE id = :id AND active = 1 FOR UPDATE",
      { id: req.customer.id }
    );
    if (!customerRows.length) {
      const error = new Error("Cliente no encontrado.");
      error.statusCode = 404;
      throw error;
    }
    const customer = customerRows[0];
    const [productRows] = await connection.execute(
      "SELECT * FROM products WHERE id = :id AND active = 1 LIMIT 1",
      { id: productId }
    );
    if (!productRows.length) {
      const error = new Error("Producto no encontrado.");
      error.statusCode = 404;
      throw error;
    }
    const product = productRows[0];
    const purchase = selectedProductPurchase(product, selectedOption);
    if (purchase.price <= 0) {
      const error = new Error("El producto no tiene un precio valido.");
      error.statusCode = 400;
      throw error;
    }
    const balance = await readCustomerBalance(customer.id, connection);
    if (balance < purchase.price) {
      const error = new Error(`Saldo insuficiente. Tienes ${balance.toFixed(2)} MX y necesitas ${purchase.price.toFixed(2)} MX.`);
      error.statusCode = 400;
      throw error;
    }

    const receiptCode = randomToken("GS", 5);
    const pinCode = randomToken("KEY", 6);
    const selectedOptionText = purchase.label
      ? `${purchase.label}${purchase.priceText ? ` - ${purchase.priceText}` : ""}`
      : null;
    const [orderResult] = await connection.execute(
      `INSERT INTO customer_orders
        (customer_id, product_id, product_name, selected_option, price, reward_amount, status, receipt_code, pin_code)
       VALUES
        (:customerId, :productId, :productName, :selectedOption, :price, :rewardAmount, 'paid', :receiptCode, :pinCode)`,
      {
        customerId: customer.id,
        productId: product.id,
        productName: product.name,
        selectedOption: selectedOptionText,
        price: purchase.price,
        rewardAmount: PURCHASE_REWARD,
        receiptCode,
        pinCode
      }
    );
    const orderId = orderResult.insertId;
    await insertLedgerEntry(connection, {
      customerId: customer.id,
      type: "purchase",
      amount: -purchase.price,
      referenceType: "customer_orders",
      referenceId: orderId,
      description: `Compra ${product.name}`
    });
    balanceAfterReward = await insertLedgerEntry(connection, {
      customerId: customer.id,
      type: "reward",
      amount: PURCHASE_REWARD,
      referenceType: "customer_orders",
      referenceId: orderId,
      description: `Bono por compra ${product.name}`
    });
    await connection.execute(
      `INSERT INTO sales (product_id, product_name, price, selected_option, status, source, session_id)
       VALUES (:productId, :productName, :price, :selectedOption, 'pagado', 'saldo-web', :sessionId)`,
      {
        productId: product.id,
        productName: product.name,
        price: purchase.price,
        selectedOption: selectedOptionText,
        sessionId: cleanText(req.body.sessionId) || null
      }
    );
    await connection.commit();
    orderPayload = {
      id: orderId,
      productName: product.name,
      selectedOption: selectedOptionText,
      price: purchase.price,
      rewardAmount: PURCHASE_REWARD,
      receiptCode,
      pinCode
    };
    notifyReceipt(customer, orderPayload, balanceAfterReward).catch((error) => {
      console.error("No se pudo enviar comprobante de compra:");
      console.error(error.stack || error);
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  broadcast("reports-updated", {});
  res.status(201).json({
    order: orderPayload,
    balance: balanceAfterReward,
    support: supportLinks(orderPayload),
    message: "Compra pagada con saldo. Te enviamos comprobante y PIN al correo."
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

app.get("/api/admin/customers", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json([]);
  const rows = await query(
    `SELECT
       c.id, c.name, c.email, c.email_verified, c.active, c.last_ip, c.created_at,
       COALESCE(SUM(w.amount), 0) AS balance,
       COUNT(DISTINCT o.id) AS orders_count
     FROM customers c
     LEFT JOIN wallet_ledger w ON w.customer_id = c.id
     LEFT JOIN customer_orders o ON o.customer_id = c.id
     GROUP BY c.id, c.name, c.email, c.email_verified, c.active, c.last_ip, c.created_at
     ORDER BY c.id DESC
     LIMIT 300`
  );
  res.json(rows.map((row) => ({
    ...row,
    email_verified: Boolean(row.email_verified),
    active: Boolean(row.active),
    balance: Number(row.balance || 0),
    orders_count: Number(row.orders_count || 0)
  })));
}));

app.post("/api/admin/customers/:id/balance", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const customerId = Number(req.params.id);
  const amount = normalizeAmount(req.body.amount);
  const note = cleanLimited(req.body.note, "Ajuste manual admin", 255) || "Ajuste manual admin";
  if (!amount) return res.status(400).json({ error: "El monto no puede ser 0." });
  const connection = await requirePool().getConnection();
  let balance = 0;
  let customer = null;
  try {
    await connection.beginTransaction();
    const [customers] = await connection.execute(
      "SELECT * FROM customers WHERE id = :id AND active = 1 FOR UPDATE",
      { id: customerId }
    );
    if (!customers.length) {
      const error = new Error("Cliente no encontrado.");
      error.statusCode = 404;
      throw error;
    }
    customer = customers[0];
    balance = await insertLedgerEntry(connection, {
      customerId,
      type: "admin_adjustment",
      amount,
      referenceType: "admin_adjustment",
      referenceId: req.user.id,
      description: note,
      adminId: req.user.id
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await sendStoreEmail(
    customer.email,
    `Saldo actualizado - ${BRAND_NAME}`,
    [
      `Hola ${customer.name},`,
      "",
      `Tu saldo fue actualizado por admin: ${amount > 0 ? "+" : ""}${amount.toFixed(2)} MX.`,
      `Nuevo saldo: ${balance.toFixed(2)} MX.`,
      `Nota: ${note}`
    ].join("\n")
  );
  res.json({ ok: true, balance });
}));

app.get("/api/admin/topups", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json([]);
  const rows = await query(
    `SELECT
       t.*, c.name AS customer_name, c.email AS customer_email
     FROM topup_requests t
     JOIN customers c ON c.id = t.customer_id
     ORDER BY FIELD(t.status, 'pending', 'approved', 'rejected'), t.id DESC
     LIMIT 200`
  );
  res.json(rows.map((row) => ({ ...row, amount: Number(row.amount), price: row.price == null ? null : Number(row.price) })));
}));

app.post("/api/admin/topups/:id/approve", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const topupId = Number(req.params.id);
  const adminNote = cleanLimited(req.body.adminNote, "", 2000);
  const connection = await requirePool().getConnection();
  let topup = null;
  let customer = null;
  let balance = 0;
  try {
    await connection.beginTransaction();
    const [topups] = await connection.execute(
      "SELECT * FROM topup_requests WHERE id = :id FOR UPDATE",
      { id: topupId }
    );
    if (!topups.length) {
      const error = new Error("Recarga no encontrada.");
      error.statusCode = 404;
      throw error;
    }
    topup = topups[0];
    if (topup.status !== "pending") {
      const error = new Error("Esta recarga ya fue revisada.");
      error.statusCode = 400;
      throw error;
    }
    const [customers] = await connection.execute(
      "SELECT * FROM customers WHERE id = :id AND active = 1 FOR UPDATE",
      { id: topup.customer_id }
    );
    if (!customers.length) {
      const error = new Error("Cliente no encontrado.");
      error.statusCode = 404;
      throw error;
    }
    customer = customers[0];
    balance = await insertLedgerEntry(connection, {
      customerId: customer.id,
      type: "topup",
      amount: Number(topup.amount),
      referenceType: "topup_requests",
      referenceId: topup.id,
      description: `Recarga aprobada por ${topup.method}`,
      adminId: req.user.id
    });
    await connection.execute(
      `UPDATE topup_requests
       SET status = 'approved', approved_by = :adminId, approved_at = NOW(), admin_note = :adminNote, updated_at = NOW()
       WHERE id = :id`,
      { adminId: req.user.id, adminNote: adminNote || null, id: topup.id }
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const approvedEmail = topupApprovedEmail(customer, topup, balance, adminNote);
  await sendStoreEmail({
    to: customer.email,
    subject: `Compra aprobada - ${BRAND_NAME}`,
    text: approvedEmail.text,
    html: approvedEmail.html
  });
  broadcast("reports-updated", {});
  res.json({ ok: true, balance });
}));

app.post("/api/admin/topups/:id/reject", auth, adminOnly, asyncHandler(async (req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const topupId = Number(req.params.id);
  const adminNote = cleanLimited(req.body.adminNote, "Comprobante rechazado", 2000) || "Comprobante rechazado";
  const connection = await requirePool().getConnection();
  let topup = null;
  let customer = null;
  try {
    await connection.beginTransaction();
    const [topups] = await connection.execute(
      "SELECT * FROM topup_requests WHERE id = :id FOR UPDATE",
      { id: topupId }
    );
    if (!topups.length) {
      const error = new Error("Recarga no encontrada.");
      error.statusCode = 404;
      throw error;
    }
    topup = topups[0];
    if (topup.status !== "pending") {
      const error = new Error("Esta recarga ya fue revisada.");
      error.statusCode = 400;
      throw error;
    }
    const [customers] = await connection.execute(
      "SELECT * FROM customers WHERE id = :id AND active = 1 LIMIT 1",
      { id: topup.customer_id }
    );
    customer = customers[0] || { name: "Cliente", email: ADMIN_EMAIL };
    await connection.execute(
      "UPDATE topup_requests SET status = 'rejected', admin_note = :adminNote, updated_at = NOW() WHERE id = :id",
      { adminNote, id: topupId }
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const rejectedEmail = topupRejectedEmail(customer, topup, adminNote);
  await sendStoreEmail({
    to: customer.email,
    subject: `Compra rechazada - ${BRAND_NAME}`,
    text: rejectedEmail.text,
    html: rejectedEmail.html
  });
  res.json({ ok: true });
}));

app.get("/api/admin/orders", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json([]);
  const rows = await query(
    `SELECT
       o.*, c.name AS customer_name, c.email AS customer_email
     FROM customer_orders o
     JOIN customers c ON c.id = o.customer_id
     ORDER BY o.id DESC
     LIMIT 300`
  );
  res.json(rows.map((row) => ({
    ...row,
    price: Number(row.price),
    reward_amount: Number(row.reward_amount)
  })));
}));

app.get("/api/admin/backup", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return databaseWriteUnavailable(res);
  const [
    products,
    sales,
    customers,
    ledger,
    topups,
    orders,
    settings,
    emailOutbox
  ] = await Promise.all([
    query("SELECT * FROM products ORDER BY id ASC"),
    query("SELECT * FROM sales ORDER BY id ASC"),
    query("SELECT id, name, email, email_verified, active, last_ip, created_at, updated_at FROM customers ORDER BY id ASC"),
    query("SELECT * FROM wallet_ledger ORDER BY id ASC"),
    query("SELECT id, order_number, customer_id, buyer_name, buyer_email, method, amount, product_id, product_name, selected_option, price, status, proof_mime, proof_filename, proof_size, proof_note, admin_note, approved_by, approved_at, created_at, updated_at FROM topup_requests ORDER BY id ASC"),
    query("SELECT * FROM customer_orders ORDER BY id ASC"),
    query("SELECT * FROM settings ORDER BY setting_key ASC"),
    query("SELECT id, recipient_email, subject, status, error_text, sent_at, created_at FROM email_outbox ORDER BY id ASC")
  ]);
  res.setHeader("Content-Disposition", `attachment; filename="garcita-store-backup-${Date.now()}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    brand: BRAND_NAME,
    products,
    sales,
    customers,
    walletLedger: ledger,
    topups,
    orders,
    settings,
    emailOutbox
  });
}));

app.get("/api/admin/reports", auth, adminOnly, asyncHandler(async (_req, res) => {
  if (!isDatabaseReady()) return res.json(offlineReportJson());
  const [eventTotals, salesTotals, productTotals, dailyVisits, walletTotals] = await Promise.all([
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
    ),
    query(
      `SELECT
        COUNT(DISTINCT customer_id) AS customers_with_balance,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS balance_added,
        COALESCE(SUM(CASE WHEN type = 'purchase' THEN -amount ELSE 0 END), 0) AS balance_spent
       FROM wallet_ledger`
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
    customersWithBalance: Number(walletTotals[0].customers_with_balance || 0),
    balanceAdded: Number(walletTotals[0].balance_added || 0),
    balanceSpent: Number(walletTotals[0].balance_spent || 0),
    dailyVisits: dailyVisits.map((item) => ({ day: item.day, total: Number(item.total) }))
  });
}));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: BRAND_NAME,
    email: safeEmailConfigStatus(),
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
      : statusCode < 500
        ? (error.message || "No se pudo completar la solicitud.")
      : "Ocurrio un error en el servidor.",
    database: error instanceof DatabaseUnavailableError ? serializeDbState() : undefined,
    retryAfter: error.retryAfter,
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
      verifyEmailTransporterInBackground().catch((error) => {
        console.error("[email] Error inesperado verificando SMTP:");
        console.error(error.stack || error);
      });
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
