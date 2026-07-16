require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const {
  getDbConfigCandidates,
  getDbSearchOrder,
  logMysqlError,
  printEnvDiagnostics,
  serializeMysqlError,
  summarizeDbCandidate
} = require("./db-config");

const BRAND_NAME = "GARCITA STORE";
const ADMIN_DEFAULT_USERNAME = "Garcita9";
const ADMIN_DEFAULT_PASSWORD_HASH = "$2a$10$pAySt1sPQcUqivIlqMZvKe3vq.HeNMWBYG2OZUsBMd45QmNUsZh5W";

function configuredAdminUsername() {
  const username = String(process.env.ADMIN_USERNAME || "").trim();
  return username || ADMIN_DEFAULT_USERNAME;
}

async function configuredAdminPasswordHash() {
  if (process.env.ADMIN_PASSWORD) return bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  return process.env.ADMIN_PASSWORD_HASH || ADMIN_DEFAULT_PASSWORD_HASH;
}

async function adminSeeds() {
  const configuredUsername = configuredAdminUsername();
  const seeds = [{
    username: configuredUsername,
    passwordHash: await configuredAdminPasswordHash(),
    name: `Administrador ${BRAND_NAME}`
  }];

  if (configuredUsername !== ADMIN_DEFAULT_USERNAME) {
    seeds.push({
      username: ADMIN_DEFAULT_USERNAME,
      passwordHash: ADMIN_DEFAULT_PASSWORD_HASH,
      name: `Administrador ${BRAND_NAME}`
    });
  }

  return seeds;
}

async function upsertAdminUser(connection, { username, passwordHash, name }) {
  const [rows] = await connection.execute("SELECT id FROM users WHERE username = :username LIMIT 1", { username });
  if (rows.length) {
    await connection.execute(
      "UPDATE users SET role = 'admin', password_hash = :passwordHash, name = :name, active = 1, updated_at = NOW() WHERE id = :id",
      { username, passwordHash, name, id: rows[0].id }
    );
    return;
  }

  await connection.execute(
    "INSERT INTO users (role, username, password_hash, name, active) VALUES ('admin', :username, :passwordHash, :name, 1)",
    { username, passwordHash, name }
  );
}

async function syncAdminUsers(connection) {
  for (const admin of await adminSeeds()) {
    await upsertAdminUser(connection, admin);
  }
}

async function migrateExistingSchema(connection) {
  const [productColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'purchase_options'`
  );
  if (!productColumns.length) {
    await connection.query("ALTER TABLE products ADD COLUMN purchase_options LONGTEXT NULL AFTER badge");
  }

  const [saleColumns] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'selected_option'`
  );
  if (!saleColumns.length) {
    await connection.query("ALTER TABLE sales ADD COLUMN selected_option VARCHAR(220) NULL AFTER price");
  }

  await connection.query("ALTER TABLE sales MODIFY status ENUM('pendiente', 'pagado', 'cancelado', 'entregado') NOT NULL DEFAULT 'pendiente'");
  await connection.query("ALTER TABLE analytics_events MODIFY event_type ENUM('page_view', 'discord_click', 'whatsapp_click', 'buy_click') NOT NULL");
  await connection.query("UPDATE analytics_events SET event_type = 'whatsapp_click' WHERE event_type = 'discord_click'");
  await connection.query("ALTER TABLE analytics_events MODIFY event_type ENUM('page_view', 'whatsapp_click', 'buy_click') NOT NULL");
}

async function main() {
  printEnvDiagnostics("setup-db");
  const errors = [];

  try {
    const candidates = getDbConfigCandidates({ includeDatabase: false, multipleStatements: true });
    const candidateSummaries = candidates.map(summarizeDbCandidate);
    console.log("[setup-db] Orden de busqueda MySQL:");
    console.log(JSON.stringify(getDbSearchOrder(), null, 2));
    console.log("[setup-db] Candidatos MySQL detectados (sin contrasenas):");
    console.log(JSON.stringify(candidateSummaries, null, 2));

    for (const { config, database, source } of candidates) {
      let connection;
      const candidateSummary = summarizeDbCandidate({ config, database, source });
      try {
        console.log(`[setup-db] Intentando conectar MySQL usando: ${source}`);
        console.log("[setup-db] Configuracion seleccionada (sin contrasena):");
        console.log(JSON.stringify(candidateSummary, null, 2));
        connection = await mysql.createConnection(config);
        const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
        try {
          await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
        } catch (error) {
          logMysqlError(`[setup-db] Error ORIGINAL creando la base "${database}". Intentando usarla directamente.`, error, {
            database,
            source
          });
        }
        await connection.query(`USE \`${database}\`;`);
        await connection.query(sql);
        await migrateExistingSchema(connection);
        await syncAdminUsers(connection);
        console.log(`Base de datos "${database}" creada/actualizada correctamente usando ${source}.`);
        return true;
      } catch (error) {
        const errorDetails = serializeMysqlError(error);
        errors.push({ source, candidate: candidateSummary, error: errorDetails });
        logMysqlError(`[setup-db] Error ORIGINAL de mysql2 usando ${source}. Probando siguiente configuracion si existe.`, error, {
          source,
          candidate: candidateSummary
        });
      } finally {
        if (connection) {
          try {
            await connection.end();
          } catch (error) {
            console.warn("No se pudo cerrar la conexion MySQL de setup-db:");
            console.warn(error.stack || error);
          }
        }
      }
    }
    const finalError = new Error("Ninguna configuracion MySQL funciono. Revisa los errores originales registrados arriba.");
    finalError.connectionErrors = errors;
    throw finalError;
  } catch (error) {
    logMysqlError("[setup-db] No se pudo crear/actualizar MySQL. Error final:", error, {
      connectionErrors: errors
    });
    return false;
  }
}

if (require.main === module) {
  main().catch((error) => {
    logMysqlError("[setup-db] Error inesperado en setup-db:", error);
  });
}

module.exports = { main };
