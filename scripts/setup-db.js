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
  async function columnExists(tableName, columnName) {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [tableName, columnName]
    );
    return rows.length > 0;
  }

  async function addColumnIfMissing(tableName, columnName, definition) {
    if (await columnExists(tableName, columnName)) return;
    await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }

  async function indexExists(tableName, indexName) {
    const [rows] = await connection.query(
      `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
       LIMIT 1`,
      [tableName, indexName]
    );
    return rows.length > 0;
  }

  async function addIndexIfMissing(tableName, indexName, definition) {
    if (await indexExists(tableName, indexName)) return;
    await connection.query(`ALTER TABLE ${tableName} ADD ${definition}`);
  }

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
