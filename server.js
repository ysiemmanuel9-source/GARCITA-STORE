require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";
const DB_SSL = process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined;

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "gaming_store",
  ssl: DB_SSL,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});

app.use(cors({ origin: process.env.APP_URL || true, credentials: true }));
app.use(express.json({ limit: "12mb" }));

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, username: user.username, name: user.name },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    email: user.email,
    name: user.name,
    contact: user.contact,
    active: Boolean(user.active)
  };
}

function auth(required = true) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      if (!required) return next();
      return res.status(401).json({ error: "No has iniciado sesion." });
    }

    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: "Sesion invalida o vencida." });
    }
  };
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permiso para esta accion." });
    }
    next();
  };
}

async function query(sql, params = {}) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getSettings() {
  const rows = await query("SELECT setting_key, setting_value FROM settings");
  const settings = {};
  rows.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });
  return {
    storeName: settings.storeName || "GAMING STORE",
    whatsappNumber: settings.whatsappNumber || "",
    supportLink: settings.supportLink || "https://discord.gg/bGCWtKXT",
    paymentMethods: (settings.paymentMethods || "PayPal,Yape,BBVA,Remitly,Western Union")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  };
}

async function upsertSetting(key, value) {
  await query(
    "INSERT INTO settings (setting_key, setting_value) VALUES (:key, :value) ON DUPLICATE KEY UPDATE setting_value = :value",
    { key, value }
  );
}

async function seedDefaultStaff() {
  const staff = [
    {
      role: "admin",
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "cambiaAdmin123",
      name: "Administrador"
    },
    {
      role: "helper",
      username: process.env.HELPER_USERNAME || "ayudante",
      password: process.env.HELPER_PASSWORD || "cambiaAyudante123",
      name: "Ayudante"
    }
  ];

  for (const item of staff) {
    const existing = await query("SELECT id FROM users WHERE username = :username LIMIT 1", { username: item.username });
    if (existing.length) continue;
    const passwordHash = await bcrypt.hash(item.password, 10);
    await query(
      "INSERT INTO users (role, username, password_hash, name, active) VALUES (:role, :username, :passwordHash, :name, 1)",
      { role: item.role, username: item.username, passwordHash, name: item.name }
    );
  }
}

async function seedProducts() {
  const countRows = await query("SELECT COUNT(*) AS total FROM products");
  if (Number(countRows[0].total) > 0) return;

  const products = [
    ["Acceso Digital APK", "Producto digital", "Producto digital con tiempo configurable y pedido directo por WhatsApp.", [
      ["Semana", 5.50], ["Mes", 10.35], ["Ano", 75.93]
    ]],
    ["Panel UID Emulador", "Panel gaming", "Plan editable para clientes de emulador.", [
      ["Semana", 4.75], ["Mes", 9.89]
    ]],
    ["Panel UID Pantalla", "Panel gaming", "Servicio digital con tiempos configurables.", [
      ["Semana", 5.66], ["Mes", 10.12]
    ]],
    ["Panel Basico", "Membresia", "Entrada economica para clientes nuevos.", [
      ["Semana", 3.60], ["Mes", 8.89]
    ]],
    ["Panel Supreme", "Membresia", "Plan premium para usuarios que quieren mas tiempo y soporte.", [
      ["Semana", 5.50], ["Mes", 10.35], ["Ano", 65.45]
    ]],
    ["Panel Flourite", "Membresia", "Plan destacado con opcion por dia, semana y mes.", [
      ["1 dia", 9.66], ["Semana", 19.66], ["Mes", 29.66]
    ]],
    ["Panel Bloodstrike", "Membresia", "Producto editable con 7, 14 y 30 dias.", [
      ["Semana", 9.80], ["14 dias", 14.80], ["Mes", 20.80]
    ]],
    ["Revendedor Socio", "Socio", "Plan de socio o revendedor para clientes que compran volumen.", [
      ["Mes", 50.00]
    ]]
  ];

  for (const product of products) {
    const result = await query(
      "INSERT INTO products (name, category, description, image, active) VALUES (:name, :category, :description, :image, 1)",
      {
        name: product[0],
        category: product[1],
        description: product[2],
        image: "assets/producto-gaming-premium.png"
      }
    );
    const productId = result.insertId;
    for (let index = 0; index < product[3].length; index += 1) {
      const [label, price] = product[3][index];
      await query(
        "INSERT INTO product_durations (product_id, label, price, sort_order) VALUES (:productId, :label, :price, :sortOrder)",
        { productId, label, price, sortOrder: index }
      );
    }
  }
}

app.post("/api/auth/staff-login", async (req, res) => {
  const { username, password } = req.body;
  const rows = await query(
    "SELECT * FROM users WHERE username = :username AND role IN ('admin', 'helper') AND active = 1 LIMIT 1",
    { username }
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    return res.status(401).json({ error: "Usuario o clave incorrecta." });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/client-login", async (req, res) => {
  const { username, password } = req.body;
  const rows = await query(
    "SELECT * FROM users WHERE username = :username AND role = 'client' AND active = 1 LIMIT 1",
    { username }
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password || "", user.password_hash))) {
    return res.status(401).json({ error: "Usuario o clave incorrecta." });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/client-register", async (req, res) => {
  const { username, password, name, email, contact } = req.body;
  if (!username || !password || !name) {
    return res.status(400).json({ error: "Nombre, usuario y clave son obligatorios." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "La clave debe tener minimo 6 caracteres." });
  }

  const exists = await query("SELECT id FROM users WHERE username = :username LIMIT 1", { username });
  if (exists.length) return res.status(409).json({ error: "Ese usuario ya existe." });

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query(
    "INSERT INTO users (role, username, email, password_hash, name, contact, active) VALUES ('client', :username, :email, :passwordHash, :name, :contact, 1)",
    { username, email: email || null, passwordHash, name, contact: contact || null }
  );
  const rows = await query("SELECT * FROM users WHERE id = :id", { id: result.insertId });
  const user = rows[0];
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", auth(), async (req, res) => {
  const rows = await query("SELECT * FROM users WHERE id = :id LIMIT 1", { id: req.user.id });
  if (!rows.length) return res.status(404).json({ error: "Usuario no encontrado." });
  res.json({ user: publicUser(rows[0]) });
});

app.get("/api/settings", async (_req, res) => {
  res.json(await getSettings());
});

app.put("/api/settings", auth(), allowRoles("admin"), async (req, res) => {
  const { storeName, whatsappNumber, supportLink, paymentMethods } = req.body;
  await upsertSetting("storeName", storeName || "GAMING STORE");
  await upsertSetting("whatsappNumber", whatsappNumber || "");
  await upsertSetting("supportLink", supportLink || "https://discord.gg/bGCWtKXT");
  await upsertSetting("paymentMethods", Array.isArray(paymentMethods) ? paymentMethods.join(",") : String(paymentMethods || ""));
  res.json(await getSettings());
});

app.get("/api/products", async (_req, res) => {
  const products = await query("SELECT * FROM products WHERE active = 1 ORDER BY id DESC");
  const durations = await query("SELECT * FROM product_durations ORDER BY product_id, sort_order, id");
  const byProduct = new Map();
  durations.forEach((duration) => {
    if (!byProduct.has(duration.product_id)) byProduct.set(duration.product_id, []);
    byProduct.get(duration.product_id).push({
      id: duration.id,
      label: duration.label,
      price: Number(duration.price)
    });
  });
  res.json(products.map((product) => ({
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    image: product.image,
    active: Boolean(product.active),
    durations: byProduct.get(product.id) || []
  })));
});

app.get("/api/admin/products", auth(), allowRoles("admin", "helper"), async (_req, res) => {
  const products = await query("SELECT * FROM products ORDER BY id DESC");
  const durations = await query("SELECT * FROM product_durations ORDER BY product_id, sort_order, id");
  const byProduct = new Map();
  durations.forEach((duration) => {
    if (!byProduct.has(duration.product_id)) byProduct.set(duration.product_id, []);
    byProduct.get(duration.product_id).push({ id: duration.id, label: duration.label, price: Number(duration.price) });
  });
  res.json(products.map((product) => ({ ...product, active: Boolean(product.active), durations: byProduct.get(product.id) || [] })));
});

app.post("/api/admin/products", auth(), allowRoles("admin", "helper"), async (req, res) => {
  const product = req.body;
  const result = await query(
    "INSERT INTO products (name, category, description, image, active) VALUES (:name, :category, :description, :image, :active)",
    {
      name: product.name,
      category: product.category,
      description: product.description,
      image: product.image || "assets/producto-gaming-premium.png",
      active: product.active ? 1 : 0
    }
  );
  await saveDurations(result.insertId, product.durations || []);
  res.status(201).json({ id: result.insertId });
});

app.put("/api/admin/products/:id", auth(), allowRoles("admin", "helper"), async (req, res) => {
  const id = Number(req.params.id);
  const product = req.body;
  await query(
    "UPDATE products SET name = :name, category = :category, description = :description, image = :image, active = :active WHERE id = :id",
    {
      id,
      name: product.name,
      category: product.category,
      description: product.description,
      image: product.image || "assets/producto-gaming-premium.png",
      active: product.active ? 1 : 0
    }
  );
  await saveDurations(id, product.durations || []);
  res.json({ ok: true });
});

app.delete("/api/admin/products/:id", auth(), allowRoles("admin", "helper"), async (req, res) => {
  await query("DELETE FROM products WHERE id = :id", { id: Number(req.params.id) });
  res.json({ ok: true });
});

async function saveDurations(productId, durations) {
  await query("DELETE FROM product_durations WHERE product_id = :productId", { productId });
  for (let index = 0; index < durations.length; index += 1) {
    const duration = durations[index];
    if (!duration.label) continue;
    await query(
      "INSERT INTO product_durations (product_id, label, price, sort_order) VALUES (:productId, :label, :price, :sortOrder)",
      { productId, label: duration.label, price: Number(duration.price || 0), sortOrder: index }
    );
  }
}

app.post("/api/orders", auth(), allowRoles("client", "admin"), async (req, res) => {
  const { items, paymentMethod, note } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "El carrito esta vacio." });
  }

  const userRows = await query("SELECT * FROM users WHERE id = :id LIMIT 1", { id: req.user.id });
  const user = userRows[0];
  if (!user) return res.status(404).json({ error: "Usuario no encontrado." });

  let total = 0;
  const preparedItems = [];
  for (const item of items) {
    const productRows = await query("SELECT * FROM products WHERE id = :id AND active = 1 LIMIT 1", { id: item.productId });
    const durationRows = await query(
      "SELECT * FROM product_durations WHERE product_id = :productId AND label = :label LIMIT 1",
      { productId: item.productId, label: item.durationLabel }
    );
    if (!productRows.length || !durationRows.length) continue;
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitPrice = Number(durationRows[0].price);
    const itemTotal = unitPrice * quantity;
    total += itemTotal;
    preparedItems.push({
      productId: productRows[0].id,
      productName: productRows[0].name,
      durationLabel: durationRows[0].label,
      quantity,
      unitPrice,
      total: itemTotal
    });
  }

  if (!preparedItems.length) {
    return res.status(400).json({ error: "No se pudo preparar el pedido." });
  }

  const result = await query(
    "INSERT INTO orders (user_id, buyer_name, buyer_contact, payment_method, note, total) VALUES (:userId, :buyerName, :buyerContact, :paymentMethod, :note, :total)",
    {
      userId: user.id,
      buyerName: user.name,
      buyerContact: user.contact || user.email || user.username,
      paymentMethod: paymentMethod || "Por coordinar",
      note: note || null,
      total
    }
  );

  for (const item of preparedItems) {
    await query(
      "INSERT INTO order_items (order_id, product_id, product_name, duration_label, quantity, unit_price, total) VALUES (:orderId, :productId, :productName, :durationLabel, :quantity, :unitPrice, :total)",
      { orderId: result.insertId, ...item }
    );
  }

  res.status(201).json({ id: result.insertId, total });
});

app.get("/api/admin/orders", auth(), allowRoles("admin"), async (_req, res) => {
  const orders = await query("SELECT * FROM orders ORDER BY id DESC LIMIT 100");
  const items = await query("SELECT * FROM order_items ORDER BY id ASC");
  const byOrder = new Map();
  items.forEach((item) => {
    if (!byOrder.has(item.order_id)) byOrder.set(item.order_id, []);
    byOrder.get(item.order_id).push(item);
  });
  res.json(orders.map((order) => ({ ...order, total: Number(order.total), items: byOrder.get(order.id) || [] })));
});

app.get("/api/admin/users", auth(), allowRoles("admin"), async (_req, res) => {
  const users = await query("SELECT id, role, username, email, name, contact, active, created_at FROM users ORDER BY id DESC");
  res.json(users.map(publicUser));
});

app.put("/api/admin/users/:id", auth(), allowRoles("admin"), async (req, res) => {
  const id = Number(req.params.id);
  const { role, username, email, name, contact, active, password } = req.body;
  await query(
    "UPDATE users SET role = :role, username = :username, email = :email, name = :name, contact = :contact, active = :active WHERE id = :id",
    { id, role, username, email: email || null, name, contact: contact || null, active: active ? 1 : 0 }
  );
  if (password) {
    const passwordHash = await bcrypt.hash(password, 10);
    await query("UPDATE users SET password_hash = :passwordHash WHERE id = :id", { id, passwordHash });
  }
  res.json({ ok: true });
});

app.delete("/api/admin/users/:id", auth(), allowRoles("admin"), async (req, res) => {
  await query("DELETE FROM users WHERE id = :id", { id: Number(req.params.id) });
  res.json({ ok: true });
});

app.use(express.static(__dirname, { dotfiles: "ignore" }));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

async function start() {
  await pool.query("SELECT 1");
  await seedDefaultStaff();
  await seedProducts();
  app.listen(PORT, HOST, () => {
    console.log(`Gaming Store corriendo en http://${HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error("No se pudo iniciar el servidor:", error.message);
  process.exit(1);
});
