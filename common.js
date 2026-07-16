/* ======================================================================
   SESSÃO
====================================================================== */
const SESSION_KEY = "barber_session";

function saveSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}
function getSession() {
  const s = localStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
/** Redireciona pro login se não houver sessão ou o nível não bater. Retorna o usuário. */
function requireLevel(levels) {
  const u = getSession();
  if (!u || !levels.includes(u.LEVEL)) {
    window.location.href = "login.html";
    return null;
  }
  return u;
}
function logout() {
  clearSession();
  window.location.href = "login.html";
}

/* ======================================================================
   TOAST
====================================================================== */
function toast(message, type = "default") {
  let root = document.getElementById("toast-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "toast-root";
    document.body.appendChild(root);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(20px)";
    el.style.transition = ".2s";
    setTimeout(() => el.remove(), 200);
  }, 3600);
}

/* ======================================================================
   MODAL
====================================================================== */
function openModal(id) {
  document.getElementById(id)?.classList.add("open");
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove("open");
}
document.addEventListener("click", (e) => {
  if (e.target.classList?.contains("modal-overlay")) e.target.classList.remove("open");
});

/* ======================================================================
   TABS (nav lateral <-> painéis de conteúdo)
====================================================================== */
function initTabs() {
  document.querySelectorAll("[data-tab-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab-btn");
      document.querySelectorAll("[data-tab-btn]").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll("[data-tab-panel]").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.querySelector(`[data-tab-panel="${tab}"]`)?.classList.add("active");
      document.getElementById("sidebar")?.classList.remove("open");
      const cb = window.__onTabChange;
      if (cb) cb(tab);
    });
  });
}

/* ======================================================================
   SININHO DE NOTIFICAÇÕES
====================================================================== */
async function initNotifications(currentUser) {
  const bellBtn = document.getElementById("bell-btn");
  const panel = document.getElementById("notif-panel");
  const dot = document.getElementById("bell-dot");
  if (!bellBtn) return;

  async function load() {
    try {
      const rows = await db.select(
        "NOTIFICATIONS",
        `?select=*&USER=eq.${pgEsc(currentUser.USER)}&order=CREATED_AT.desc&limit=20`
      );
      panel.innerHTML = "";
      const head = document.createElement("div");
      head.className = "notif-header";
      head.textContent = "Notificações";
      panel.appendChild(head);

      const unread = (rows || []).filter((r) => !r.READ);
      dot.classList.toggle("show", unread.length > 0);

      if (!rows || rows.length === 0) {
        const empty = document.createElement("div");
        empty.className = "notif-empty";
        empty.textContent = "Nenhuma notificação por aqui.";
        panel.appendChild(empty);
        return;
      }

      rows.forEach((n) => {
        const item = document.createElement("div");
        item.className = "notif-item" + (n.READ ? "" : " unread");
        const dt = n.CREATED_AT ? new Date(n.CREATED_AT) : null;
        item.innerHTML = `${escapeHtml(n.MESSAGE || "")}<span class="notif-time">${dt ? dt.toLocaleString("pt-BR") : ""}</span>`;
        item.addEventListener("click", async () => {
          if (!n.READ) {
            try {
              await db.update("NOTIFICATIONS", `?ID=eq.${n.ID}`, { READ: true });
              n.READ = true;
              item.classList.remove("unread");
              load();
            } catch (e) { /* noop */ }
          }
        });
        panel.appendChild(item);
      });
    } catch (e) {
      console.error(e);
    }
  }

  bellBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== bellBtn) panel.classList.remove("open");
  });

  await load();
  setInterval(load, 30000);
}

async function notifyUser(username, system, message) {
  if (!username) return;
  try {
    await db.insert("NOTIFICATIONS", { SYSTEM: system, USER: username, MESSAGE: message, READ: false });
  } catch (e) {
    console.error("Falha ao notificar", username, e);
  }
}

/* ======================================================================
   HELPERS GERAIS
====================================================================== */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function pad2(n) { return String(n).padStart(2, "0"); }
function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}
const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function setupSidebarToggle() {
  const btn = document.getElementById("menu-toggle");
  const sidebar = document.getElementById("sidebar");
  btn?.addEventListener("click", () => sidebar.classList.toggle("open"));
}
