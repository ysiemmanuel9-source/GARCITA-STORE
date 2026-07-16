const http = require("http");

const MYSQL_KEYS = [
  "MYSQL_URL",
  "MYSQLHOST",
  "MYSQLPORT",
  "MYSQLUSER",
  "MYSQLPASSWORD",
  "MYSQLDATABASE"
];

function clearMysqlEnv() {
  for (const key of MYSQL_KEYS) delete process.env[key];
}

function readHealth(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: "127.0.0.1",
      port,
      path: "/health",
      timeout: 5000
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode, body }));
    });
    request.on("timeout", () => request.destroy(new Error("Timeout consultando /health")));
    request.on("error", reject);
  });
}

async function main() {
  clearMysqlEnv();
  process.env.PORT = "0";
  process.env.HOST = "0.0.0.0";
  process.env.NODE_ENV = "production";
  process.env.JWT_SECRET = "simulated-railway-secret";

  const { start } = require("../server");
  const server = await start();
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const health = await readHealth(port);
    if (health.statusCode !== 200) {
      throw new Error(`/health respondio ${health.statusCode}: ${health.body}`);
    }
    const payload = JSON.parse(health.body);
    if (!payload.ok || payload.database.status !== "waiting_for_config") {
      throw new Error(`/health no reporto estado esperado: ${health.body}`);
    }
    console.log("Simulacion Railway OK: el servidor inicio sin variables MySQL y /health respondio 200.");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

main().catch((error) => {
  console.error("Simulacion Railway fallida:");
  console.error(error.stack || error);
  process.exitCode = 1;
});
