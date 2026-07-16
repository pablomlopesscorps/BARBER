const user = requireLevel(["000"]);
let SETTINGS = null;
const WEEKDAYS_UI = [["seg","Segunda"],["ter","Terça"],["qua","Quarta"],["qui","Quinta"],["sex","Sexta"],["sab","Sábado"],["dom","Domingo"]];

document.addEventListener("DOMContentLoaded", async () => {
  if (!user) return;
  initTabs();
  setupSidebarToggle();
  document.getElementById("btn-logout").addEventListener("click", logout);
  document.getElementById("avatar-name").textContent = user.NAME || user.USER;
  document.getElementById("avatar-initials").textContent = initials(user.NAME || user.USER);

  window.__onTabChange = onTabChange;

  await loadSettings();
  await initNotifications(user);
  renderHoursEditor("emp-hours-editor", {});

  document.getElementById("btn-new-emp").addEventListener("click", () => openEmpModal());
  document.getElementById("btn-save-emp").addEventListener("click", saveEmployee);
  document.getElementById("btn-new-service").addEventListener("click", () => openServiceModal());
  document.getElementById("btn-save-service").addEventListener("click", saveService);
  document.getElementById("btn-new-client").addEventListener("click", () => openClientModal());
  document.getElementById("btn-save-client").addEventListener("click", saveClient);
  document.getElementById("btn-new-product").addEventListener("click", () => openProductModal());
  document.getElementById("btn-save-product").addEventListener("click", saveProduct);
  document.getElementById("btn-new-plan").addEventListener("click", () => openPlanModal());
  document.getElementById("btn-save-plan").addEventListener("click", savePlan);
  document.getElementById("btn-add-block").addEventListener("click", addBlock);
  document.getElementById("btn-save-general").addEventListener("click", saveGeneral);
  document.getElementById("btn-save-hours").addEventListener("click", saveHours);
  document.getElementById("toggle-products").addEventListener("change", toggleProducts);
  document.getElementById("agenda-date-filter").addEventListener("change", renderAgendaGeral);
  document.querySelectorAll("[data-export]").forEach((btn) => btn.addEventListener("click", () => exportTable(btn.dataset.export)));

  renderDashboard();
});

function onTabChange(tab) {
  const titles = {
    dashboard: ["Dashboard", "Visão geral do negócio"],
    agenda: ["Agenda geral", "Todos os agendamentos da barbearia"],
    funcionarios: ["Funcionários", "Cadastre e gerencie sua equipe"],
    servicos: ["Serviços", "Tipos de serviço oferecidos"],
    bloqueios: ["Bloqueios de horário", "Bloqueie datas/horários gerais ou de um funcionário"],
    clientes: ["Clientes", "Cadastre e gerencie clientes"],
    produtos: ["Produtos", "Itens à venda na barbearia"],
    planos: ["Planos", "Planos de assinatura oferecidos"],
    config: ["Configurações do sistema", "Nome do sistema e horário geral"],
    exportar: ["Exportar dados", "Baixe seus dados em CSV"],
  };
  const t = titles[tab];
  if (t) document.getElementById("page-title").innerHTML = `${t[0]}<span id="page-sub">${t[1]}</span>`;
  if (tab === "dashboard") renderDashboard();
  if (tab === "agenda") renderAgendaGeral();
  if (tab === "funcionarios") renderEmployees();
  if (tab === "servicos") renderServices();
  if (tab === "bloqueios") { populateBlockEmployeeSelect(); renderBlocks(); }
  if (tab === "clientes") renderClients();
  if (tab === "produtos") renderProducts();
  if (tab === "planos") renderPlans();
  if (tab === "config") renderConfigTab();
}

/* ==================================================================== SETTINGS */
async function loadSettings() {
  const rows = await db.select("SETTINGS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&limit=1`);
  if (rows && rows[0]) {
    SETTINGS = rows[0];
  } else {
    SETTINGS = { SYSTEM: user.SYSTEM, SYSTEM_NAME: "BarberOS", SHOW_PRODUCTS: false, BUSINESS_HOURS: { interval: 30 } };
    await db.insert("SETTINGS", SETTINGS);
  }
  document.getElementById("sys-name").textContent = SETTINGS.SYSTEM_NAME || "BarberOS";
  document.title = `${SETTINGS.SYSTEM_NAME || "BarberOS"} · Dono`;
  document.getElementById("toggle-products").checked = !!SETTINGS.SHOW_PRODUCTS;
}

function renderConfigTab() {
  document.getElementById("cfg-sysname").value = SETTINGS.SYSTEM_NAME || "";
  document.getElementById("cfg-interval").value = (SETTINGS.BUSINESS_HOURS && SETTINGS.BUSINESS_HOURS.interval) || 30;
  document.getElementById("cfg-code").value = user.SYSTEM;
  renderHoursEditor("hours-editor", SETTINGS.BUSINESS_HOURS || {});
}
async function saveGeneral() {
  const name = document.getElementById("cfg-sysname").value.trim();
  const interval = Number(document.getElementById("cfg-interval").value || 30);
  try {
    const bh = { ...(SETTINGS.BUSINESS_HOURS || {}), interval };
    await db.update("SETTINGS", `?SYSTEM=eq.${pgEsc(user.SYSTEM)}`, { SYSTEM_NAME: name, BUSINESS_HOURS: bh });
    SETTINGS.SYSTEM_NAME = name; SETTINGS.BUSINESS_HOURS = bh;
    document.getElementById("sys-name").textContent = name;
    toast("Configurações salvas!", "success");
  } catch (e) { toast("Erro ao salvar.", "error"); }
}
async function saveHours() {
  try {
    const hours = collectHoursEditor("hours-editor");
    hours.interval = (SETTINGS.BUSINESS_HOURS && SETTINGS.BUSINESS_HOURS.interval) || 30;
    await db.update("SETTINGS", `?SYSTEM=eq.${pgEsc(user.SYSTEM)}`, { BUSINESS_HOURS: hours });
    SETTINGS.BUSINESS_HOURS = hours;
    toast("Horário de funcionamento salvo!", "success");
  } catch (e) { toast("Erro ao salvar horários.", "error"); }
}
async function toggleProducts() {
  const val = document.getElementById("toggle-products").checked;
  try {
    await db.update("SETTINGS", `?SYSTEM=eq.${pgEsc(user.SYSTEM)}`, { SHOW_PRODUCTS: val });
    SETTINGS.SHOW_PRODUCTS = val;
    toast(val ? "Produtos visíveis para clientes." : "Produtos ocultos para clientes.", "success");
  } catch (e) { toast("Erro ao atualizar.", "error"); }
}

/* ==================================================================== HORAS (reutilizável) */
function renderHoursEditor(containerId, hoursObj) {
  const container = document.getElementById(containerId);
  container.innerHTML = WEEKDAYS_UI.map(([k, label]) => {
    const h = hoursObj?.[k];
    const checked = h ? "checked" : "";
    return `<div class="field-row" style="align-items:center;margin-bottom:8px;">
      <div class="checkbox-row" style="flex:0 0 120px;padding:0;"><input type="checkbox" class="hd-enabled" data-day="${k}" ${checked}><label style="margin:0 0 0 6px;">${label}</label></div>
      <div class="field" style="margin:0;"><input type="time" class="hd-start" data-day="${k}" value="${h?.start || "09:00"}"></div>
      <div class="field" style="margin:0;"><input type="time" class="hd-end" data-day="${k}" value="${h?.end || "19:00"}"></div>
    </div>`;
  }).join("");
}
function collectHoursEditor(containerId) {
  const container = document.getElementById(containerId);
  const result = {};
  container.querySelectorAll(".hd-enabled").forEach((cb) => {
    const day = cb.dataset.day;
    if (cb.checked) {
      const start = container.querySelector(`.hd-start[data-day="${day}"]`).value;
      const end = container.querySelector(`.hd-end[data-day="${day}"]`).value;
      result[day] = { start, end };
    }
  });
  return result;
}

/* ==================================================================== DASHBOARD */
let chartService, chartEmployee;
async function renderDashboard() {
  const todayISO = toISODate(new Date());
  const monthPrefix = todayISO.slice(0, 7);

  const [appts, services, employees, clients] = await Promise.all([
    db.select("APPOINTMENTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&DATE=gte.${monthPrefix}-01`),
    db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}`),
    db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00`),
    db.select("CLIENT_USER", `?select=STATE&SYSTEM=eq.${pgEsc(user.SYSTEM)}`),
  ]);

  const concluded = (appts || []).filter((a) => a.STATUS === "concluido");
  const revenue = concluded.reduce((sum, a) => {
    const s = (services || []).find((sv) => sv.ID === a.SERVICE_ID);
    return sum + (s ? Number(s.PRICE) : 0);
  }, 0);
  document.getElementById("kpi-revenue").textContent = money(revenue);
  document.getElementById("kpi-revenue-sub").textContent = `${concluded.length} atendimentos concluídos no mês`;

  const todayCount = (appts || []).filter((a) => a.DATE === todayISO && a.STATUS !== "cancelado").length;
  document.getElementById("kpi-today").textContent = todayCount;

  const activeClients = (clients || []).filter((c) => c.STATE === "ativo").length;
  document.getElementById("kpi-clients").textContent = activeClients;
  document.getElementById("kpi-clients-sub").textContent = `${(clients || []).length} clientes no total`;

  const ticket = concluded.length ? revenue / concluded.length : 0;
  document.getElementById("kpi-ticket").textContent = money(ticket);

  // gráfico por serviço
  const byService = {};
  concluded.forEach((a) => {
    const s = (services || []).find((sv) => sv.ID === a.SERVICE_ID);
    const name = s ? s.NAME : "Outro";
    byService[name] = (byService[name] || 0) + (s ? Number(s.PRICE) : 0);
  });
  const svcLabels = Object.keys(byService);
  const svcData = Object.values(byService);

  // gráfico por funcionário
  const byEmp = {};
  (appts || []).filter((a) => a.STATUS !== "cancelado").forEach((a) => {
    const e = (employees || []).find((em) => em.USER === a.EMPLOYEE_USER);
    const name = e ? e.NAME : (a.EMPLOYEE_USER || "Sem funcionário");
    byEmp[name] = (byEmp[name] || 0) + 1;
  });
  const empLabels = Object.keys(byEmp);
  const empData = Object.values(byEmp);

  const chartOpts = {
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: "#A79E8F" }, grid: { color: "#332D24" } },
      y: { ticks: { color: "#A79E8F" }, grid: { color: "#332D24" }, beginAtZero: true },
    },
  };

  if (chartService) chartService.destroy();
  chartService = new Chart(document.getElementById("chart-service"), {
    type: "bar",
    data: { labels: svcLabels.length ? svcLabels : ["Sem dados"], datasets: [{ data: svcData.length ? svcData : [0], backgroundColor: "#C99B4A", borderRadius: 6 }] },
    options: chartOpts,
  });

  if (chartEmployee) chartEmployee.destroy();
  chartEmployee = new Chart(document.getElementById("chart-employee"), {
    type: "bar",
    data: { labels: empLabels.length ? empLabels : ["Sem dados"], datasets: [{ data: empData.length ? empData : [0], backgroundColor: "#5C8A70", borderRadius: 6 }] },
    options: chartOpts,
  });
}

/* ==================================================================== AGENDA GERAL */
async function renderAgendaGeral() {
  const tbody = document.getElementById("agenda-geral-tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Carregando...</td></tr>`;
  const dateFilter = document.getElementById("agenda-date-filter").value;

  let query = `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=DATE.desc,TIME.desc&limit=200`;
  if (dateFilter) query += `&DATE=eq.${dateFilter}`;

  const [rows, services, employees, clients] = await Promise.all([
    db.select("APPOINTMENTS", query),
    db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}`),
    db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00`),
    db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.0`),
  ]);

  if (!rows || rows.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Nenhum agendamento encontrado.</td></tr>`; return; }

  tbody.innerHTML = rows.map((a) => {
    const s = (services || []).find((sv) => sv.ID === a.SERVICE_ID);
    const e = (employees || []).find((em) => em.USER === a.EMPLOYEE_USER);
    const c = (clients || []).find((cl) => cl.USER === a.CLIENT_USER);
    const badge = { agendado: '<span class="badge badge-gold">Agendado</span>', concluido: '<span class="badge badge-green">Concluído</span>', cancelado: '<span class="badge badge-red">Cancelado</span>' }[a.STATUS] || "";
    const [y, m, d] = a.DATE.split("-");
    return `<tr>
      <td>${d}/${m}/${y}</td><td>${a.TIME}</td>
      <td><strong>${escapeHtml(c?.NAME || a.CLIENT_USER)}</strong></td>
      <td>${escapeHtml(e?.NAME || "Sem preferência")}</td>
      <td>${escapeHtml(s?.NAME || "-")}</td>
      <td>${badge}</td>
    </tr>`;
  }).join("");
}

/* ==================================================================== FUNCIONÁRIOS */
async function renderEmployees() {
  const tbody = document.getElementById("emp-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("BD_USERS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum funcionário cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((e) => `
    <tr>
      <td><strong>${escapeHtml(e.NAME)}</strong></td>
      <td>${escapeHtml(e.USER)}</td>
      <td>${escapeHtml(e.NUMBER || "-")}</td>
      <td>${e.ACTIVE === false ? '<span class="badge badge-red">Inativo</span>' : '<span class="badge badge-green">Ativo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-emp="${escapeHtml(e.USER)}">Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-emp]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const emp = rows.find((r) => r.USER === btn.dataset.editEmp);
      openEmpModal(emp);
    });
  });
}
function openEmpModal(emp) {
  document.getElementById("emp-modal-title").textContent = emp ? "Editar funcionário" : "Novo funcionário";
  document.getElementById("emp-user-original").value = emp?.USER || "";
  document.getElementById("emp-name").value = emp?.NAME || "";
  document.getElementById("emp-user").value = emp?.USER || "";
  document.getElementById("emp-pass").value = "";
  document.getElementById("emp-number").value = emp?.NUMBER || "";
  document.getElementById("emp-email").value = emp?.EMAIL || "";
  document.getElementById("emp-active").checked = emp ? emp.ACTIVE !== false : true;
  const perms = emp?.PERMISSIONS || {};
  document.getElementById("perm-servicos").checked = !!perms.servicos;
  document.getElementById("perm-clientes").checked = !!perms.clientes;
  document.getElementById("perm-bloqueios").checked = !!perms.bloqueios;
  document.getElementById("perm-produtos").checked = !!perms.produtos;
  renderHoursEditor("emp-hours-editor", emp?.WORK_HOURS || {});
  openModal("modal-emp");
}
async function saveEmployee() {
  const original = document.getElementById("emp-user-original").value;
  const username = document.getElementById("emp-user").value.trim();
  const pass = document.getElementById("emp-pass").value;
  const name = document.getElementById("emp-name").value.trim();
  if (!username || !name) { toast("Preencha nome e usuário.", "error"); return; }
  const permissions = {
    servicos: document.getElementById("perm-servicos").checked,
    clientes: document.getElementById("perm-clientes").checked,
    bloqueios: document.getElementById("perm-bloqueios").checked,
    produtos: document.getElementById("perm-produtos").checked,
  };
  const workHours = collectHoursEditor("emp-hours-editor");
  const payload = {
    NAME: name, USER: username,
    NUMBER: document.getElementById("emp-number").value.trim(),
    EMAIL: document.getElementById("emp-email").value.trim(),
    PERMISSIONS: permissions, WORK_HOURS: workHours,
    ACTIVE: document.getElementById("emp-active").checked,
  };
  try {
    if (!original) {
      const existing = await db.select("BD_USERS", `?select=USER&USER=eq.${pgEsc(username)}&limit=1`);
      if (existing && existing.length > 0) { toast("Esse usuário já existe.", "error"); return; }
      if (!pass) { toast("Defina uma senha para o novo funcionário.", "error"); return; }
      payload.PASSWORD = await hashPassword(pass);
      payload.SYSTEM = user.SYSTEM;
      payload.LEVEL = "00";
      await db.insert("BD_USERS", payload);
    } else {
      if (pass) payload.PASSWORD = await hashPassword(pass);
      await db.update("BD_USERS", `?USER=eq.${pgEsc(original)}`, payload);
    }
    toast("Funcionário salvo!", "success");
    closeModal("modal-emp");
    renderEmployees();
  } catch (e) { console.error(e); toast("Erro ao salvar funcionário.", "error"); }
}

/* ==================================================================== SERVIÇOS */
async function renderServices() {
  const tbody = document.getElementById("services-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum serviço cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((s) => `
    <tr>
      <td><strong>${escapeHtml(s.NAME)}</strong></td><td>${money(s.PRICE)}</td><td>${s.DURATION_MIN} min</td>
      <td>${s.ACTIVE ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-svc="${s.ID}">Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-svc]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const svc = rows.find((r) => String(r.ID) === btn.dataset.editSvc);
      openServiceModal(svc);
    });
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

/* ==================================================================== BLOQUEIOS */
async function populateBlockEmployeeSelect() {
  const rows = (await db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00&ACTIVE=eq.true&order=NAME.asc`)) || [];
  const sel = document.getElementById("blk-employee");
  sel.innerHTML = '<option value="">Toda a barbearia (geral)</option>' + rows.map((r) => `<option value="${r.USER}">${escapeHtml(r.NAME)}</option>`).join("");
}
async function renderBlocks() {
  const listEl = document.getElementById("blocks-list");
  listEl.innerHTML = `<p class="help-text">Carregando...</p>`;
  const rows = (await db.select("BLOCKED_SLOTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=DATE.asc`)) || [];
  if (rows.length === 0) { listEl.innerHTML = `<p class="help-text">Nenhum bloqueio ativo.</p>`; return; }
  const employees = (await db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00`)) || [];
  listEl.innerHTML = "";
  rows.forEach((b) => {
    const empName = b.EMPLOYEE_USER ? (employees.find((e) => e.USER === b.EMPLOYEE_USER)?.NAME || b.EMPLOYEE_USER) : "Geral (toda a barbearia)";
    const div = document.createElement("div");
    div.className = "appt-card";
    div.style.marginBottom = "8px";
    div.innerHTML = `
      <div class="appt-info">
        <div class="service">${new Date(b.DATE + "T00:00").toLocaleDateString("pt-BR")} · ${escapeHtml(empName)}</div>
        <div class="meta">${b.TIME_START} - ${b.TIME_END} ${b.REASON ? "· " + escapeHtml(b.REASON) : ""}</div>
      </div>
      <div class="appt-actions"><button class="btn btn-danger btn-sm" data-del-block="${b.ID}">Liberar</button></div>
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
  const employee = document.getElementById("blk-employee").value || null;
  const date = document.getElementById("blk-date").value;
  const start = document.getElementById("blk-start").value;
  const end = document.getElementById("blk-end").value;
  const reason = document.getElementById("blk-reason").value.trim();
  if (!date || !start || !end) { toast("Preencha data e horário.", "error"); return; }

  try {
    await db.insert("BLOCKED_SLOTS", { SYSTEM: user.SYSTEM, EMPLOYEE_USER: employee, DATE: date, TIME_START: start, TIME_END: end, REASON: reason || null });

    // cancela agendamentos afetados e notifica
    let query = `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&DATE=eq.${date}&STATUS=eq.agendado`;
    if (employee) query += `&EMPLOYEE_USER=eq.${pgEsc(employee)}`;
    const appts = (await db.select("APPOINTMENTS", query)) || [];
    const affected = appts.filter((a) => a.TIME >= start && a.TIME < end);

    for (const a of affected) {
      await db.update("APPOINTMENTS", `?ID=eq.${a.ID}`, { STATUS: "cancelado" });
      await notifyUser(a.CLIENT_USER, user.SYSTEM, `Seu agendamento de ${a.DATE.split("-").reverse().join("/")} às ${a.TIME} foi cancelado devido a um bloqueio de horário. Por favor, reagende.`);
      if (a.EMPLOYEE_USER) await notifyUser(a.EMPLOYEE_USER, user.SYSTEM, `Agendamento de ${a.DATE.split("-").reverse().join("/")} às ${a.TIME} foi cancelado por bloqueio.`);
    }

    toast(`Horário bloqueado.${affected.length ? ` ${affected.length} agendamento(s) cancelado(s) e cliente(s) notificado(s).` : ""}`, "success");
    document.getElementById("blk-date").value = "";
    document.getElementById("blk-start").value = "";
    document.getElementById("blk-end").value = "";
    document.getElementById("blk-reason").value = "";
    renderBlocks();
  } catch (e) { console.error(e); toast("Erro ao bloquear horário.", "error"); }
}

/* ==================================================================== CLIENTES */
async function renderClients() {
  const tbody = document.getElementById("clients-tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("CLIENT_USER", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Nenhum cliente cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((c) => `
    <tr>
      <td><strong>${escapeHtml(c.NAME)}</strong></td>
      <td>${escapeHtml(c.NUMBER || "-")}</td>
      <td>${escapeHtml(c.EMAIL || "-")}</td>
      <td>${escapeHtml(c.PLAN || "-")}</td>
      <td>${badgeForState(c.STATE)}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-cli="${escapeHtml(c.USER)}">Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-cli]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cli = rows.find((r) => r.USER === btn.dataset.editCli);
      openClientModal(cli);
    });
  });
}
function badgeForState(state) {
  if (state === "ativo") return '<span class="badge badge-green">Ativo</span>';
  if (state === "pendente") return '<span class="badge badge-gold">Pendente</span>';
  if (state === "inativo") return '<span class="badge badge-red">Inativo</span>';
  return '<span class="badge badge-muted">Sem plano</span>';
}
async function openClientModal(cli) {
  document.getElementById("client-modal-title").textContent = cli ? "Editar cliente" : "Novo cliente";
  document.getElementById("cli-user-original").value = cli?.USER || "";
  document.getElementById("cli-name").value = cli?.NAME || "";
  document.getElementById("cli-user").value = cli?.USER || "";
  document.getElementById("cli-pass").value = "";
  document.getElementById("cli-number").value = cli?.NUMBER || "";
  document.getElementById("cli-email").value = cli?.EMAIL || "";
  document.getElementById("cli-state").value = cli?.STATE || "sem_plano";
  let activeVal = true;
  if (cli) {
    const bd = await db.select("BD_USERS", `?select=ACTIVE&USER=eq.${pgEsc(cli.USER)}&limit=1`);
    activeVal = bd && bd[0] ? bd[0].ACTIVE !== false : true;
  }
  document.getElementById("cli-active").value = String(activeVal);
  openModal("modal-client");
}
async function saveClient() {
  const original = document.getElementById("cli-user-original").value;
  const username = document.getElementById("cli-user").value.trim();
  const pass = document.getElementById("cli-pass").value;
  const name = document.getElementById("cli-name").value.trim();
  if (!username || !name) { toast("Preencha nome e usuário.", "error"); return; }

  const bdPayload = {
    NAME: name, USER: username,
    NUMBER: document.getElementById("cli-number").value.trim(),
    EMAIL: document.getElementById("cli-email").value.trim(),
    ACTIVE: document.getElementById("cli-active").value === "true",
  };
  const clientPayload = {
    NAME: name, USER: username,
    NUMBER: bdPayload.NUMBER, EMAIL: bdPayload.EMAIL,
    STATE: document.getElementById("cli-state").value,
  };

  try {
    if (!original) {
      const existing = await db.select("BD_USERS", `?select=USER&USER=eq.${pgEsc(username)}&limit=1`);
      if (existing && existing.length > 0) { toast("Esse usuário já existe.", "error"); return; }
      if (!pass) { toast("Defina uma senha para o novo cliente.", "error"); return; }
      bdPayload.PASSWORD = await hashPassword(pass);
      bdPayload.SYSTEM = user.SYSTEM; bdPayload.LEVEL = "0";
      clientPayload.SYSTEM = user.SYSTEM; clientPayload.VALUE = 0;
      await db.insert("BD_USERS", bdPayload);
      await db.insert("CLIENT_USER", clientPayload);
    } else {
      if (pass) bdPayload.PASSWORD = await hashPassword(pass);
      await db.update("BD_USERS", `?USER=eq.${pgEsc(original)}`, bdPayload);
      await db.update("CLIENT_USER", `?USER=eq.${pgEsc(original)}`, clientPayload);
    }
    toast("Cliente salvo!", "success");
    closeModal("modal-client");
    renderClients();
  } catch (e) { console.error(e); toast("Erro ao salvar cliente.", "error"); }
}

/* ==================================================================== PRODUTOS */
async function renderProducts() {
  const tbody = document.getElementById("products-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("PRODUCTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=NAME.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum produto cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.NAME)}</strong></td><td>${money(p.PRICE)}</td><td>${p.STOCK}</td>
      <td>${p.ACTIVE ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-prd="${p.ID}">Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-prd]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = rows.find((r) => String(r.ID) === btn.dataset.editPrd);
      openProductModal(p);
    });
  });
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

/* ==================================================================== PLANOS */
async function renderPlans() {
  const tbody = document.getElementById("plans-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Carregando...</td></tr>`;
  const rows = (await db.select("PLANS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&order=PRICE.asc`)) || [];
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Nenhum plano cadastrado.</td></tr>`; return; }
  tbody.innerHTML = rows.map((p) => `
    <tr>
      <td><strong>${escapeHtml(p.NAME)}</strong></td><td>${money(p.PRICE)}</td><td>${escapeHtml(p.DESCRIPTION || "-")}</td>
      <td>${p.ACTIVE ? '<span class="badge badge-green">Ativo</span>' : '<span class="badge badge-muted">Inativo</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" data-edit-pln="${p.ID}">Editar</button></td>
    </tr>`).join("");
  tbody.querySelectorAll("[data-edit-pln]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = rows.find((r) => String(r.ID) === btn.dataset.editPln);
      openPlanModal(p);
    });
  });
}
function openPlanModal(p) {
  document.getElementById("plan-modal-title").textContent = p ? "Editar plano" : "Novo plano";
  document.getElementById("pln-id").value = p?.ID || "";
  document.getElementById("pln-name").value = p?.NAME || "";
  document.getElementById("pln-price").value = p?.PRICE || "";
  document.getElementById("pln-desc").value = p?.DESCRIPTION || "";
  document.getElementById("pln-active").checked = p ? !!p.ACTIVE : true;
  openModal("modal-plan");
}
async function savePlan() {
  const id = document.getElementById("pln-id").value;
  const payload = {
    NAME: document.getElementById("pln-name").value.trim(),
    PRICE: Number(document.getElementById("pln-price").value || 0),
    DESCRIPTION: document.getElementById("pln-desc").value.trim(),
    ACTIVE: document.getElementById("pln-active").checked,
  };
  try {
    if (id) await db.update("PLANS", `?ID=eq.${id}`, payload);
    else await db.insert("PLANS", { ...payload, SYSTEM: user.SYSTEM });
    toast("Plano salvo!", "success");
    closeModal("modal-plan");
    renderPlans();
  } catch (e) { toast("Erro ao salvar plano.", "error"); }
}

/* ==================================================================== EXPORTAR CSV */
async function exportTable(table) {
  try {
    const rows = (await db.select(table, `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}`)) || [];
    if (rows.length === 0) { toast("Nenhum dado para exportar.", "error"); return; }
    const cleaned = rows.map((r) => {
      const { PASSWORD, CARD, CODE, ...rest } = r; // nunca exporta senha/dados sensíveis de cartão
      return rest;
    });
    const csv = jsonToCsv(cleaned);
    downloadCsv(`${table}_${toISODate(new Date())}.csv`, csv);
    toast("Exportação concluída!", "success");
  } catch (e) { console.error(e); toast("Erro ao exportar.", "error"); }
}
function jsonToCsv(rows) {
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];
  rows.forEach((r) => {
    lines.push(headers.map((h) => {
      let val = r[h];
      if (val === null || val === undefined) val = "";
      if (typeof val === "object") val = JSON.stringify(val);
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(";"));
  });
  return lines.join("\n");
}
function downloadCsv(filename, csv) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
