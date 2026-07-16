const MYSQL_ENV_KEYS = [
  "MYSQL_URL",
  "MYSQLHOST",
  "MYSQLPORT",
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE",
  "MYSQL_CONNECTION_LIMIT",
  "PORT",
  "NODE_ENV",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_SERVICE_NAME",
  "RAILWAY_PROJECT_NAME",
  "RAILWAY_PUBLIC_DOMAIN",
  "RAILWAY_PRIVATE_DOMAIN"
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
    .filter((key) => /^MYSQL/i.test(key))
    .sort();
  return diagnostics;
}

function printEnvDiagnostics(label = "mysql-env") {
  console.log(`[${label}] Variables detectadas para MySQL/Railway (valores sensibles ocultos):`);
  console.log(JSON.stringify(getSafeEnvDiagnostics(), null, 2));
}

function parseMysqlUrl(value, label = "MYSQL_URL") {
  if (!hasValue(value)) return null;
  try {
    const parsed = new URL(value);
    if (!["mysql:", "mysql2:"].includes(parsed.protocol)) {
      throw new Error(`protocolo no soportado "${parsed.protocol}"`);
    }
    return {
      source: label,
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) || undefined
    };
  } catch (error) {
    throw new Error(`${label} no es una URL MySQL valida: ${error.message}`);
  }
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

function hasMysqlConfig(env = process.env) {
  if (hasValue(env.MYSQL_URL)) return true;
  return hasValue(env.MYSQLHOST) && hasValue(env.MYSQLUSER) && hasValue(env.MYSQLDATABASE);
}

function buildMissingEnvError(env) {
  const missing = ["MYSQLHOST", "MYSQLUSER", "MYSQLDATABASE"]
    .filter((key) => !hasValue(env[key]));
  const details = JSON.stringify(getSafeEnvDiagnostics(env), null, 2);
  return new Error(
    [
      `No se encontro MYSQL_URL y faltan variables MySQL requeridas: ${missing.join(", ") || "ninguna"}.`,
      "El servidor HTTP seguira iniciado para que Railway pueda responder /health.",
      "Cuando enlaces MySQL al servicio web, el inicializador de fondo volvera a intentar la conexion.",
      "Diagnostico seguro de process.env:",
      details
    ].join("\n")
  );
}

function getDbConfig({ includeDatabase = true, multipleStatements = false } = {}) {
  const env = process.env;
  const options = { includeDatabase, multipleStatements };
  const urlConfig = parseMysqlUrl(env.MYSQL_URL, "MYSQL_URL");

  if (urlConfig) {
    return buildConfig({
      source: urlConfig.source,
      host: urlConfig.host,
      port: urlConfig.port,
      user: urlConfig.user,
      password: urlConfig.password,
      database: firstNonEmpty(urlConfig.database, env.MYSQLDATABASE)
    }, options, env);
  }

  if (!hasMysqlConfig(env)) {
    throw buildMissingEnvError(env);
  }

  return buildConfig({
    source: "MYSQLHOST/MYSQLUSER/MYSQLDATABASE",
    host: env.MYSQLHOST,
    port: firstNonEmpty(env.MYSQLPORT, 3306),
    user: env.MYSQLUSER,
    password: firstDefined(env.MYSQLPASSWORD, ""),
    database: env.MYSQLDATABASE
  }, options, env);
}

module.exports = {
  getDbConfig,
  getSafeEnvDiagnostics,
  hasMysqlConfig,
  printEnvDiagnostics
};
