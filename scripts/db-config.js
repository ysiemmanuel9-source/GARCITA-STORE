function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function parseMysqlUrl(connectionUrl) {
  if (!connectionUrl) return null;
  const parsed = new URL(connectionUrl);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username || ""),
    password: decodeURIComponent(parsed.password || ""),
    database: database || undefined
  };
}

function getDatabaseName(urlConfig) {
  const databaseName = pick(
    process.env.DB_NAME,
    process.env.MYSQLDATABASE,
    process.env.MYSQL_DATABASE,
    urlConfig?.database,
    "garcita_store_web"
  );
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("El nombre de la base de datos solo puede tener letras, numeros y guion bajo.");
  }
  return databaseName;
}

function getDbConfig({ includeDatabase = true, multipleStatements = false } = {}) {
  const urlConfig = parseMysqlUrl(pick(
    process.env.MYSQL_URL,
    process.env.DATABASE_URL,
    process.env.DB_URL
  ));
  const database = getDatabaseName(urlConfig);
  const config = {
    host: pick(process.env.DB_HOST, process.env.MYSQLHOST, process.env.MYSQL_HOST, urlConfig?.host, "localhost"),
    port: Number(pick(process.env.DB_PORT, process.env.MYSQLPORT, process.env.MYSQL_TCP_PORT, urlConfig?.port, 3306)),
    user: pick(process.env.DB_USER, process.env.MYSQLUSER, process.env.MYSQL_USER, urlConfig?.user, "root"),
    password: pick(process.env.DB_PASSWORD, process.env.MYSQLPASSWORD, process.env.MYSQL_PASSWORD, urlConfig?.password, ""),
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    namedPlaceholders: true,
    multipleStatements
  };
  if (includeDatabase) config.database = database;
  return { config, database };
}

module.exports = { getDbConfig };
