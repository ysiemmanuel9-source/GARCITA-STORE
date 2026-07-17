const API_BASE = window.API_BASE_URL || "";
const TOKEN_KEY = "gaming_store_token_v2";
const USER_KEY = "gaming_store_user_v2";
const DEFAULT_IMAGE = "assets/producto-gaming-premium.png";

let token = localStorage.getItem(TOKEN_KEY) || "";
let currentUser = readJSON(USER_KEY, null);
let settings = {
  storeName: "GAMING STORE",
  whatsappNumber: "",
  supportLink: "https://discord.gg/bGCWtKXT",
  paymentMethods: ["PayPal", "Yape", "BBVA", "Remitly", "Western Union"]
};
let products = [];
let adminProducts = [];
let cart = [];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

init();

async function init() {
  bindEvents();
  await loadPublicData();

  if (token) {
    try {
      const me = await api("/api/me");
      currentUser = me.user;
      saveSession(token, currentUser);
      showApp();
      await loadRoleData();
    } catch {
      clearSession();
      showGate();
    }
  } else {
    showGate();
  }
}

function bindEvents() {
  $("#staffLoginForm").addEventListener("submit", staffLogin);
  $("#showClientAccessBtn").addEventListener("click", () => $("#clientAccess").classList.toggle("hidden"));
  $("#clientLoginForm").addEventListener("submit", clientLogin);
  $("#clientRegisterForm").addEventListener("submit", clientRegister);
  $("#logoutBtn").addEventListener("click", logout);

  $$(".tab[data-client-tab]").forEach((button) => {
    button.addEventListener("click", () => switchClientTab(button.dataset.clientTab));
  });

  $("#cartOpenBtn").addEventListener("click", openCart);
  $("#heroCartBtn").addEventListener("click", openCart);
  $("#cartCloseBtn").addEventListener("click", closePanels);
  $("#overlay").addEventListener("click", closePanels);
  $("#checkoutBtn").addEventListener("click", checkout);

  $("#productsGrid").addEventListener("change", (event) => {
    if (!event.target.matches(".duration-select")) return;
    const card = event.target.closest(".product-card");
    const option = event.target.selectedOptions[0];
    card.querySelector(".price-live").textContent = formatMoney(option.dataset.price);
  });

  $("#productsGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-product]");
    if (!button) return;
    const product = products.find((item) => String(item.id) === button.dataset.addProduct);
    const select = button.closest(".product-card").querySelector(".duration-select");
    const duration = product.durations[Number(select.value)];
    addToCart(product, duration);
  });

  $("#cartItems").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cart-action]");
    if (!button) return;
    updateCartItem(button.dataset.cartKey, button.dataset.cartAction);
  });

  $("#productImage").addEventListener("change", handleImageUpload);
  $("#addDurationBtn").addEventListener("click", () => addDurationRow());
  $("#resetProductForm").addEventListener("click", resetProductForm);
  $("#productForm").addEventListener("submit", saveProductFromForm);
  $("#productsTable").addEventListener("click", handleProductTableClick);

  $("#settingsForm").addEventListener("submit", saveSettings);
  $("#refreshUsersBtn").addEventListener("click", loadUsers);
  $("#usersTable").addEventListener("click", handleUsersTableClick);
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || "Error de servidor");
  return data;
}

function readJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function saveSession(newToken, user) {
  token = newToken;
  currentUser = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  token = "";
  currentUser = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function loadPublicData() {
  const [settingsData, productData] = await Promise.all([
    api("/api/settings").catch(() => settings),
    api("/api/products").catch(() => [])
  ]);
  settings = settingsData;
  products = productData;
  updateBrand();
  renderProducts();
  renderPayments();
  renderBuyerPaymentOptions();
}

async function loadRoleData() {
  renderRoleUI();
  renderCart();
  if (isStaff()) {
    await loadAdminProducts();
  }
  if (isAdmin()) {
    await Promise.all([loadOrders(), loadUsers()]);
    renderSettingsForm();
  }
}

function showGate() {
  $("#accessGate").classList.remove("hidden");
  $$(".app-shell").forEach((node) => node.classList.add("hidden"));
}

function showApp() {
  $("#accessGate").classList.add("hidden");
  $$(".app-shell").forEach((node) => node.classList.remove("hidden"));
  renderRoleUI();
  renderCart();
}

function renderRoleUI() {
  const roleLabel = currentUser ? `${currentUser.name} (${currentUser.role})` : "Invitado";
  $("#accountBadge").textContent = roleLabel;
  $("#buyerProfileText").textContent = currentUser?.role === "client"
    ? `Pedido a nombre de ${currentUser.name}. Contacto: ${currentUser.contact || currentUser.email || currentUser.username}.`
    : "Para comprar como cliente, cierra sesion y entra como cliente.";

  $("#admin").classList.toggle("hidden", !isStaff());
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", !isAdmin()));

  if (isStaff()) {
    $("#adminLogoutBtn").classList.remove("hidden");
  }
}

function isStaff() {
  return currentUser?.role === "admin" || currentUser?.role === "helper";
}

function isAdmin() {
  return currentUser?.role === "admin";
}

async function staffLogin(event) {
  event.preventDefault();
  try {
    const data = await api("/api/auth/staff-login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#staffUsername").value.trim(),
        password: $("#staffPassword").value
      })
    });
    saveSession(data.token, data.user);
    showApp();
    await loadRoleData();
    showToast("Bienvenido al panel");
  } catch (error) {
    showToast(error.message);
  }
}

async function clientLogin(event) {
  event.preventDefault();
  try {
    const data = await api("/api/auth/client-login", {
      method: "POST",
      body: JSON.stringify({
        username: $("#clientLoginUsername").value.trim(),
        password: $("#clientLoginPassword").value
      })
    });
    saveSession(data.token, data.user);
    showApp();
    await loadRoleData();
    showToast("Bienvenido");
  } catch (error) {
    showToast(error.message);
  }
}

async function clientRegister(event) {
  event.preventDefault();
  try {
    const data = await api("/api/auth/client-register", {
      method: "POST",
      body: JSON.stringify({
        name: $("#clientRegisterName").value.trim(),
        username: $("#clientRegisterUsername").value.trim(),
        email: $("#clientRegisterEmail").value.trim(),
        contact: $("#clientRegisterContact").value.trim(),
        password: $("#clientRegisterPassword").value
      })
    });
    saveSession(data.token, data.user);
    showApp();
    await loadRoleData();
    showToast("Perfil creado");
  } catch (error) {
    showToast(error.message);
  }
}

function switchClientTab(tab) {
  $$(".tab[data-client-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.clientTab === tab);
  });
  $("#clientLoginForm").classList.toggle("hidden", tab !== "login");
  $("#clientRegisterForm").classList.toggle("hidden", tab !== "register");
}

function logout() {
  clearSession();
  cart = [];
  renderCart();
  showGate();
}

function updateBrand() {
  $$("[data-store-name]").forEach((node) => {
    node.textContent = settings.storeName || "GAMING STORE";
  });
  $("#supportLink").href = settings.supportLink || "#";
}

function renderPayments() {
  $("#paymentList").innerHTML = settings.paymentMethods
    .map((method) => `<span>${escapeHTML(method)}</span>`)
    .join("");
}

function renderBuyerPaymentOptions() {
  $("#buyerPayment").innerHTML = settings.paymentMethods
    .map((method) => `<option value="${escapeAttribute(method)}">${escapeHTML(method)}</option>`)
    .join("");
}

function renderProducts() {
  if (!products.length) {
    $("#productsGrid").innerHTML = `<div class="glass-card"><h3>No hay productos disponibles</h3><p>El catalogo se esta preparando.</p></div>`;
    return;
  }

  $("#productsGrid").innerHTML = products.map((product) => {
    const options = product.durations.map((duration, index) => {
      return `<option value="${index}" data-price="${duration.price}">${escapeHTML(duration.label)} - ${formatMoney(duration.price)}</option>`;
    }).join("");
    const firstPrice = product.durations[0]?.price || 0;

    return `
      <article class="product-card reveal">
        <img class="product-image" src="${product.image || DEFAULT_IMAGE}" alt="${escapeHTML(product.name)}">
        <span class="product-tag">${escapeHTML(product.category)}</span>
        <h3>${escapeHTML(product.name)}</h3>
        <p>${escapeHTML(product.description)}</p>
        <div class="product-controls">
          <select class="duration-select" aria-label="Tiempo disponible">${options}</select>
          <strong class="price-live">${formatMoney(firstPrice)}</strong>
          <button class="primary-btn full" type="button" data-add-product="${product.id}">Anadir al carrito</button>
        </div>
      </article>
    `;
  }).join("");
}

function addToCart(product, duration) {
  if (!duration) return;
  const key = `${product.id}::${duration.label}`;
  const existing = cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      key,
      productId: product.id,
      productName: product.name,
      durationLabel: duration.label,
      price: Number(duration.price),
      quantity: 1,
      image: product.image || DEFAULT_IMAGE
    });
  }
  renderCart();
  showToast("Producto agregado");
}

function renderCart() {
  $("#cartCount").textContent = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!cart.length) {
    $("#cartItems").innerHTML = `<p class="empty-cart">El carrito esta vacio.</p>`;
  } else {
    $("#cartItems").innerHTML = cart.map((item) => `
      <div class="cart-item">
        <img src="${item.image || DEFAULT_IMAGE}" alt="${escapeHTML(item.productName)}">
        <div>
          <h4>${escapeHTML(item.productName)}</h4>
          <p>${escapeHTML(item.durationLabel)} | ${formatMoney(item.price)} c/u</p>
          <div class="qty-row">
            <button type="button" data-cart-action="minus" data-cart-key="${item.key}">-</button>
            <strong>${item.quantity}</strong>
            <button type="button" data-cart-action="plus" data-cart-key="${item.key}">+</button>
            <button type="button" data-cart-action="remove" data-cart-key="${item.key}">Quitar</button>
          </div>
        </div>
      </div>
    `).join("");
  }

  $("#cartTotal").textContent = `${formatMoney(getCartTotal())} USD`;
}

function updateCartItem(key, action) {
  const item = cart.find((entry) => entry.key === key);
  if (!item) return;
  if (action === "plus") item.quantity += 1;
  if (action === "minus") item.quantity -= 1;
  if (action === "remove" || item.quantity <= 0) {
    cart = cart.filter((entry) => entry.key !== key);
  }
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

async function checkout() {
  if (!cart.length) return showToast("Agrega productos primero");
  if (currentUser?.role !== "client" && currentUser?.role !== "admin") {
    return showToast("Entra como cliente para comprar");
  }

  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items: cart.map((item) => ({
          productId: item.productId,
          durationLabel: item.durationLabel,
          quantity: item.quantity
        })),
        paymentMethod: $("#buyerPayment").value,
        note: $("#buyerNote").value.trim()
      })
    });

    const message = buildWhatsAppMessage(data.id, data.total);
    cart = [];
    renderCart();
    closePanels();
    showToast("Pedido guardado");

    const whatsapp = (settings.whatsappNumber || "").replace(/\D/g, "");
    if (whatsapp) window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`, "_blank");
  } catch (error) {
    showToast(error.message);
  }
}

function buildWhatsAppMessage(orderId, total) {
  const lines = [
    `Nuevo pedido #${orderId} - ${settings.storeName}`,
    `Cliente: ${currentUser.name}`,
    `Contacto: ${currentUser.contact || currentUser.email || currentUser.username}`,
    `Metodo: ${$("#buyerPayment").value}`,
    "",
    "Productos:"
  ];
  cart.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.productName} | ${item.durationLabel} | x${item.quantity} | ${formatMoney(item.price * item.quantity)}`);
  });
  lines.push("");
  lines.push(`Total: ${formatMoney(total)} USD`);
  const note = $("#buyerNote").value.trim();
  if (note) lines.push(`Nota: ${note}`);
  return lines.join("\n");
}

function openCart() {
  $("#cartDrawer").classList.add("open");
  $("#cartDrawer").setAttribute("aria-hidden", "false");
  $("#overlay").classList.remove("hidden");
}

function closePanels() {
  $("#cartDrawer").classList.remove("open");
  $("#cartDrawer").setAttribute("aria-hidden", "true");
  $("#overlay").classList.add("hidden");
}

async function loadAdminProducts() {
  adminProducts = await api("/api/admin/products");
  renderProductsTable();
  resetProductForm();
}

function renderProductsTable() {
  $("#productsTable").innerHTML = adminProducts.map((product) => {
    const durationText = product.durations.map((duration) => `${escapeHTML(duration.label)} ${formatMoney(duration.price)}`).join("<br>");
    return `
      <tr>
        <td><strong>${escapeHTML(product.name)}</strong><br><small>${escapeHTML(product.category)}</small></td>
        <td>${durationText}</td>
        <td>${product.active ? "Activo" : "Oculto"}</td>
        <td>
          <div class="row-actions">
            <button class="mini-btn" type="button" data-edit-product="${product.id}">Editar</button>
            <button class="mini-btn danger" type="button" data-delete-product="${product.id}">Borrar</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function addDurationRow(label = "", price = "") {
  const row = document.createElement("div");
  row.className = "duration-row";
  row.innerHTML = `
    <input class="duration-label" type="text" placeholder="Semana" value="${escapeAttribute(label)}" required>
    <input class="duration-price" type="number" min="0" step="0.01" placeholder="5.50" value="${escapeAttribute(price)}" required>
    <button class="remove-duration" type="button" aria-label="Quitar tiempo">x</button>
  `;
  row.querySelector(".remove-duration").addEventListener("click", () => {
    row.remove();
    if (!$("#durationEditor").children.length) addDurationRow();
  });
  $("#durationEditor").appendChild(row);
}

function resetProductForm() {
  $("#productForm").reset();
  $("#productId").value = "";
  $("#productImageData").value = "";
  $("#productFormTitle").textContent = "Agregar producto";
  $("#productPreview").classList.add("hidden");
  $("#durationEditor").innerHTML = "";
  addDurationRow("Semana", "5.50");
  addDurationRow("Mes", "10.35");
}

function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("#productImageData").value = reader.result;
    $("#productPreview").src = reader.result;
    $("#productPreview").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

async function saveProductFromForm(event) {
  event.preventDefault();
  const id = $("#productId").value;
  const existing = adminProducts.find((product) => String(product.id) === String(id));
  const payload = {
    name: $("#productName").value.trim(),
    category: $("#productCategory").value.trim(),
    description: $("#productDescription").value.trim(),
    image: $("#productImageData").value || existing?.image || DEFAULT_IMAGE,
    active: $("#productActive").checked,
    durations: $$(".duration-row").map((row) => ({
      label: row.querySelector(".duration-label").value.trim(),
      price: Number(row.querySelector(".duration-price").value)
    })).filter((duration) => duration.label)
  };

  try {
    await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    await Promise.all([loadPublicData(), loadAdminProducts()]);
    showToast("Producto guardado en la BD");
  } catch (error) {
    showToast(error.message);
  }
}

function handleProductTableClick(event) {
  const edit = event.target.closest("[data-edit-product]");
  const del = event.target.closest("[data-delete-product]");
  if (edit) editProduct(edit.dataset.editProduct);
  if (del) deleteProduct(del.dataset.deleteProduct);
}

function editProduct(id) {
  const product = adminProducts.find((item) => String(item.id) === String(id));
  if (!product) return;
  $("#productId").value = product.id;
  $("#productName").value = product.name;
  $("#productCategory").value = product.category;
  $("#productDescription").value = product.description;
  $("#productImageData").value = product.image || "";
  $("#productActive").checked = Boolean(product.active);
  $("#productFormTitle").textContent = "Editando producto";
  $("#productPreview").src = product.image || DEFAULT_IMAGE;
  $("#productPreview").classList.remove("hidden");
  $("#durationEditor").innerHTML = "";
  product.durations.forEach((duration) => addDurationRow(duration.label, duration.price));
}

async function deleteProduct(id) {
  if (!confirm("Borrar este producto?")) return;
  try {
    await api(`/api/admin/products/${id}`, { method: "DELETE" });
    await Promise.all([loadPublicData(), loadAdminProducts()]);
    showToast("Producto borrado");
  } catch (error) {
    showToast(error.message);
  }
}

function renderSettingsForm() {
  $("#settingsStoreName").value = settings.storeName || "";
  $("#settingsWhatsapp").value = settings.whatsappNumber || "";
  $("#settingsSupport").value = settings.supportLink || "";
  $("#settingsPayments").value = settings.paymentMethods.join(", ");
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    settings = await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        storeName: $("#settingsStoreName").value.trim(),
        whatsappNumber: $("#settingsWhatsapp").value.trim(),
        supportLink: $("#settingsSupport").value.trim(),
        paymentMethods: $("#settingsPayments").value.split(",").map((item) => item.trim()).filter(Boolean)
      })
    });
    updateBrand();
    renderPayments();
    renderBuyerPaymentOptions();
    showToast("Ajustes guardados en la BD");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadOrders() {
  try {
    const orders = await api("/api/admin/orders");
    $("#ordersList").innerHTML = orders.length ? orders.map((order) => `
      <article class="order-card">
        <strong>${formatMoney(order.total)} USD</strong>
        <p>${escapeHTML(order.created_at)} | ${escapeHTML(order.buyer_name)} | ${escapeHTML(order.buyer_contact)}</p>
        <small>${order.items.map((item) => `${escapeHTML(item.product_name)} (${escapeHTML(item.duration_label)}) x${item.quantity}`).join("<br>")}</small>
      </article>
    `).join("") : `<p class="empty-cart">Todavia no hay ventas.</p>`;
  } catch (error) {
    $("#ordersList").innerHTML = `<p class="empty-cart">${escapeHTML(error.message)}</p>`;
  }
}

async function loadUsers() {
  try {
    const users = await api("/api/admin/users");
    $("#usersTable").innerHTML = users.map((user) => `
      <tr>
        <td><strong>${escapeHTML(user.name)}</strong><br><small>${escapeHTML(user.username)}</small></td>
        <td>${escapeHTML(user.role)}</td>
        <td>${escapeHTML(user.contact || user.email || "")}</td>
        <td>${user.active ? "Activo" : "Bloqueado"}</td>
        <td>
          <div class="row-actions">
            <button class="mini-btn" type="button" data-toggle-user="${user.id}" data-active="${user.active ? "0" : "1"}">${user.active ? "Bloquear" : "Activar"}</button>
            <button class="mini-btn danger" type="button" data-delete-user="${user.id}">Borrar</button>
          </div>
        </td>
      </tr>
    `).join("");
  } catch (error) {
    $("#usersTable").innerHTML = `<tr><td colspan="5">${escapeHTML(error.message)}</td></tr>`;
  }
}

async function handleUsersTableClick(event) {
  const toggle = event.target.closest("[data-toggle-user]");
  const del = event.target.closest("[data-delete-user]");
  if (toggle) {
    const row = await api("/api/admin/users");
    const user = row.find((item) => String(item.id) === toggle.dataset.toggleUser);
    if (!user) return;
    await api(`/api/admin/users/${user.id}`, {
      method: "PUT",
      body: JSON.stringify({ ...user, active: toggle.dataset.active === "1" })
    });
    await loadUsers();
  }
  if (del) {
    if (!confirm("Borrar usuario?")) return;
    await api(`/api/admin/users/${del.dataset.deleteUser}`, { method: "DELETE" });
    await loadUsers();
  }
}

function formatMoney(value) {
  return `$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHTML(value);
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.add("hidden"), 3000);
}
