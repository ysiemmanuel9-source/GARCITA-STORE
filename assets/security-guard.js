(function () {
  const warningText = "Contenido protegido por GARCITA STORE.";
  const blockedKeys = new Set(["i", "j", "c"]);
  const blockedCtrlKeys = new Set(["u", "s", "p"]);
  let toastTimer = null;

  function ensureToast() {
    let toast = document.getElementById("securityGuardToast");
    if (toast) return toast;

    toast = document.createElement("div");
    toast.id = "securityGuardToast";
    toast.setAttribute("role", "status");
    toast.style.cssText = [
      "position:fixed",
      "right:18px",
      "bottom:18px",
      "z-index:999999",
      "max-width:min(340px,calc(100vw - 36px))",
      "padding:14px 16px",
      "border:1px solid rgba(255,37,56,.58)",
      "border-radius:14px",
      "background:rgba(10,3,6,.94)",
      "box-shadow:0 18px 55px rgba(0,0,0,.42)",
      "color:#fff",
      "font:700 14px/1.35 Arial,sans-serif",
      "opacity:0",
      "transform:translateY(8px)",
      "pointer-events:none",
      "transition:opacity .18s ease,transform .18s ease"
    ].join(";");
    document.body.appendChild(toast);
    return toast;
  }

  function showWarning(message) {
    const toast = ensureToast();
    toast.textContent = message || warningText;
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
    }, 2400);
  }

  function protectEvent(event, message) {
    const target = event.target;
    const tagName = String(target?.tagName || "").toLowerCase();
    const isEditable = target?.isContentEditable || ["input", "textarea", "select"].includes(tagName);
    if (isEditable && event.type !== "contextmenu") return;
    event.preventDefault();
    event.stopPropagation();
    showWarning(message);
  }

  document.documentElement.style.webkitUserSelect = "none";
  document.documentElement.style.userSelect = "none";
  const editableStyle = document.createElement("style");
  editableStyle.textContent = "input,textarea,select,[contenteditable='true']{-webkit-user-select:text!important;user-select:text!important;}";
  document.head.appendChild(editableStyle);

  document.addEventListener("contextmenu", (event) => {
    protectEvent(event, "Accion bloqueada por seguridad de GARCITA STORE.");
  }, true);

  document.addEventListener("copy", (event) => protectEvent(event), true);
  document.addEventListener("cut", (event) => protectEvent(event), true);
  document.addEventListener("dragstart", (event) => protectEvent(event), true);

  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const blocksDevtools = event.key === "F12" || (event.ctrlKey && event.shiftKey && blockedKeys.has(key));
    const blocksSourceOrSave = event.ctrlKey && blockedCtrlKeys.has(key);
    if (!blocksDevtools && !blocksSourceOrSave) return;
    protectEvent(event, "Panel protegido. No esta permitido inspeccionar ni copiar la pagina.");
  }, true);
})();
