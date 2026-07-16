const Module = require("module");

const originalLoad = Module._load;
let insertId = 1;

function rowsFor(sql) {
  const normalized = String(sql || "").trim().toLowerCase();
  if (normalized.includes("information_schema.columns")) return [];
  if (normalized.startsWith("select id from users")) return [];
  if (normalized.startsWith("select id, name from products")) return [];
  if (normalized.startsWith("select 1")) return [{ ok: 1 }];
  if (normalized.startsWith("insert")) return { insertId: insertId += 1, affectedRows: 1 };
  if (normalized.startsWith("update") || normalized.startsWith("alter") || normalized.startsWith("create")) {
    return { affectedRows: 1 };
  }
  return [];
}

const fakeMysql = {
  createPool() {
    return {
      execute: async (sql) => [rowsFor(sql), []],
      query: async (sql) => [rowsFor(sql), []],
      end: async () => {}
    };
  },
  createConnection: async () => ({
    query: async (sql) => [rowsFor(sql), []],
    end: async () => {}
  })
};

Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "mysql2/promise") return fakeMysql;
  return originalLoad.call(this, request, parent, isMain);
};

async function main() {
  delete process.env.MYSQLHOST;
  delete process.env.MYSQLPORT;
  delete process.env.MYSQLUSER;
  delete process.env.MYSQLPASSWORD;
  delete process.env.MYSQLDATABASE;

  process.env.MYSQL_URL = "mysql://root:super-secret@mysql.railway.internal:3306/railway";
  process.env.PORT = "0";
  process.env.HOST = "0.0.0.0";
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "simulated-railway-secret";

  const { main: setupDatabase } = require("./setup-db");
  await setupDatabase();

  const { start } = require("../server");
  const server = await start();
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  console.log("Simulacion Railway OK: setup-db y server iniciaron usando MYSQL_URL sin MYSQLHOST.");
}

main().catch((error) => {
  console.error("Simulacion Railway fallida:");
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
