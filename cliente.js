const user = requireLevel(["0"]);

let SETTINGS = null;
let SERVICES = [];
let EMPLOYEES = [];
let CLIENT_ROW = null;

let calMonth, calYear;
let selectedDate = null;
let selectedTime = null;
let selectedPeriod = "all";
let slotEmployeeMap = {}; // time -> [employee usernames livres]
let selectedPayMethod = "pix";

document.addEventListener("DOMContentLoaded", async () => {
  if (!user) return;
  initTabs();
  setupSidebarToggle();
  document.getElementById("btn-logout").addEventListener("click", logout);

  document.getElementById("avatar-name").textContent = user.NAME || user.USER;
  document.getElementById("avatar-initials").textContent = initials(user.NAME || user.USER);

  const now = new Date();
  calMonth = now.getMonth();
  calYear = now.getFullYear();

  window.__onTabChange = onTabChange;

  await loadSettings();
  await loadServices();
  await loadEmployees();
  await loadClientRow();
  await initNotifications(user);

  renderCalendar();
  renderAppointments();
  renderConfigForm();

  document.getElementById("period-chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.querySelectorAll("#period-chips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    selectedPeriod = chip.dataset.period;
    if (selectedDate) renderSlots();
  });

  document.getElementById("select-employee").addEventListener("change", () => {
    if (selectedDate) renderSlots();
  });

  document.getElementById("btn-confirm-appt").addEventListener("click", confirmAppointment);

  document.getElementById("btn-save-personal").addEventListener("click", savePersonalData);
  document.getElementById("btn-save-pay").addEventListener("click", savePaymentData);

  document.getElementById("cfg-pay-methods").addEventListener("click", (e) => {
    const el = e.target.closest(".pay-method");
    if (!el) return;
    document.querySelectorAll("#cfg-pay-methods .pay-method").forEach((p) => p.classList.remove("active"));
    el.classList.add("active");
    selectedPayMethod = el.dataset.pay;
    document.getElementById("cfg-card-fields").classList.toggle("hidden", selectedPayMethod === "pix" || selectedPayMethod === "dinheiro");
  });
});

function onTabChange(tab) {
  const titles = {
    agendamentos: ["Meus agendamentos", "Acompanhe seus horários marcados"],
    agendar: ["Agendar horário", "Escolha data, período, serviço e barbeiro"],
    plano: ["Plano", "Escolha um plano e mantenha sua conta ativa"],
    produtos: ["Produtos", "Itens disponíveis para compra na barbearia"],
    config: ["Configurações", "Seus dados pessoais e forma de pagamento"],
  };
  const t = titles[tab];
  if (t) document.getElementById("page-title").innerHTML = `${t[0]}<span id="page-sub">${t[1]}</span>`;
  if (tab === "plano") renderPlans();
  if (tab === "produtos") renderProducts();
}

/* ==================================================================== */
async function loadSettings() {
  const rows = await db.select("SETTINGS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&limit=1`);
  SETTINGS = (rows && rows[0]) || { SYSTEM_NAME: "BarberOS", SHOW_PRODUCTS: false, BUSINESS_HOURS: {} };
  document.getElementById("sys-name").textContent = SETTINGS.SYSTEM_NAME || "BarberOS";
  document.title = `${SETTINGS.SYSTEM_NAME || "BarberOS"} · Cliente`;
  document.getElementById("nav-produtos").classList.toggle("hidden", !SETTINGS.SHOW_PRODUCTS);
}

async function loadServices() {
  SERVICES = (await db.select("SERVICES", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&ACTIVE=eq.true&order=NAME.asc`)) || [];
  const sel = document.getElementById("select-service");
  sel.innerHTML = '<option value="">Selecione...</option>' + SERVICES.map((s) =>
    `<option value="${s.ID}">${escapeHtml(s.NAME)} — ${money(s.PRICE)}</option>`).join("");
}

async function loadEmployees() {
  EMPLOYEES = (await db.select("BD_USERS", `?select=USER,NAME&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.00&ACTIVE=eq.true&order=NAME.asc`)) || [];
  const sel = document.getElementById("select-employee");
  sel.innerHTML = '<option value="none">Sem preferência</option>' + EMPLOYEES.map((e) =>
    `<option value="${e.USER}">${escapeHtml(e.NAME)}</option>`).join("");
}

async function loadClientRow() {
  const rows = await db.select("CLIENT_USER", `?select=*&USER=eq.${pgEsc(user.USER)}&limit=1`);
  CLIENT_ROW = (rows && rows[0]) || null;
}

/* ==================================================================== CALENDÁRIO */
function renderCalendar() {
  const el = document.getElementById("calendar");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const first = new Date(calYear, calMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const isCurrentMonth = calYear === today.getFullYear() && calMonth === today.getMonth();

  let html = `<div class="cal-head">
    <div class="month-label">${MONTH_NAMES[calMonth]} ${calYear}</div>
    <div class="cal-nav">
      <button id="cal-prev" ${isCurrentMonth ? "disabled" : ""}>‹</button>
      <button id="cal-next">›</button>
    </div>
  </div><div class="cal-grid">`;
  ["D","S","T","Q","Q","S","S"].forEach((d) => html += `<div class="cal-dow">${d}</div>`);
  for (let i = 0; i < startWeekday; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(calYear, calMonth, d);
    const past = date < today;
    const isToday = date.getTime() === today.getTime();
    const isSelected = selectedDate && toISODate(selectedDate) === toISODate(date);
    let cls = "cal-day " + (past ? "disabled" : "enabled");
    if (isToday) cls += " today";
    if (isSelected) cls += " selected";
    html += `<div class="${cls}" data-day="${d}" ${past ? "" : `onclick="pickDate(${d})"`}>${d}</div>`;
  }
  html += `</div>`;
  el.innerHTML = html;

  document.getElementById("cal-prev").addEventListener("click", () => { changeMonth(-1); });
  document.getElementById("cal-next").addEventListener("click", () => { changeMonth(1); });
}
function changeMonth(delta) {
  calMonth += delta;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}
function pickDate(day) {
  selectedDate = new Date(calYear, calMonth, day);
  selectedTime = null;
  renderCalendar();
  renderSlots();
}

/* ==================================================================== HORÁRIOS */
async function renderSlots() {
  const grid = document.getElementById("slots-grid");
  grid.innerHTML = `<div class="slot-empty">Carregando horários...</div>`;
  document.getElementById("btn-confirm-appt").disabled = true;

  const isoDate = toISODate(selectedDate);
  const weekday = WEEKDAY_KEYS[selectedDate.getDay()];
  const empSel = document.getElementById("select-employee").value;
  const interval = (SETTINGS.BUSINESS_HOURS && SETTINGS.BUSINESS_HOURS.interval) || 30;

  const candidateEmployees = empSel === "none" ? EMPLOYEES : EMPLOYEES.filter((e) => e.USER === empSel);
  if (candidateEmployees.length === 0) {
    grid.innerHTML = `<div class="slot-empty">Nenhum barbeiro disponível.</div>`;
    return;
  }

  // Horário de funcionamento geral (fallback)
  const generalHours = (SETTINGS.BUSINESS_HOURS && SETTINGS.BUSINESS_HOURS[weekday]) || null;

  // Busca bloqueios do dia (gerais + por funcionário)
  const blocks = (await db.select("BLOCKED_SLOTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&DATE=eq.${isoDate}`)) || [];
  // Busca agendamentos já marcados no dia
  const appts = (await db.select("APPOINTMENTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&DATE=eq.${isoDate}&STATUS=eq.agendado`)) || [];

  const rawSlots = {}; // time -> Set(employeeUser livre)

  for (const emp of candidateEmployees) {
    const hours = (emp.WORK_HOURS && emp.WORK_HOURS[weekday]) || generalHours;
    if (!hours || !hours.start || !hours.end) continue;

    let [sh, sm] = hours.start.split(":").map(Number);
    let [eh, em] = hours.end.split(":").map(Number);
    let cursor = sh * 60 + sm;
    const end = eh * 60 + em;

    while (cursor < end) {
      const hh = Math.floor(cursor / 60), mm = cursor % 60;
      const timeStr = `${pad2(hh)}:${pad2(mm)}`;

      const blockedGeneral = blocks.some((b) => !b.EMPLOYEE_USER && timeInRange(timeStr, b.TIME_START, b.TIME_END));
      const blockedEmp = blocks.some((b) => b.EMPLOYEE_USER === emp.USER && timeInRange(timeStr, b.TIME_START, b.TIME_END));
      const booked = appts.some((a) => a.EMPLOYEE_USER === emp.USER && a.TIME === timeStr);

      if (!blockedGeneral && !blockedEmp && !booked) {
        if (!rawSlots[timeStr]) rawSlots[timeStr] = new Set();
        rawSlots[timeStr].add(emp.USER);
      }
      cursor += interval;
    }
  }

  // remove horários passados se for hoje
  const now = new Date();
  const isToday = toISODate(now) === isoDate;

  let times = Object.keys(rawSlots).sort();
  if (isToday) {
    times = times.filter((t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m > now.getHours() * 60 + now.getMinutes();
    });
  }
  if (selectedPeriod !== "all") {
    times = times.filter((t) => periodOf(t) === selectedPeriod);
  }

  slotEmployeeMap = {};
  times.forEach((t) => (slotEmployeeMap[t] = Array.from(rawSlots[t])));

  if (times.length === 0) {
    grid.innerHTML = `<div class="slot-empty">Nenhum horário disponível para esse dia/período.</div>`;
    return;
  }

  grid.innerHTML = times.map((t) => `<div class="slot-btn" data-time="${t}" onclick="pickTime('${t}')">${t}</div>`).join("");
}

function periodOf(timeStr) {
  const [h] = timeStr.split(":").map(Number);
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}
function timeInRange(t, start, end) {
  if (!start || !end) return false;
  return t >= start && t < end;
}
function pickTime(t) {
  selectedTime = t;
  document.querySelectorAll(".slot-btn").forEach((b) => b.classList.toggle("selected", b.dataset.time === t));
  updateConfirmState();
}
document.addEventListener("change", (e) => {
  if (e.target.id === "select-service") updateConfirmState();
});
function updateConfirmState() {
  const service = document.getElementById("select-service").value;
  document.getElementById("btn-confirm-appt").disabled = !(selectedDate && selectedTime && service);
}

async function confirmAppointment() {
  const btn = document.getElementById("btn-confirm-appt");
  const serviceId = document.getElementById("select-service").value;
  const empSel = document.getElementById("select-employee").value;
  if (!selectedDate || !selectedTime || !serviceId) return;

  let employeeUser = empSel;
  if (empSel === "none") {
    const pool = slotEmployeeMap[selectedTime] || [];
    if (pool.length === 0) { toast("Esse horário não está mais disponível.", "error"); return; }
    employeeUser = pool[0];
  }

  btn.disabled = true;
  btn.textContent = "Agendando...";
  try {
    const service = SERVICES.find((s) => String(s.ID) === String(serviceId));
    const isoDate = toISODate(selectedDate);

    await db.insert("APPOINTMENTS", {
      SYSTEM: user.SYSTEM,
      CLIENT_USER: user.USER,
      EMPLOYEE_USER: employeeUser,
      SERVICE_ID: Number(serviceId),
      DATE: isoDate,
      TIME: selectedTime,
      STATUS: "agendado",
    });

    const empName = EMPLOYEES.find((e) => e.USER === employeeUser)?.NAME || employeeUser;
    const dataFmt = selectedDate.toLocaleDateString("pt-BR");

    await notifyUser(user.USER, user.SYSTEM, `Agendamento confirmado: ${service?.NAME || "serviço"} em ${dataFmt} às ${selectedTime} com ${empName}.`);
    await notifyUser(employeeUser, user.SYSTEM, `Novo agendamento: ${service?.NAME || "serviço"} em ${dataFmt} às ${selectedTime} com ${user.NAME || user.USER}.`);
    notifyOwner(`Novo agendamento de ${user.NAME || user.USER} em ${dataFmt} às ${selectedTime}.`);

    toast("Agendamento confirmado!", "success");
    selectedDate = null; selectedTime = null;
    document.getElementById("select-service").value = "";
    document.getElementById("slots-grid").innerHTML = `<div class="slot-empty">Selecione uma data no calendário.</div>`;
    renderCalendar();
    renderAppointments();
  } catch (e) {
    console.error(e);
    toast("Não foi possível agendar. Tente novamente.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar agendamento";
  }
}

async function notifyOwner(message) {
  try {
    const owners = await db.select("BD_USERS", `?select=USER&SYSTEM=eq.${pgEsc(user.SYSTEM)}&LEVEL=eq.000&limit=1`);
    if (owners && owners[0]) await notifyUser(owners[0].USER, user.SYSTEM, message);
  } catch (e) { /* noop */ }
}

/* ==================================================================== LISTA DE AGENDAMENTOS */
async function renderAppointments() {
  const listEl = document.getElementById("appt-list");
  listEl.innerHTML = `<div class="empty-state"><p>Carregando...</p></div>`;

  const rows = (await db.select("APPOINTMENTS", `?select=*&CLIENT_USER=eq.${pgEsc(user.USER)}&order=DATE.desc,TIME.desc`)) || [];

  if (rows.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>Você ainda não tem agendamentos. Vá até a aba "Agendar" para marcar o primeiro!</p></div>`;
    return;
  }

  const now = new Date();
  listEl.innerHTML = "";
  rows.forEach((a) => {
    const service = SERVICES.find((s) => s.ID === a.SERVICE_ID);
    const emp = EMPLOYEES.find((e) => e.USER === a.EMPLOYEE_USER);
    const dt = new Date(a.DATE + "T" + (a.TIME || "00:00"));
    const isFuture = dt > now && a.STATUS === "agendado";

    let badge = { agendado: '<span class="badge badge-gold">Agendado</span>', concluido: '<span class="badge badge-green">Concluído</span>', cancelado: '<span class="badge badge-red">Cancelado</span>' }[a.STATUS] || "";

    const [y, m, d] = a.DATE.split("-");
    const card = document.createElement("div");
    card.className = "appt-card";
    card.innerHTML = `
      <div class="appt-date"><div class="d">${d}</div><div class="m">${MONTH_NAMES[Number(m) - 1].slice(0,3)}</div></div>
      <div class="appt-info">
        <div class="service">${escapeHtml(service?.NAME || "Serviço")} ${badge}</div>
        <div class="meta">${a.TIME} · ${emp ? escapeHtml(emp.NAME) : "Sem preferência"}</div>
      </div>
      <div class="appt-actions">${isFuture ? `<button class="btn btn-danger btn-sm" data-cancel="${a.ID}">Cancelar</button>` : ""}</div>
    `;
    listEl.appendChild(card);
  });

  listEl.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Cancelar este agendamento?")) return;
      try {
        await db.update("APPOINTMENTS", `?ID=eq.${btn.dataset.cancel}`, { STATUS: "cancelado" });
        toast("Agendamento cancelado.", "success");
        renderAppointments();
      } catch (e) {
        toast("Erro ao cancelar.", "error");
      }
    });
  });
}

/* ==================================================================== PLANO */
async function renderPlans() {
  const grid = document.getElementById("plans-grid");
  grid.innerHTML = `<div class="empty-state"><p>Carregando planos...</p></div>`;
  const plans = (await db.select("PLANS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&ACTIVE=eq.true&order=PRICE.asc`)) || [];
  await loadClientRow();

  if (plans.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>Nenhum plano disponível no momento.</p></div>`;
    return;
  }

  grid.innerHTML = "";
  plans.forEach((p) => {
    const isCurrent = CLIENT_ROW && CLIENT_ROW.PLAN === p.NAME && CLIENT_ROW.STATE === "ativo";
    const div = document.createElement("div");
    div.className = "plan-card" + (isCurrent ? " current" : "");
    div.innerHTML = `
      ${isCurrent ? '<span class="badge badge-gold" style="position:absolute;top:16px;right:16px;">Seu plano</span>' : ""}
      <div class="plan-name">${escapeHtml(p.NAME)}</div>
      <div class="plan-price">${money(p.PRICE)}<span>/mês</span></div>
      <div class="plan-desc">${escapeHtml(p.DESCRIPTION || "")}</div>
      <button class="btn btn-primary btn-block" data-plan-id="${p.ID}">${isCurrent ? "Renovar" : "Assinar"}</button>
    `;
    grid.appendChild(div);
    div.querySelector("button").addEventListener("click", () => openPayModal(p));
  });

  if (CLIENT_ROW && CLIENT_ROW.STATE && CLIENT_ROW.STATE !== "ativo") {
    const warn = document.createElement("div");
    warn.className = "card";
    warn.style.gridColumn = "1/-1";
    warn.style.borderColor = "var(--red-soft)";
    warn.innerHTML = `<strong style="color:var(--red-soft);">Atenção:</strong> sua conta está com status "${CLIENT_ROW.STATE}". Assine ou regularize seu plano para conseguir agendar.`;
    grid.prepend(warn);
  }
}

function openPayModal(plan) {
  selectedPayMethod = "pix";
  const body = document.getElementById("modal-pay-body");
  body.innerHTML = `
    <p style="margin-bottom:16px;color:var(--text-muted);font-size:13.5px;">Plano <strong style="color:var(--text)">${escapeHtml(plan.NAME)}</strong> — ${money(plan.PRICE)}/mês</p>
    <div class="pay-method-grid" id="modal-pay-methods">
      <div class="pay-method active" data-pay="pix">Pix</div>
      <div class="pay-method" data-pay="credito">Crédito</div>
      <div class="pay-method" data-pay="debito">Débito</div>
      <div class="pay-method" data-pay="dinheiro">Dinheiro</div>
    </div>
    <div id="pay-content"></div>
  `;
  renderPayContent(plan);
  body.querySelector("#modal-pay-methods").addEventListener("click", (e) => {
    const el = e.target.closest(".pay-method");
    if (!el) return;
    body.querySelectorAll(".pay-method").forEach((p) => p.classList.remove("active"));
    el.classList.add("active");
    selectedPayMethod = el.dataset.pay;
    renderPayContent(plan);
  });
  openModal("modal-pay");
}

function renderPayContent(plan) {
  const el = document.getElementById("pay-content");
  if (selectedPayMethod === "pix") {
    el.innerHTML = `
      <div class="pix-box">
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Escaneie o QR Code ou copie o código Pix</div>
        <div style="width:140px;height:140px;margin:0 auto;background:repeating-conic-gradient(var(--surface-3) 0 25%, var(--surface) 0 50%) 0 0/20px 20px;border-radius:8px;"></div>
        <div class="pix-code">00020126580014BR.GOV.BCB.PIX0136ilustrativo-asaas-${plan.ID}-${Date.now()}5204000053039865802BR5920BARBEARIA LTDA6009SAO PAULO62070503***6304ABCD</div>
      </div>
      <p class="help-text" style="text-align:center;margin-top:10px;">Integração de cobrança Asaas ilustrativa — ainda não processa pagamento real.</p>
      <button class="btn btn-primary btn-block" style="margin-top:14px;" id="btn-confirm-pay">Já paguei / confirmar</button>
    `;
  } else if (selectedPayMethod === "dinheiro") {
    el.innerHTML = `
      <p style="font-size:13.5px;color:var(--text-muted);">Você poderá pagar em dinheiro diretamente no balcão. Sua assinatura ficará <strong style="color:var(--text)">pendente</strong> até a confirmação do dono.</p>
      <button class="btn btn-primary btn-block" style="margin-top:14px;" id="btn-confirm-pay">Solicitar plano</button>
    `;
  } else {
    el.innerHTML = `
      <div class="field"><label>Número do cartão</label><input type="text" id="pay-card" placeholder="0000 0000 0000 0000"></div>
      <div class="field-row">
        <div class="field"><label>Validade</label><input type="text" id="pay-date" placeholder="MM/AA"></div>
        <div class="field"><label>CVV</label><input type="text" id="pay-code" placeholder="123"></div>
      </div>
      <p class="help-text">Integração de cobrança Asaas ilustrativa — dados não são processados de verdade.</p>
      <button class="btn btn-primary btn-block" style="margin-top:6px;" id="btn-confirm-pay">Pagar agora</button>
    `;
  }
  document.getElementById("btn-confirm-pay").addEventListener("click", () => confirmPlanPayment(plan));
}

async function confirmPlanPayment(plan) {
  const btn = document.getElementById("btn-confirm-pay");
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>';
  try {
    const payload = {
      PLAN: plan.NAME,
      VALUE: plan.PRICE,
      TYPE_PAY: selectedPayMethod,
      STATE: selectedPayMethod === "dinheiro" ? "pendente" : "ativo",
    };
    if (selectedPayMethod === "credito" || selectedPayMethod === "debito") {
      payload.CARD = document.getElementById("pay-card")?.value || "";
      payload.DATE = document.getElementById("pay-date")?.value || "";
      payload.CODE = document.getElementById("pay-code")?.value || "";
    } else {
      payload.CARD = null; payload.DATE = null; payload.CODE = null;
    }
    await db.update("CLIENT_USER", `?USER=eq.${pgEsc(user.USER)}`, payload);
    await notifyUser(user.USER, user.SYSTEM, `Plano "${plan.NAME}" ${selectedPayMethod === "dinheiro" ? "solicitado (pendente de confirmação)" : "assinado com sucesso"}.`);
    notifyOwner(`${user.NAME || user.USER} assinou o plano "${plan.NAME}" via ${selectedPayMethod}.`);
    toast("Plano atualizado!", "success");
    closeModal("modal-pay");
    renderPlans();
  } catch (e) {
    console.error(e);
    toast("Erro ao processar. Tente novamente.", "error");
  } finally {
    btn.disabled = false;
  }
}

/* ==================================================================== PRODUTOS */
async function renderProducts() {
  const grid = document.getElementById("products-grid");
  grid.innerHTML = `<div class="empty-state"><p>Carregando produtos...</p></div>`;
  const products = (await db.select("PRODUCTS", `?select=*&SYSTEM=eq.${pgEsc(user.SYSTEM)}&ACTIVE=eq.true&order=NAME.asc`)) || [];
  if (products.length === 0) {
    grid.innerHTML = `<div class="empty-state"><p>Nenhum produto cadastrado ainda.</p></div>`;
    return;
  }
  grid.innerHTML = "";
  products.forEach((p) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3 style="font-size:15px;margin-bottom:8px;">${escapeHtml(p.NAME)}</h3>
      <div class="stat-value" style="font-size:20px;margin-bottom:10px;">${money(p.PRICE)}</div>
      <button class="btn btn-outline btn-block">Comprar</button>
    `;
    div.querySelector("button").addEventListener("click", () => toast(`Compra de "${p.NAME}" registrada (ilustrativo).`, "success"));
    grid.appendChild(div);
  });
}

/* ==================================================================== CONFIGURAÇÕES */
function renderConfigForm() {
  document.getElementById("cfg-name").value = user.NAME || "";
  document.getElementById("cfg-email").value = user.EMAIL || "";
  document.getElementById("cfg-number").value = user.NUMBER || "";

  if (CLIENT_ROW) {
    selectedPayMethod = CLIENT_ROW.TYPE_PAY || "pix";
    document.querySelectorAll("#cfg-pay-methods .pay-method").forEach((p) => p.classList.toggle("active", p.dataset.pay === selectedPayMethod));
    document.getElementById("cfg-card-fields").classList.toggle("hidden", selectedPayMethod === "pix" || selectedPayMethod === "dinheiro");
    document.getElementById("cfg-card").value = CLIENT_ROW.CARD || "";
    document.getElementById("cfg-date").value = CLIENT_ROW.DATE || "";
    document.getElementById("cfg-code").value = CLIENT_ROW.CODE || "";
  }
}

async function savePersonalData() {
  const btn = document.getElementById("btn-save-personal");
  btn.disabled = true;
  const name = document.getElementById("cfg-name").value.trim();
  const email = document.getElementById("cfg-email").value.trim();
  const number = document.getElementById("cfg-number").value.trim();
  try {
    await db.update("BD_USERS", `?USER=eq.${pgEsc(user.USER)}`, { NAME: name, EMAIL: email, NUMBER: number });
    await db.update("CLIENT_USER", `?USER=eq.${pgEsc(user.USER)}`, { NAME: name, EMAIL: email, NUMBER: number });
    user.NAME = name; user.EMAIL = email; user.NUMBER = number;
    saveSession(user);
    document.getElementById("avatar-name").textContent = name;
    document.getElementById("avatar-initials").textContent = initials(name);
    toast("Dados atualizados!", "success");
  } catch (e) {
    toast("Erro ao salvar dados.", "error");
  } finally {
    btn.disabled = false;
  }
}

async function savePaymentData() {
  const btn = document.getElementById("btn-save-pay");
  btn.disabled = true;
  try {
    const payload = { TYPE_PAY: selectedPayMethod };
    if (selectedPayMethod === "credito" || selectedPayMethod === "debito") {
      payload.CARD = document.getElementById("cfg-card").value.trim();
      payload.DATE = document.getElementById("cfg-date").value.trim();
      payload.CODE = document.getElementById("cfg-code").value.trim();
    } else {
      payload.CARD = null; payload.DATE = null; payload.CODE = null;
    }
    await db.update("CLIENT_USER", `?USER=eq.${pgEsc(user.USER)}`, payload);
    toast("Forma de pagamento atualizada!", "success");
    await loadClientRow();
  } catch (e) {
    toast("Erro ao salvar forma de pagamento.", "error");
  } finally {
    btn.disabled = false;
  }
}
