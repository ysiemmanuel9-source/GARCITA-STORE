const MYSQL_ENV_KEYS = [
  "MYSQL_URL",
  "MYSQL_PRIVATE_URL",
  "MYSQL_PUBLIC_URL",
  "DATABASE_URL",
  "MYSQLHOST",
  "MYSQL_HOST",
  "MYSQL_HOSTNAME",
  "MYSQLPORT",
  "MYSQL_PORT",
  "MYSQL_TCP_PORT",
  "MYSQLUSER",
  "MYSQL_USER",
  "MYSQL_USERNAME",
  "MYSQLPASSWORD",
  "MYSQL_PASSWORD",
  "MYSQL_ROOT_PASSWORD",
  "MYSQLDATABASE",
  "MYSQL_DATABASE",
  "MYSQL_DB",
  "MYSQL_CONNECTION_LIMIT",
  "DB_HOST",
  "DB_PORT",
  "DB_USER",
  "DB_PASSWORD",
  "DB_NAME",
  "DB_DATABASE",
  "DB_URL",
  "PORT",
  "NODE_ENV",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_SERVICE_NAME",
  "RAILWAY_PROJECT_NAME",
  "RAILWAY_PUBLIC_DOMAIN",
  "RAILWAY_PRIVATE_DOMAIN"
];

const MYSQL_URL_KEYS = ["MYSQL_URL", "MYSQL_PRIVATE_URL", "MYSQL_PUBLIC_URL", "DATABASE_URL", "DB_URL"];
const MYSQL_SEARCH_ORDER = [
  ...MYSQL_URL_KEYS,
  "MYSQLHOST/MYSQLUSER/MYSQLDATABASE",
  "DB_HOST/DB_USER/DB_NAME"
];
const SECRET_KEY_PATTERN = /PASSWORD|SECRET|TOKEN|KEY/i;
const URL_KEY_PATTERN = /URL$/i;

function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function maskSecret(value) {
  if (value === undefined) return "<missing>";
  if (value === null || String(value) === "") return "<empty>";
  return `<set length=${String(value).length}>`;
}

function maskMysqlUrl(value) {
  if (!hasValue(value)) return value === undefined ? "<missing>" : "<empty>";
  try {
    const parsed = new URL(value);
    const user = parsed.username ? decodeURIComponent(parsed.username) : "";
    const database = parsed.pathname ? parsed.pathname.replace(/^\//, "") : "";
    const port = parsed.port ? `:${parsed.port}` : "";
    const auth = user ? `${user}:<hidden>@` : "";
    const db = database ? `/${database}` : "";
    return `${parsed.protocol}//${auth}${parsed.hostname}${port}${db}`;
  } catch {
    return "<set but invalid url>";
  }
}

function safeValueForKey(key, value) {
  if (SECRET_KEY_PATTERN.test(key)) return maskSecret(value);
  if (URL_KEY_PATTERN.test(key)) return maskMysqlUrl(value);
  if (value === undefined) return "<missing>";
  if (value === null || String(value) === "") return "<empty>";
  return String(value);
}

function getSafeEnvDiagnostics(env = process.env) {
  const diagnostics = {};
  for (const key of MYSQL_ENV_KEYS) {
    diagnostics[key] = {
      present: Object.prototype.hasOwnProperty.call(env, key),
      value: safeValueForKey(key, env[key])
    };
  }
  diagnostics.detectedMysqlKeys = Object.keys(env)
    .filter((key) => /^MYSQL/i.test(key) || /^DB_/i.test(key) || key === "DATABASE_URL")
    .sort();
  return diagnostics;
}

function printEnvDiagnostics(label = "mysql-env") {
  console.log(`[${label}] Variables detectadas para MySQL/Railway (valores sensibles ocultos):`);
  console.log(JSON.stringify(getSafeEnvDiagnostics(), null, 2));
}

function getDbSearchOrder() {
  return [...MYSQL_SEARCH_ORDER];
}

function parseMysqlUrl(value, label = "MYSQL_URL") {
  if (!hasValue(value)) return null;
  if (String(value).includes("${{")) {
    throw new Error(`${label} contiene una referencia Railway sin resolver. Revisa las variables del servicio web y redeploya.`);
  }
  const parsed = new URL(value);
  if (!["mysql:", "mysql2:"].includes(parsed.protocol)) {
    throw new Error(`${label} usa protocolo no soportado "${parsed.protocol}".`);
  }
  return {
    source: label,
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || undefined
  };
}

function getDatabaseName(value) {
  const database = firstNonEmpty(value, "garcita_store_web");
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Nombre de base de datos invalido "${database}". Solo usa letras, numeros y guion bajo.`);
  }
  return database;
}

function getConnectionLimit(env) {
  const limit = Number(firstNonEmpty(env.MYSQL_CONNECTION_LIMIT, 10));
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`MYSQL_CONNECTION_LIMIT invalido "${env.MYSQL_CONNECTION_LIMIT}".`);
  }
  return limit;
}

function mysqlFieldConfigFromEnv(env) {
  return {
    source: "MYSQLHOST/MYSQLUSER/MYSQLDATABASE",
    host: firstNonEmpty(env.MYSQLHOST, env.MYSQL_HOST, env.MYSQL_HOSTNAME),
    port: firstNonEmpty(env.MYSQLPORT, env.MYSQL_PORT, env.MYSQL_TCP_PORT, 3306),
    user: firstNonEmpty(env.MYSQLUSER, env.MYSQL_USER, env.MYSQL_USERNAME),
    password: firstDefined(env.MYSQLPASSWORD, env.MYSQL_PASSWORD, env.MYSQL_ROOT_PASSWORD, ""),
    database: firstNonEmpty(env.MYSQLDATABASE, env.MYSQL_DATABASE, env.MYSQL_DB)
  };
}

function legacyFieldConfigFromEnv(env) {
  return {
    source: "DB_HOST/DB_USER/DB_NAME",
    host: firstNonEmpty(env.DB_HOST),
    port: firstNonEmpty(env.DB_PORT, 3306),
    user: firstNonEmpty(env.DB_USER),
    password: firstDefined(env.DB_PASSWORD, ""),
    database: firstNonEmpty(env.DB_NAME, env.DB_DATABASE)
  };
}

function isCompleteFieldConfig(fields) {
  return hasValue(fields.host) && hasValue(fields.user) && hasValue(fields.database);
}

function assertConfigPart(value, label, source) {
  if (hasValue(value) || label === "password") return value;
  throw new Error(`Falta ${label} en la configuracion MySQL obtenida desde ${source}.`);
}

function buildConfig({ host, port, user, password, database, source }, options, env) {
  const parsedPort = Number(firstNonEmpty(port, 3306));
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Puerto MySQL invalido "${port}". Revisa MYSQLPORT o MYSQL_URL.`);
  }

  const config = {
    host: assertConfigPart(host, "host", source),
    port: parsedPort,
    user: assertConfigPart(user, "user", source),
    password: firstDefined(password, ""),
    waitForConnections: true,
    connectionLimit: getConnectionLimit(env),
    namedPlaceholders: true,
    multipleStatements: Boolean(options.multipleStatements)
  };

  const databaseName = getDatabaseName(database);
  if (options.includeDatabase) config.database = databaseName;
  return { config, database: databaseName, source };
}

function summarizeDbCandidate(candidate) {
  return {
    source: candidate.source,
    host: candidate.config?.host || null,
    port: candidate.config?.port || null,
    user: candidate.config?.user || null,
    database: candidate.database || candidate.config?.database || null,
    includeDatabaseInPool: Boolean(candidate.config?.database),
    hasPassword: hasValue(candidate.config?.password)
  };
}

function serializeMysqlError(error) {
  return {
    name: error?.name || null,
    code: error?.code || null,
    errno: error?.errno ?? null,
    sqlState: error?.sqlState || null,
    sqlMessage: error?.sqlMessage || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
    fatal: error?.fatal ?? null,
    syscall: error?.syscall || null,
    address: error?.address || null,
    port: error?.port ?? null,
    hostname: error?.hostname || null
  };
}

function logMysqlError(label, error, details = {}) {
  console.error(label);
  console.error(JSON.stringify({
    ...details,
    error: serializeMysqlError(error)
  }, null, 2));
}

function getDbConfigCandidates({ includeDatabase = true, multipleStatements = false } = {}, env = process.env) {
  const options = { includeDatabase, multipleStatements };
  const candidates = [];
  const parseErrors = [];
  const databaseFallback = firstNonEmpty(env.MYSQLDATABASE, env.MYSQL_DATABASE, env.MYSQL_DB, env.DB_NAME, env.DB_DATABASE);

  for (const key of MYSQL_URL_KEYS) {
    try {
      const urlConfig = parseMysqlUrl(env[key], key);
      if (!urlConfig) continue;
      candidates.push(buildConfig({
        ...urlConfig,
        database: firstNonEmpty(urlConfig.database, databaseFallback)
      }, options, env));
    } catch (error) {
      parseErrors.push(`${key}: ${error.message}`);
    }
  }

  const mysqlFields = mysqlFieldConfigFromEnv(env);
  if (isCompleteFieldConfig(mysqlFields)) candidates.push(buildConfig(mysqlFields, options, env));

  const legacyFields = legacyFieldConfigFromEnv(env);
  if (isCompleteFieldConfig(legacyFields)) candidates.push(buildConfig(legacyFields, options, env));

  if (candidates.length) return candidates;
  throw buildMissingEnvError(env, parseErrors);
}

function hasMysqlConfig(env = process.env) {
  if (MYSQL_URL_KEYS.some((key) => hasValue(env[key]))) return true;
  return isCompleteFieldConfig(mysqlFieldConfigFromEnv(env)) || isCompleteFieldConfig(legacyFieldConfigFromEnv(env));
}

function buildMissingEnvError(env, parseErrors = []) {
  const mysqlFields = mysqlFieldConfigFromEnv(env);
  const missing = [
    ["MYSQLHOST", mysqlFields.host],
    ["MYSQLUSER", mysqlFields.user],
    ["MYSQLDATABASE", mysqlFields.database]
  ].filter(([, value]) => !hasValue(value)).map(([key]) => key);
  const details = JSON.stringify(getSafeEnvDiagnostics(env), null, 2);
  return new Error(
    [
      `No se encontro una configuracion MySQL util. Faltan variables MySQL requeridas: ${missing.join(", ") || "ninguna"}.`,
      "El servidor probo URLs y variables separadas; DB_* solo se usa como respaldo si esta completo.",
      "Variables URL aceptadas: MYSQL_URL, MYSQL_PRIVATE_URL, MYSQL_PUBLIC_URL, DATABASE_URL o DB_URL.",
      "Variables separadas aceptadas: MYSQLHOST/MYSQL_HOST, MYSQLPORT/MYSQL_PORT, MYSQLUSER/MYSQL_USER, MYSQLPASSWORD/MYSQL_PASSWORD, MYSQLDATABASE/MYSQL_DATABASE.",
      "Variables respaldo aceptadas: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.",
      parseErrors.length ? `Errores leyendo URL: ${parseErrors.join(" | ")}` : "",
      "Diagnostico seguro de process.env:",
      details
    ].filter(Boolean).join("\n")
  );
}

function getDbConfig(options = {}) {
  return getDbConfigCandidates(options)[0];
}

module.exports = {
  getDbConfig,
  getDbConfigCandidates,
  getDbSearchOrder,
  getSafeEnvDiagnostics,
  hasMysqlConfig,
  logMysqlError,
  serializeMysqlError,
  summarizeDbCandidate,
  printEnvDiagnostics
};
