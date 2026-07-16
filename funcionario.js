const user = requireLevel(["00"]);
let SETTINGS = null;
let SERVICES_CACHE = [];
let agendaFilter = "futuros";

document.addEventListener("DOMContentLoaded", async () => {
  if (!user) return;
  initTabs();
  setupSidebarToggle();
  document.getElementById("btn-logout").addEventListener("click", logout);

  document.getElementById("avatar-name").textContent = user.NAME || user.USER;
  document.getElementById("avatar-initials").textContent = initials(user.NAME || user.USER);

  const perms = user.PERMISSIONS || {};
  document.getElementById("nav-servicos").classList.toggle("hidden", !perms.servicos);
  document.getElementById("nav-clientes").classList.toggle("hidden", !perms.clientes);
  document.getElementById("nav-bloqueios").classList.toggle("hidden", !perms.bloqueios);
  document.getElementById("nav-produtos").classList.toggle("hidden", !perms.produtos);

  await loadSettings();
  await initNotifications(user);

  window.__onTabChange = onTabChange;

  document.getElementById("agenda-filter").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#agenda-filter .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    agendaFilter = chip.dataset.f;
    renderAgenda();
  });

  document.getElementById("btn-new-service").addEventListener("click", () => openServiceModal());
  document.getElementById("btn-save-service").addEventListener("click", saveService);
  document.getElementById("btn-new-product").addEventListener("click", () => openProductModal());
  document.getElementById("btn-save-product").addEventListener("click", saveProduct);
  document.getElementById("btn-add-block").addEventListener("click", addBlock);
  document.getElementById("btn-change-pass").addEventListener("click", changePassword);

  renderAgenda();
});

function onTabChange(tab) {
  const titles = {
    agenda: ["Minha agenda", "Seus próximos atendimentos"],
    servicos: ["Serviços", "Tipos de serviço oferecidos pela barbearia"],
    clientes: ["Clientes", "Base de clientes da barbearia"],
    bloqueios: ["Bloqueios", "Bloqueie datas/horários da sua própria agenda"],
    produtos: ["Produtos", "Produtos vendidos pela barbearia"],
    config: ["Configurações", "Altere sua senha de acesso"],
  };
  const t = titles[tab];
  if (t) document.getElementById("page-title").innerHTML = `${t[0]}<span id="page-sub">${t[1]}</span>`;
  if (tab === "servicos") renderServices();
  if (tab === "clientes") renderClients();
  if (tab === "bloqueios") renderBlocks();
  if (tab === "produtos") renderProducts();
}

async function loadSettings() {
  const rows = await db.select("SETTINGS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&limit=1`);
  SETTINGS = (rows && rows[0]) || { SYSTEM_NAME: "BarberOS" };
  document.getElementById("sys-name").textContent = SETTINGS.SYSTEM_NAME || "BarberOS";
  document.title = `${SETTINGS.SYSTEM_NAME || "BarberOS"} · Funcionário`;
}

/* ==================================================================== AGENDA */
async function renderAgenda() {
  const listEl = document.getElementById("agenda-list");
  listEl.innerHTML = `<div class="empty-state"><p>Carregando...</p></div>`;

  SERVICES_CACHE = (await db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}`)) || [];
  let query = `?select=*&EMPLOYEE_USER=eq.${pgEsc(user.USER)}&order=DATE.asc,TIME.asc`;
  const todayISO = toISODate(new Date());
  if (agendaFilter === "hoje") query += `&DATE=eq.${todayISO}`;
  if (agendaFilter === "futuros") query += `&DATE=gte.${todayISO}&STATUS=eq.agendado`;

  const rows = (await db.select("APPOINTMENTS", query)) || [];

  if (rows.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>Nenhum agendamento encontrado.</p></div>`;
    return;
  }

  const clientUsers = [...new Set(rows.map((r) => r.CLIENT_USER))];
  const clients = clientUsers.length
    ? (await db.select("BD_USERS", `?select=USER,NAME,NUMBER&USER=in.(${clientUsers.map(pgEsc).join(",")})`)) || []
    : [];

  listEl.innerHTML = "";
  rows.forEach((a) => {
    const service = SERVICES_CACHE.find((s) => s.ID === a.SERVICE_ID);
    const client = clients.find((c) => c.USER === a.CLIENT_USER);
    const [y, m, d] = a.DATE.split("-");
    const badge = { agendado: '<span class="badge badge-gold">Agendado</span>', concluido: '<span class="badge badge-green">Concluído</span>', cancelado: '<span class="badge badge-red">Cancelado</span>' }[a.STATUS] || "";

    const card = document.createElement("div");
    card.className = "appt-card";
    card.innerHTML = `
      <div class="appt-date"><div class="d">${d}</div><div class="m">${MONTH_NAMES[Number(m) - 1].slice(0,3)}</div></div>
      <div class="appt-info">
        <div class="service">${escapeHtml(client?.NAME || a.CLIENT_USER)} ${badge}</div>
        <div class="meta">${escapeHtml(service?.NAME || "Serviço")} · ${a.TIME} ${client?.NUMBER ? "· " + escapeHtml(client.NUMBER) : ""}</div>
      </div>
      <div class="appt-actions">${a.STATUS === "agendado" ? `<button class="btn btn-outline btn-sm" data-done="${a.ID}">Concluir</button>` : ""}</div>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll("[data-done]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await db.update("APPOINTMENTS", `?ID=eq.${btn.dataset.done}`, { STATUS: "concluido" });
        toast("Atendimento marcado como concluído.", "success");
        renderAgenda();
      } catch (e) { toast("Erro ao atualizar.", "error"); }
    });
  });
}

/* ==================================================================== SERVIÇOS (perm) */
async function renderServices() {
  const tbody = document.getElementById("services-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum serviço cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((s) => `
    <tr>
      <td><strong>${escapeHtml(s.NAME)}</strong></td>
      <td>${money(s.PRICE)}</td>
      <td>${s.DURATION_MIN} min</td>
      <td>${s.ACTIVE ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-service='${JSON.stringify(s).replace(/'/g, "&#39;")}'>Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-service]").forEach((btn) => {
    btn.addEventListener("click", () => openServiceModal(JSON.parse(btn.dataset.editService.replace(/&#39;/g, "'"))));
  });
}
function openServiceModal(svc) {
  document.getElementById("service-modal-title").textContent = svc ? "Editar serviço" : "Novo serviço";
  document.getElementById("svc-id").value = svc?.ID || "";
  document.getElementById("svc-name").value = svc?.NAME || "";
  document.getElementById("svc-price").value = svc?.PRICE || "";
  document.getElementById("svc-duration").value = svc?.DURATION_MIN || "";
  document.getElementById("svc-active").checked = svc ? !!svc.ACTIVE : true;
  openModal("modal-service");
}
async function saveService() {
  const id = document.getElementById("svc-id").value;
  const payload = {
    NAME: document.getElementById("svc-name").value.trim(),
    PRICE: Number(document.getElementById("svc-price").value || 0),
    DURATION_MIN: Number(document.getElementById("svc-duration").value || 0),
    ACTIVE: document.getElementById("svc-active").checked,
  };
  try {
    if (id) await db.update("SERVICES", `?ID=eq.${id}`, payload);
    else await db.insert("SERVICES", { ...payload, SYSTEM: user.SYSTEM });
    toast("Serviço salvo!", "success");
    closeModal("modal-service");
    renderServices();
  } catch (e) { toast("Erro ao salvar serviço.", "error"); }
}

/* ==================================================================== CLIENTES (perm) */
async function renderClients() {
  const tbody = document.getElementById("clients-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("CLIENT_USER", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum cliente cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.NAME)}</strong></td>
      <td>${escapeHtml(c.NUMBER || "-")}</td>
      <td>${escapeHtml(c.EMAIL || "-")}</td>
      <td>${escapeHtml(c.PLAN || "-")}</td>
      <td>${badgeForState(c.STATE)}</td>
    </tr>`).join("");
}
function badgeForState(state) {
  if (state === "ativo") return '<span class="badge badge-green">Ativo</span>';
  if (state === "pendente") return '<span class="badge badge-gold">Pendente</span>';
  if (state === "inativo") return '<span class="badge badge-red">Inativo</span>';
  return '<span class="badge badge-muted">Sem plano</span>';
}

/* ==================================================================== BLOQUEIOS (perm - próprios) */
async function renderBlocks() {
  const listEl = document.getElementById("blocks-list");
  listEl.innerHTML = `<p class="help-text">Carregando...</p>`;
  const rows = (await db.select("BLOCKED_SLOTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&EMPLOYEE_USER=eq.${pgEsc(user.USER)}&order=DATE.asc`)) || [];
  if (rows.length === 0) { listEl.innerHTML = `<p class="help-text">Nenhum bloqueio ativo.</p>`; return; }
  listEl.innerHTML = "";
  rows.forEach((b) => {
    const div = document.createElement("div");
    div.className = "appt-card";
    div.style.marginBottom = "8px";
    div.innerHTML = `
      <div class="appt-info">
        <div class="service">${new Date(b.DATE + "T00:00").toLocaleDateString("pt-BR")}</div>
        <div class="meta">${b.TIME_START} - ${b.TIME_END} ${b.REASON ? "· " + escapeHtml(b.REASON) : ""}</div>
      </div>
      <div class="appt-actions"><button class="btn btn-danger btn-sm" data-del-block="${b.ID}">Remover</button></div>
    `;
    listEl.appendChild(div);
  });
  listEl.querySelectorAll("[data-del-block]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await db.remove("BLOCKED_SLOTS", `?ID=eq.${btn.dataset.delBlock}`);
      toast("Bloqueio removido.", "success");
      renderBlocks();
    });
  });
}
async function addBlock() {
  const date = document.getElementById("blk-date").value;
  const start = document.getElementById("blk-start").value;
  const end = document.getElementById("blk-end").value;
  const reason = document.getElementById("blk-reason").value.trim();
  if (!date || !start || !end) { toast("Preencha data e horário.", "error"); return; }
  try {
    await db.insert("BLOCKED_SLOTS", { SYSTEM: user.SYSTEM, EMPLOYEE_USER: user.USER, DATE: date, TIME_START: start, TIME_END: end, REASON: reason || null });
    toast("Horário bloqueado.", "success");
    document.getElementById("blk-date").value = "";
    document.getElementById("blk-start").value = "";
    document.getElementById("blk-end").value = "";
    document.getElementById("blk-reason").value = "";
    renderBlocks();
  } catch (e) { toast("Erro ao bloquear.", "error"); }
}

/* ==================================================================== PRODUTOS (perm) */
async function renderProducts() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("PRODUCTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="table-empty">Nenhum produto cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.NAME)}</strong></td>
      <td>${money(p.PRICE)}</td>
      <td>${p.STOCK}</td>
      <td>${p.ACTIVE ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
    </tr>`).join("");
}
function openProductModal(p) {
  document.getElementById("product-modal-title").textContent = p ? "Editar produto" : "Novo produto";
  document.getElementById("prd-id").value = p?.ID || "";
  document.getElementById("prd-name").value = p?.NAME || "";
  document.getElementById("prd-price").value = p?.PRICE || "";
  document.getElementById("prd-stock").value = p?.STOCK || 0;
  document.getElementById("prd-active").checked = p ? !!p.ACTIVE : true;
  openModal("modal-product");
}
async function saveProduct() {
  const id = document.getElementById("prd-id").value;
  const payload = {
    NAME: document.getElementById("prd-name").value.trim(),
    PRICE: Number(document.getElementById("prd-price").value || 0),
    STOCK: Number(document.getElementById("prd-stock").value || 0),
    ACTIVE: document.getElementById("prd-active").checked,
  };
  try {
    if (id) await db.update("PRODUCTS", `?ID=eq.${id}`, payload);
    else await db.insert("PRODUCTS", { ...payload, SYSTEM: user.SYSTEM });
    toast("Produto salvo!", "success");
    closeModal("modal-product");
    renderProducts();
  } catch (e) { toast("Erro ao salvar produto.", "error"); }
}

/* ==================================================================== SENHA */
async function changePassword() {
  const pass = document.getElementById("new-pass").value;
  if (!pass || pass.length < 4) { toast("Digite uma senha com pelo menos 4 caracteres.", "error"); return; }
  try {
    const hash = await hashPassword(pass);
    await db.update("BD_USERS", `?USER=eq.${pgEsc(user.USER)}`, { PASSWORD: hash });
    document.getElementById("new-pass").value = "";
    toast("Senha alterada!", "success");
  } catch (e) { toast("Erro ao alterar senha.", "error"); }
}
