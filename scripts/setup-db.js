require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { getDbConfig, printEnvDiagnostics } = require("./db-config");

async function main() {
  printEnvDiagnostics("setup-db");
  let connection;

  try {
    const { config, database } = getDbConfig({ includeDatabase: false, multipleStatements: true });
    connection = await mysql.createConnection(config);
    const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    } catch (error) {
      console.warn(`No se pudo crear la base "${database}". Intentando usarla directamente.`);
      console.warn(error.stack || error);
    }
    await connection.query(`USE \`${database}\`;`);
    await connection.query(sql);
    console.log(`Base de datos "${database}" creada/actualizada correctamente.`);
    return true;
  } catch (error) {
    console.error("No se pudo crear/actualizar MySQL. El servidor web puede iniciar sin base de datos:");
    console.error(error.stack || error);
    return false;
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

if (require.main === module) {
  main().catch((error) => {
    console.error("Error inesperado en setup-db:");
    console.error(error.stack || error);
  });
}

module.exports = { main };
