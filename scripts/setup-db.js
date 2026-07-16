require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { getDbConfig, printEnvDiagnostics } = require("./db-config");

async function main() {
  printEnvDiagnostics("setup-db");
  const { config, database } = getDbConfig({ includeDatabase: false, multipleStatements: true });
  const connection = await mysql.createConnection(config);

  try {
    const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
    try {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    } catch (error) {
      console.warn(`No se pudo crear la base "${database}". Intentando usarla directamente.`);
      console.warn(error.stack || error);
    }
    await connection.query(`USE \`${database}\`;`);
    await connection.query(sql);
  } catch (error) {
    console.error("Error aplicando schema MySQL:");
    console.error(error.stack || error);
    throw error;
  } finally {
    await connection.end();
  }

  console.log(`Base de datos "${database}" creada/actualizada correctamente.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error creando/actualizando la base de datos:");
    console.error(error.stack || error);
    process.exit(1);
  });
}

module.exports = { main };
