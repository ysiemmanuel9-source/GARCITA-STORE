(function () {
  const sessionId = localStorage.getItem("garcitaSessionId")
    || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  localStorage.setItem("garcitaSessionId", sessionId);

  let whatsappGroup = "https://chat.whatsapp.com/DaEn2118QELDryq0jOH4U3";
  let whatsappNumber = "5216863387186";

  const $ = (selector, root = document) => root.querySelector(selector);

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

  function showToast(message) {
    const toast = $("#toastMsg");
    if (!toast) return;
    $("#toastText").innerText = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "No se pudo completar la accion.");
    return data;
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
            <button class="btn-card comprar-ahora"><i class="fab fa-whatsapp"></i> Comprar</button>
          </div>
        </div>
      </div>`;
  }

  async function loadProducts() {
    try {
      const response = await fetch("/api/products");
      if (!response.ok) return;
      const products = await response.json();
      const grid = $("#productsGrid");
      if (!grid) return;
      grid.innerHTML = products.length
        ? products.map(productCard).join("")
        : '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);">No hay productos disponibles ahora mismo.</p>';
    } catch {
      console.info("La pagina esta abierta sin el servidor MySQL.");
    }
  }

  function selectedPurchase(card) {
    const selected = $(".purchase-option", card)?.selectedOptions?.[0];
    if (!selected) return { label: "", price: card.dataset.productPrice || "" };
    const price = selected.dataset.price || "";
    const labelFromText = selected.textContent.replace(price ? ` - ${price}` : "", "").trim();
    const label = selected.value && selected.value !== selected.textContent ? selected.value : labelFromText;
    return { label, price };
  }

  function buildWhatsappUrl(productName, optionLabel, optionPrice) {
    const optionText = optionLabel
      ? `${optionLabel}${optionPrice ? ` (${optionPrice})` : ""}`
      : "Sin opcion seleccionada";
    const message = [
      "Hola GARCITA STORE, vengo de la pagina y quiero comprar:",
      "",
      `Producto: ${productName}`,
      `Opcion: ${optionText}`,
      "",
      "Me ayudas con los pasos para pagar y recibirlo?"
    ].join("\n");
    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function openWhatsappGroup(source) {
    const popup = window.open(whatsappGroup, "_blank", "noopener,noreferrer");
    showToast("Abriendo grupo de WhatsApp...");
    if (!popup) window.location.href = whatsappGroup;
    postJson("/api/track/whatsapp-click", { sessionId, source }).catch(() => {});
  }

  function openWhatsappPurchase(card) {
    if (!card) return;
    const productId = Number(card.dataset.productId || 0) || null;
    const productName = card.dataset.productName || $(".product-title", card)?.textContent?.trim() || "Producto";
    const purchase = selectedPurchase(card);
    const whatsappUrl = buildWhatsappUrl(productName, purchase.label, purchase.price);
    const popup = window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    showToast("Abriendo WhatsApp con tu pedido...");
    if (!popup) window.location.href = whatsappUrl;

    const request = productId
      ? postJson("/api/sales/lead", {
        sessionId,
        productId,
        selectedOption: purchase.label,
        selectedPrice: purchase.price
      })
      : postJson("/api/track/whatsapp-click", { sessionId, source: "compra-producto" });

    request.then((data) => {
      if (data?.whatsappGroup) whatsappGroup = data.whatsappGroup;
    }).catch(() => {});
  }

  $("#productsGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest(".comprar-ahora");
    if (!button) return;
    event.preventDefault();
    openWhatsappPurchase(button.closest(".product-card"));
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
      if (settings?.whatsappGroup || settings?.discordInvite) whatsappGroup = settings.whatsappGroup || settings.discordInvite;
      if (settings?.whatsappNumber) whatsappNumber = settings.whatsappNumber;
    })
    .catch(() => {});

  postJson("/api/track/pageview", { sessionId }).catch(() => {});
  setInterval(() => postJson("/api/track/heartbeat", { sessionId }).catch(() => {}), 15000);

  if (window.EventSource) {
    const events = new EventSource("/api/events");
    events.addEventListener("products-updated", loadProducts);
  }

  loadProducts();
}());
