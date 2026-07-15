require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { getDbConfig } = require("./db-config");

async function main() {
  const { config, database } = getDbConfig({ includeDatabase: false, multipleStatements: true });
  const connection = await mysql.createConnection(config);

  const sql = fs.readFileSync(path.join(__dirname, "..", "database", "schema.sql"), "utf8");
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  } catch (error) {
    console.warn(`No se pudo crear la base "${database}". Intentando usarla directamente: ${error.message}`);
  }
  await connection.query(`USE \`${database}\`;`);
  await connection.query(sql);
  await connection.end();
  console.log(`Base de datos "${database}" creada/actualizada correctamente.`);
}

main().catch((error) => {
  console.error("Error creando la base de datos:", error.message);
  process.exit(1);
});
