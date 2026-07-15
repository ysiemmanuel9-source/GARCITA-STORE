function firstNonEmpty(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function parseMysqlUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (!["mysql:", "mysql2:"].includes(parsed.protocol)) return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username || ""),
      password: decodeURIComponent(parsed.password || ""),
      database: database || undefined
    };
  } catch (error) {
    throw new Error(`MYSQL_URL no es una URL MySQL valida: ${error.message}`);
  }
}

function requireValue(value, label, hint) {
  if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  throw new Error(`Falta la variable de MySQL "${label}". ${hint}`);
}

function getDatabaseName(urlConfig) {
  const database = firstNonEmpty(
    process.env.MYSQLDATABASE,
    process.env.MYSQL_DATABASE,
    process.env.DB_NAME,
    urlConfig?.database,
    "garcita_store_web"
  );
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Nombre de base de datos invalido "${database}". Solo usa letras, numeros y guion bajo.`);
  }
  return database;
}

function getDbConfig({ includeDatabase = true, multipleStatements = false } = {}) {
  const urlConfig = parseMysqlUrl(firstNonEmpty(
    process.env.MYSQL_URL,
    process.env.DB_URL,
    process.env.DATABASE_URL
  ));
  const database = getDatabaseName(urlConfig);
  const host = requireValue(
    firstNonEmpty(process.env.MYSQLHOST, process.env.MYSQL_HOST, process.env.DB_HOST, urlConfig?.host),
    "MYSQLHOST",
    "En Railway, conecta el servicio MySQL al servicio web o agrega MYSQL_URL."
  );
  const user = requireValue(
    firstNonEmpty(process.env.MYSQLUSER, process.env.MYSQL_USER, process.env.DB_USER, urlConfig?.user),
    "MYSQLUSER",
    "En Railway, conecta el servicio MySQL al servicio web o agrega MYSQL_URL."
  );
  const password = requireValue(
    firstDefined(process.env.MYSQLPASSWORD, process.env.MYSQL_PASSWORD, process.env.DB_PASSWORD, urlConfig?.password),
    "MYSQLPASSWORD",
    "En Railway, conecta el servicio MySQL al servicio web o agrega MYSQL_URL."
  );
  const port = Number(firstNonEmpty(process.env.MYSQLPORT, process.env.MYSQL_TCP_PORT, process.env.DB_PORT, urlConfig?.port, 3306));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Puerto MySQL invalido "${port}". Revisa MYSQLPORT.`);
  }

  const config = {
    host,
    port,
    user,
    password,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    namedPlaceholders: true,
    multipleStatements
  };
  if (includeDatabase) config.database = database;
  return { config, database };
}

module.exports = { getDbConfig };
