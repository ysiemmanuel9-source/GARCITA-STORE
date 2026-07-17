(function () {
  const sessionId = localStorage.getItem("garcitaSessionId")
    || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  localStorage.setItem("garcitaSessionId", sessionId);

  let whatsappGroup = "https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3";
  let whatsappNumber = "5216863387186";
  const state = {
    customer: null,
    products: [],
    paymentMethods: [],
    pendingPurchase: null,
    pendingEmail: "",
    emailNotice: ""
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function formatMoney(value) {
    const amount = Number(value || 0);
    return `${amount % 1 ? amount.toFixed(2) : amount.toFixed(0)} MX`;
  }

  function priceFromText(value) {
    const match = String(value || "").match(/(\d+(?:[.,]\d+)?)/);
    return match ? Number(match[1].replace(",", ".")) : 0;
  }

  function showToast(message) {
    const toast = $("#toastMsg");
    if (!toast) return;
    $("#toastText").innerText = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo completar la accion.");
    return data;
  }

  function postJson(url, body) {
    return requestJson(url, {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  function injectWalletStyles() {
    if ($("#garcitaWalletStyles")) return;
    const style = document.createElement("style");
    style.id = "garcitaWalletStyles";
    style.textContent = `
      .wallet-chip {
        min-height: 46px;
        display: inline-flex;
        align-items: center;
        gap: 9px;
        border: 1px solid rgba(255,71,87,.32);
        border-radius: 12px;
        padding: 0 14px;
        background: rgba(20,7,10,.86);
        color: #fff;
        font-weight: 800;
        white-space: nowrap;
        box-shadow: inset 0 1px rgba(255,255,255,.035), 0 0 20px rgba(255,37,56,.13);
      }
      .wallet-chip small { display: block; color: var(--text-muted); font-size: .65rem; font-weight: 700; line-height: 1; }
      .wallet-chip strong { display: block; font-size: .86rem; line-height: 1.2; }
      .wallet-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 2500;
        display: none;
        place-items: center;
        padding: 18px;
        background: rgba(0,0,0,.72);
        backdrop-filter: blur(10px);
      }
      .wallet-modal-backdrop.show { display: grid; }
      .wallet-modal {
        width: min(760px, 96vw);
        max-height: 88vh;
        overflow: auto;
        border: 1px solid rgba(255,71,87,.32);
        border-radius: 22px;
        background:
          radial-gradient(circle at 12% 0%, rgba(255,37,56,.18), transparent 34%),
          rgba(3,8,18,.97);
        color: #fff;
        box-shadow: 0 35px 90px rgba(0,0,0,.62);
      }
      .wallet-modal-head {
        position: sticky;
        top: 0;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
        padding: 18px 20px;
        border-bottom: 1px solid rgba(255,71,87,.22);
        background: rgba(3,8,18,.92);
        backdrop-filter: blur(14px);
      }
      .wallet-modal-head h3 { margin: 0; font-size: 1.25rem; }
      .wallet-close {
        width: 38px;
        height: 38px;
        border-radius: 11px;
        border: 1px solid rgba(255,71,87,.32);
        background: rgba(255,255,255,.05);
        color: #fff;
      }
      .wallet-modal-body { padding: 20px; display: grid; gap: 16px; }
      .wallet-card {
        border: 1px solid rgba(255,71,87,.24);
        border-radius: 16px;
        background: rgba(20,7,10,.78);
        padding: 16px;
      }
      .wallet-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px; }
      .wallet-field { display: grid; gap: 7px; }
      .wallet-field label { color: var(--text-muted); font-size: .82rem; font-weight: 800; }
      .wallet-field input, .wallet-field textarea, .wallet-field select {
        width: 100%;
        border: 1px solid rgba(255,71,87,.25);
        border-radius: 11px;
        background: rgba(255,255,255,.05);
        color: #fff;
        padding: 12px 13px;
        font: inherit;
      }
      .wallet-field textarea { min-height: 88px; resize: vertical; }
      .wallet-field select option { background: #130306; }
      .wallet-actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
      .wallet-btn {
        min-height: 42px;
        border-radius: 11px;
        padding: 0 15px;
        font-weight: 800;
        color: #fff;
        background: linear-gradient(135deg, var(--primary), var(--secondary));
        border: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .wallet-btn.ghost {
        background: rgba(255,255,255,.06);
        border: 1px solid rgba(255,71,87,.26);
      }
      .wallet-btn.danger { background: rgba(255,37,56,.13); border: 1px solid rgba(255,37,56,.36); }
      .wallet-muted { color: var(--text-muted); font-size: .9rem; }
      .wallet-alert {
        margin: 0 0 12px;
        border: 1px solid rgba(255,71,87,.34);
        border-radius: 13px;
        padding: 12px 13px;
        background: rgba(255,37,56,.08);
        color: #ffd4d8;
        font-size: .9rem;
        line-height: 1.45;
      }
      .wallet-alert.ok {
        border-color: rgba(34,197,94,.34);
        background: rgba(34,197,94,.08);
        color: #d7ffe4;
      }
      .wallet-balance { font: 900 2.2rem Outfit, sans-serif; color: #fff; margin: 2px 0 0; }
      .wallet-methods { display: grid; gap: 10px; }
      .wallet-method {
        border: 1px solid rgba(255,71,87,.22);
        border-radius: 14px;
        padding: 13px;
        background: rgba(255,255,255,.035);
      }
      .wallet-method strong { display: block; margin-bottom: 5px; }
      .wallet-method code {
        display: inline-block;
        margin-top: 4px;
        padding: 5px 7px;
        border-radius: 8px;
        background: rgba(0,0,0,.28);
        color: #fff;
        white-space: normal;
      }
      .wallet-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
      .wallet-tab {
        flex: 1;
        border-radius: 10px;
        padding: 10px;
        background: rgba(255,255,255,.05);
        color: #fff;
        border: 1px solid rgba(255,71,87,.2);
        font-weight: 800;
      }
      .wallet-tab.active { background: linear-gradient(135deg, var(--primary), var(--secondary)); }
      .wallet-history { display: grid; gap: 8px; }
      .wallet-history-item {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 10px 0;
        border-bottom: 1px solid rgba(255,71,87,.16);
        color: var(--text-muted);
        font-size: .9rem;
      }
      @media (max-width: 900px) {
        .wallet-chip { width: 100%; justify-content: center; }
        .wallet-grid { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureWalletUi() {
    injectWalletStyles();
    if (!$("#walletChip")) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.id = "walletChip";
      chip.className = "wallet-chip";
      chip.innerHTML = '<i class="fas fa-wallet"></i><span><small>Saldo</small><strong>Iniciar sesion</strong></span>';
      const groupBtn = $("#groupBtn");
      if (groupBtn?.parentNode) groupBtn.parentNode.insertBefore(chip, groupBtn);
      else document.body.appendChild(chip);
      chip.addEventListener("click", () => openAccountModal());
    }
    if (!$("#walletModalRoot")) {
      const root = document.createElement("div");
      root.id = "walletModalRoot";
      root.className = "wallet-modal-backdrop";
      document.body.appendChild(root);
      root.addEventListener("click", (event) => {
        if (event.target === root || event.target.closest("[data-wallet-close]")) closeModal();
      });
      root.addEventListener("submit", handleModalSubmit);
      root.addEventListener("click", handleModalClick);
      root.addEventListener("change", handleModalChange);
    }
    updateWalletChip();
  }

  function updateWalletChip() {
    const chip = $("#walletChip");
    if (!chip) return;
    if (state.customer) {
      chip.innerHTML = `<i class="fas fa-wallet"></i><span><small>Mi saldo</small><strong>${formatMoney(state.customer.balance)}</strong></span>`;
    } else {
      chip.innerHTML = '<i class="fas fa-wallet"></i><span><small>Saldo</small><strong>Iniciar sesion</strong></span>';
    }
  }

  function modal(title, body) {
    const root = $("#walletModalRoot");
    root.innerHTML = `
      <div class="wallet-modal" role="dialog" aria-modal="true">
        <div class="wallet-modal-head">
          <h3>${escapeHtml(title)}</h3>
          <button class="wallet-close" type="button" data-wallet-close aria-label="Cerrar"><i class="fas fa-xmark"></i></button>
        </div>
        <div class="wallet-modal-body">${body}</div>
      </div>`;
    root.classList.add("show");
  }

  function closeModal() {
    $("#walletModalRoot")?.classList.remove("show");
  }

  function accountBody(mode = "login") {
    if (state.customer) {
      const topups = Array.isArray(state.customer.topups) ? state.customer.topups : [];
      return `
        <div class="wallet-card">
          <span class="wallet-muted">Cuenta de ${escapeHtml(state.customer.name)}</span>
          <div class="wallet-balance">${formatMoney(state.customer.balance)}</div>
          <p class="wallet-muted">Este saldo se guarda en tu cuenta y no se borra aunque cierres la pagina.</p>
          <div class="wallet-actions" style="margin-top:14px;">
            <button class="wallet-btn" type="button" data-action="open-topup"><i class="fas fa-plus"></i> Recargar saldo</button>
            <button class="wallet-btn ghost" type="button" data-action="logout-customer"><i class="fas fa-right-from-bracket"></i> Salir</button>
          </div>
        </div>
        <div class="wallet-card">
          <h4>Ultimas recargas</h4>
          <div class="wallet-history">
            ${topups.length ? topups.map((item) => `
              <div class="wallet-history-item">
                <span>#${item.id} ${escapeHtml(item.method)} - ${escapeHtml(item.status)}</span>
                <strong>${formatMoney(item.amount)}</strong>
              </div>`).join("") : '<p class="wallet-muted">Aun no tienes recargas registradas.</p>'}
          </div>
        </div>`;
    }

    return `
      <div class="wallet-card">
        <div class="wallet-tabs">
          <button type="button" class="wallet-tab ${mode === "login" ? "active" : ""}" data-action="auth-tab" data-mode="login">Iniciar sesion</button>
          <button type="button" class="wallet-tab ${mode === "register" ? "active" : ""}" data-action="auth-tab" data-mode="register">Crear cuenta</button>
          <button type="button" class="wallet-tab ${mode === "verify" ? "active" : ""}" data-action="auth-tab" data-mode="verify">Verificar</button>
        </div>
        ${state.emailNotice ? `<div class="wallet-alert ${state.emailNotice.startsWith("Codigo enviado") ? "ok" : ""}">${escapeHtml(state.emailNotice)}</div>` : ""}
        ${mode === "register" ? `
          <form data-form="register" class="wallet-grid">
            <div class="wallet-field"><label>Nombre</label><input name="name" required></div>
            <div class="wallet-field"><label>Correo</label><input name="email" type="email" required></div>
            <div class="wallet-field"><label>Contrasena</label><input name="password" type="password" minlength="6" required></div>
            <div class="wallet-field"><label>Confirmar contrasena</label><input name="confirm" type="password" minlength="6" required></div>
            <div class="wallet-actions" style="grid-column:1/-1"><button class="wallet-btn" type="submit"><i class="fas fa-user-plus"></i> Crear y enviar codigo</button></div>
          </form>` : ""}
        ${mode === "verify" ? `
          <form data-form="verify" class="wallet-grid">
            <div class="wallet-field"><label>Correo</label><input name="email" type="email" value="${escapeHtml(state.pendingEmail)}" required></div>
            <div class="wallet-field"><label>Codigo</label><input name="code" inputmode="numeric" maxlength="12" required></div>
            <div class="wallet-actions" style="grid-column:1/-1">
              <button class="wallet-btn" type="submit"><i class="fas fa-shield-check"></i> Verificar correo</button>
              <button class="wallet-btn ghost" type="button" data-action="resend-code">Reenviar codigo</button>
            </div>
          </form>` : ""}
        ${mode === "login" ? `
          <form data-form="login" class="wallet-grid">
            <div class="wallet-field"><label>Correo</label><input name="email" type="email" required></div>
            <div class="wallet-field"><label>Contrasena</label><input name="password" type="password" required></div>
            <div class="wallet-actions" style="grid-column:1/-1"><button class="wallet-btn" type="submit"><i class="fas fa-lock"></i> Entrar a mi saldo</button></div>
          </form>` : ""}
      </div>
      <p class="wallet-muted">Tu saldo se protege desde el servidor. No depende de la IP ni del navegador.</p>`;
  }

  function emailDeliveryNotice(result, email) {
    if (result?.debugCode) return `Modo local: el codigo para ${email} es ${result.debugCode}.`;
    if (result?.emailDelivery?.sent) return `Codigo enviado a ${email}. Revisa Recibidos, Promociones o Spam en Gmail.`;
    const reason = result?.emailDelivery?.reason || "falta configurar Gmail/SMTP en el servidor";
    return `No se pudo enviar el codigo a Gmail todavia: ${reason}.`;
  }

  async function openAccountModal(mode = "login") {
    if (state.customer) await loadCustomer();
    modal("Cuenta y saldo", accountBody(mode));
  }

  function optionMarkup(options = []) {
    if (!options.length) return "";
    return `<div class="product-option"><label>Opcion</label><select class="purchase-option">${
      options.map((option) => (
        `<option value="${escapeHtml(option.label)}" data-price="${escapeHtml(option.price || "")}">`
        + `${escapeHtml(option.label)}${option.price ? ` - ${escapeHtml(option.price)}` : ""}</option>`
      )).join("")
    }</select></div>`;
  }

  function productCard(product) {
    const options = Array.isArray(product.options) ? product.options : [];
    const oldPrice = product.oldPrice ? `<s style="color:var(--text-muted);font-size:.8rem;">${formatMoney(product.oldPrice)}</s> ` : "";
    const badge = product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : "";
    const priceLabel = options.length ? `Desde ${formatMoney(product.price)}` : `${oldPrice}${formatMoney(product.price)}`;

    return `
      <div class="product-card" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}" data-product-price="${formatMoney(product.price)}">
        <div class="product-img-wrapper">
          ${badge}
          <img src="${escapeHtml(product.imageUrl || "assets/garcita-logo.svg")}" class="product-img" alt="${escapeHtml(product.name)}" onerror="this.src='assets/garcita-logo.svg'">
        </div>
        <div class="product-content">
          <h3 class="product-title">${escapeHtml(product.name)}</h3>
          <p class="product-desc">${escapeHtml(product.description)}</p>
          ${optionMarkup(options)}
          <div class="product-footer">
            <span class="product-price">${priceLabel}</span>
            <button class="btn-card comprar-ahora"><i class="fas fa-wallet"></i> Comprar</button>
          </div>
        </div>
      </div>`;
  }

  async function loadProducts() {
    try {
      const products = await requestJson("/api/products");
      state.products = products;
      const grid = $("#productsGrid");
      if (!grid) return;
      grid.innerHTML = products.length
        ? products.map(productCard).join("")
        : '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No hay productos disponibles ahora mismo.</p>';
    } catch {
      console.info("La pagina esta abierta sin servidor de productos.");
    }
  }

  async function loadCustomer() {
    try {
      const data = await requestJson("/api/customer/me");
      state.customer = { ...data.customer, topups: data.topups || [] };
    } catch {
      state.customer = null;
    }
    updateWalletChip();
    return state.customer;
  }

  async function loadPaymentMethods() {
    try {
      state.paymentMethods = await requestJson("/api/payment-methods");
    } catch {
      state.paymentMethods = [];
    }
  }

  function selectedPurchase(card) {
    const selected = $(".purchase-option", card)?.selectedOptions?.[0];
    if (!selected) return { label: "", priceText: card.dataset.productPrice || "", amount: priceFromText(card.dataset.productPrice) };
    const price = selected.dataset.price || "";
    const labelFromText = selected.textContent.replace(price ? ` - ${price}` : "", "").trim();
    const label = selected.value && selected.value !== selected.textContent ? selected.value : labelFromText;
    return { label, priceText: price, amount: priceFromText(price) };
  }

  function openPurchasePanel(card) {
    if (!card) return;
    const productId = Number(card.dataset.productId || 0) || null;
    const productName = card.dataset.productName || $(".product-title", card)?.textContent?.trim() || "Producto";
    const purchase = selectedPurchase(card);
    state.pendingPurchase = { productId, productName, ...purchase };
    if (!state.customer) {
      showToast("Inicia sesion para comprar con saldo.");
      openAccountModal("login");
      return;
    }
    const optionText = purchase.label ? `${purchase.label}${purchase.priceText ? ` - ${purchase.priceText}` : ""}` : "Sin opcion";
    const balance = Number(state.customer.balance || 0);
    modal("Comprar con saldo", `
      <div class="wallet-card">
        <span class="wallet-muted">Producto seleccionado</span>
        <h3>${escapeHtml(productName)}</h3>
        <p class="wallet-muted">${escapeHtml(optionText)}</p>
        <div class="wallet-balance">${formatMoney(purchase.amount)}</div>
        <p class="wallet-muted">Tu saldo actual: <strong>${formatMoney(balance)}</strong>. Recibes ${formatMoney(15)} de bono por compra.</p>
      </div>
      <div class="wallet-actions">
        <button class="wallet-btn" type="button" data-action="pay-balance"><i class="fas fa-shield-check"></i> Pagar con saldo</button>
        <button class="wallet-btn ghost" type="button" data-action="open-topup"><i class="fas fa-plus"></i> Recargar saldo</button>
        <button class="wallet-btn ghost" type="button" data-action="remitly"><i class="fab fa-whatsapp"></i> Remitly por WhatsApp</button>
      </div>
      <p class="wallet-muted">Las transferencias, OXXO y Binance se acreditan cuando admin aprueba tu comprobante.</p>
    `);
  }

  function methodsMarkup() {
    const methods = state.paymentMethods.filter((method) => method.id !== "remitly");
    return `<div class="wallet-methods">${
      methods.map((method) => `
        <div class="wallet-method">
          <strong>${escapeHtml(method.name)}</strong>
          <div class="wallet-muted">Titular: ${escapeHtml(method.receiver || "Garcita Store")}</div>
          ${method.bank ? `<div class="wallet-muted">Banco: ${escapeHtml(method.bank)}</div>` : ""}
          <code>${escapeHtml(method.account)}</code>
        </div>
      `).join("")
    }</div>`;
  }

  function openTopupModal() {
    if (!state.customer) {
      openAccountModal("login");
      return;
    }
    const methods = state.paymentMethods.filter((method) => method.id !== "remitly");
    modal("Recargar saldo", `
      <div class="wallet-card">
        <h4>Metodos de pago</h4>
        ${methodsMarkup()}
      </div>
      <form data-form="topup" class="wallet-card">
        <div class="wallet-grid">
          <div class="wallet-field">
            <label>Metodo</label>
            <select name="method" required>
              ${methods.map((method) => `<option value="${escapeHtml(method.id)}">${escapeHtml(method.name)}</option>`).join("")}
            </select>
          </div>
          <div class="wallet-field">
            <label>Monto MX</label>
            <input name="amount" type="number" min="1" step="0.01" required>
          </div>
          <div class="wallet-field" style="grid-column:1/-1">
            <label>Comprobante de pago</label>
            <input name="proofFile" type="file" accept="image/*">
          </div>
          <div class="wallet-field" style="grid-column:1/-1">
            <label>Nota o referencia</label>
            <textarea name="proofNote" placeholder="Ejemplo: mande transferencia a nombre de..."></textarea>
          </div>
        </div>
        <div class="wallet-actions">
          <button class="wallet-btn" type="submit"><i class="fas fa-upload"></i> Enviar comprobante</button>
          <button class="wallet-btn ghost" type="button" data-action="remitly"><i class="fab fa-whatsapp"></i> Pagar con Remitly</button>
        </div>
      </form>
    `);
  }

  async function fileToDataUrl(file) {
    if (!file) return "";
    if (file.size > 5 * 1024 * 1024) throw new Error("El comprobante debe pesar menos de 5 MB.");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
  }

  function openRemitly() {
    const purchase = state.pendingPurchase || {};
    const optionText = purchase.label ? `${purchase.label}${purchase.priceText ? ` - ${purchase.priceText}` : ""}` : "todavia no seleccione opcion";
    const message = [
      "Hola GARCITA STORE, vengo de la pagina y quisiera pagar con Remitly.",
      purchase.productName ? `Producto: ${purchase.productName}` : "",
      purchase.productName ? `Opcion: ${optionText}` : "",
      "",
      "Me ayudas con el pago y los pasos?"
    ].filter(Boolean).join("\n");
    const popup = window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    if (!popup) window.location.href = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    showToast("Abriendo WhatsApp para Remitly...");
    if (purchase.productId) {
      postJson("/api/sales/lead", {
        sessionId,
        productId: purchase.productId,
        selectedOption: purchase.label,
        selectedPrice: purchase.priceText
      }).catch(() => {});
    }
  }

  async function payWithBalance() {
    const purchase = state.pendingPurchase;
    if (!purchase?.productId) return;
    try {
      const data = await postJson("/api/customer/purchase", {
        sessionId,
        productId: purchase.productId,
        selectedOption: purchase.label
      });
      state.customer.balance = data.balance;
      updateWalletChip();
      showPurchaseSuccess(data);
    } catch (error) {
      showToast(error.message);
    }
  }

  function showPurchaseSuccess(data) {
    const support = data.support || [];
    modal("Compra completada", `
      <div class="wallet-card">
        <span class="wallet-muted">Comprobante</span>
        <h3>${escapeHtml(data.order.receiptCode)}</h3>
        <p class="wallet-muted">PIN/KEY: <strong>${escapeHtml(data.order.pinCode)}</strong></p>
        <p class="wallet-muted">Tambien se envio el comprobante al correo registrado y al correo del admin.</p>
      </div>
      <div class="wallet-card">
        <h4>Elige soporte para instalar</h4>
        <p class="wallet-muted">Cualquiera de los dos te ayuda con la instalacion y tu key.</p>
        <div class="wallet-actions">
          ${support.map((item) => `<a class="wallet-btn" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i> ${escapeHtml(item.label)}</a>`).join("")}
        </div>
      </div>
    `);
  }

  async function handleModalSubmit(event) {
    const form = event.target.closest("form");
    if (!form) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (form.dataset.form === "register") {
        if (data.password !== data.confirm) throw new Error("Las contrasenas no coinciden.");
        const result = await postJson("/api/customer/register", {
          name: data.name,
          email: data.email,
          password: data.password
        });
        state.pendingEmail = data.email;
        state.emailNotice = emailDeliveryNotice(result, data.email);
        showToast(state.emailNotice);
        modal("Verificar correo", accountBody("verify"));
      }
      if (form.dataset.form === "verify") {
        const result = await postJson("/api/customer/verify-email", {
          email: data.email,
          code: data.code
        });
        state.customer = result.customer;
        state.emailNotice = "";
        updateWalletChip();
        showToast("Correo verificado. Tu saldo ya esta activo.");
        if (state.pendingPurchase) openPurchasePanel(document.querySelector(`[data-product-id="${state.pendingPurchase.productId}"]`));
        else openAccountModal();
      }
      if (form.dataset.form === "login") {
        const result = await postJson("/api/customer/login", {
          email: data.email,
          password: data.password
        });
        state.customer = result.customer;
        updateWalletChip();
        showToast("Sesion iniciada.");
        if (state.pendingPurchase) openPurchasePanel(document.querySelector(`[data-product-id="${state.pendingPurchase.productId}"]`));
        else openAccountModal();
      }
      if (form.dataset.form === "topup") {
        const fileInput = form.querySelector('input[name="proofFile"]');
        const proofImage = await fileToDataUrl(fileInput?.files?.[0]);
        const result = await postJson("/api/wallet/topups", {
          method: data.method,
          amount: data.amount,
          proofImage,
          proofNote: data.proofNote
        });
        await loadCustomer();
        showToast(result.message || "Comprobante enviado.");
        openAccountModal();
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  async function handleModalClick(event) {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "auth-tab") modal("Cuenta y saldo", accountBody(event.target.closest("[data-action]").dataset.mode));
    if (action === "open-topup") openTopupModal();
    if (action === "remitly") openRemitly();
    if (action === "pay-balance") payWithBalance();
    if (action === "logout-customer") {
      await postJson("/api/customer/logout", {}).catch(() => {});
      state.customer = null;
      updateWalletChip();
      showToast("Sesion cerrada.");
      openAccountModal("login");
    }
    if (action === "resend-code") {
      const email = $("#walletModalRoot input[name='email']")?.value || state.pendingEmail;
      const result = await postJson("/api/customer/resend-code", { email });
      state.pendingEmail = email;
      state.emailNotice = emailDeliveryNotice(result, email);
      showToast(state.emailNotice);
      modal("Verificar correo", accountBody("verify"));
    }
  }

  function handleModalChange() {}

  function openWhatsappGroup(source) {
    const popup = window.open(whatsappGroup, "_blank", "noopener,noreferrer");
    showToast("Abriendo grupo de WhatsApp...");
    if (!popup) window.location.href = whatsappGroup;
    postJson("/api/track/whatsapp-click", { sessionId, source }).catch(() => {});
  }

  $("#productsGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest(".comprar-ahora");
    if (!button) return;
    event.preventDefault();
    openPurchasePanel(button.closest(".product-card"));
  });

  document.querySelectorAll(".whatsapp-tracked").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openWhatsappGroup(link.dataset.source || "pagina-principal");
    });
  });

  fetch("/api/settings")
    .then((response) => (response.ok ? response.json() : null))
    .then((settings) => {
      if (settings?.whatsappGroup) whatsappGroup = settings.whatsappGroup;
      if (settings?.whatsappNumber) whatsappNumber = settings.whatsappNumber;
    })
    .catch(() => {});

  postJson("/api/track/pageview", { sessionId }).catch(() => {});
  setInterval(() => postJson("/api/track/heartbeat", { sessionId }).catch(() => {}), 15000);

  if (window.EventSource) {
    const events = new EventSource("/api/events");
    events.addEventListener("products-updated", loadProducts);
  }

  ensureWalletUi();
  Promise.all([loadPaymentMethods(), loadCustomer(), loadProducts()]).catch(() => {});
}());
