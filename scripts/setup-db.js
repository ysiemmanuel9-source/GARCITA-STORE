require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const {
  getDbConfigCandidates,
  getDbSearchOrder,
  logMysqlError,
  printEnvDiagnostics,
  serializeMysqlError,
  summarizeDbCandidate
} = require("./db-config");

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
