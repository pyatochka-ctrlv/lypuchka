// Пульт тренера: показує стан екрана і надсилає команди.
import { SCENARIOS, ROUND_TIPS, CHIPS, getScenario, msgPreview } from "./scenarios.js";
import { createLink, firebaseEnabled, newId } from "./sync.js";

const $ = id => document.getElementById(id);
const LS_ROOM = "lypuchka:pultRoom";
let state = null;
let lastBeat = 0;
const EMPTY = { rev: -1, view: "list", chat: null, done: [], sound: false, partB: { sid: SCENARIOS[0].id, active: 0, rewrites: {} } };

const link = createLink("pult", msg => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "state" && msg.state) {
    if (!state || msg.state.rev !== state.rev || msg.state !== state) { state = msg.state; render(); }
    lastBeat = Date.now(); renderConn();
  } else if (msg.type === "beat") {
    lastBeat = Date.now(); renderConn();
  }
});

function send(cmd, arg = {}) { link.send({ type: "cmd", id: newId(), cmd, arg }); }

link.send({ type: "hello" });
setInterval(() => { link.send({ type: "ping" }); renderConn(); }, 2000);
link.send({ type: "ping" });

/* ---------- Кімната (Firebase) ---------- */
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
if (firebaseEnabled) {
  $("room-bar").hidden = false;
  const fromUrl = new URLSearchParams(location.search).get("room");
  const code = /^\d{4}$/.test(fromUrl || "") ? fromUrl : lsGet(LS_ROOM);
  if (/^\d{4}$/.test(code || "")) { $("room-input").value = code; joinRoom(code); }
  $("room-bar").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("room-input").value.trim();
    if (!/^\d{4}$/.test(v)) { toast("Код — це 4 цифри з екрана гри"); return; }
    joinRoom(v);
  });
}
function joinRoom(code) {
  lsSet(LS_ROOM, code);
  link.setRoom(code);
  $("room-state").textContent = `Кімната ${code}`;
  link.send({ type: "ping" });
}

/* ---------- Верхня панель ---------- */
function renderConn() {
  const on = Date.now() - lastBeat < 6000;
  $("conn").classList.toggle("on", on);
  $("conn").querySelector("span").textContent = on
    ? "Екран гри підключено"
    : firebaseEnabled ? "Екран не знайдено: відкрийте його або введіть код кімнати" : "Екран не знайдено: відкрийте його в сусідній вкладці";
}
$("sound").addEventListener("click", () => state && send("sound", { on: !state.sound }));
$("new-lesson").addEventListener("click", () => { $("modal").hidden = false; $("modal-cancel").focus(); });
$("modal-cancel").addEventListener("click", () => { $("modal").hidden = true; });
$("modal-ok").addEventListener("click", () => {
  $("modal").hidden = true;
  send("newLesson");
  pbText.clear();
  toast("Новий урок: усе скинуто");
});
$("modal").addEventListener("click", e => { if (e.target === $("modal")) $("modal").hidden = true; });
addEventListener("keydown", e => { if (e.key === "Escape") $("modal").hidden = true; });

document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(x => x.classList.toggle("on", x === t));
  $("tab-a").classList.toggle("on", t.dataset.tab === "a");
  $("tab-b").classList.toggle("on", t.dataset.tab === "b");
}));

/* ---------- Частина А ---------- */
$("scen-list").addEventListener("click", e => {
  const b = e.target.closest("[data-sid]");
  if (b) send("openChat", { sid: b.dataset.sid });
});
$("to-list").addEventListener("click", () => send("openList"));
$("restart").addEventListener("click", () => state?.chat && send("openChat", { sid: state.chat.sid, restart: true }));
$("start").addEventListener("click", () => send("start"));
$("skip").addEventListener("click", () => send("skip"));
$("rewind").addEventListener("click", () => send("rewind"));
$("answer-form").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("answer-input").value.trim();
  if (!v) return;
  send("answer", { text: v });
  $("answer-input").value = "";
});
$("chips").innerHTML = CHIPS.map(c => `<button type="button" class="btn chip" data-chip="${esc(c)}">${esc(c)}</button>`).join("");
$("chips").addEventListener("click", e => {
  const b = e.target.closest("[data-chip]");
  if (b) send("answer", { text: b.dataset.chip });
});
$("classify").addEventListener("click", e => {
  const b = e.target.closest("[data-kind]");
  if (b) send("classify", { kind: b.dataset.kind });
});

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

const PHASE_TEXT = {
  idle: n => `Покличте захисника №${n} і натисніть «▶️ Липучка пише».`,
  typing: () => "Липучка друкує… Можна пропустити очікування.",
  await: n => `Чекаємо на відповідь захисника №${n}. Впишіть її або оберіть готову фразу.`,
  answered: () => "Відповідь на екрані. Оцініть її кнопками нижче.",
  freeze: () => "На екрані «Стоп-кадр». Обговоріть, що сталося, і натисніть «⏪ Перемотати».",
  released: () => "Липучка відклеїлась! Оберіть наступний чат."
};

function render() {
  if (!state) { state = EMPTY; render(); state = null; return; }
  $("sound").textContent = state.sound ? "🔊 Звук увімк." : "🔇 Звук вимк.";
  const c = state.chat;
  const inChat = state.view === "chat" && c;

  // Список сценаріїв
  $("scen-list").innerHTML = SCENARIOS.map(s => {
    const done = state.done.includes(s.id);
    const cur = c && c.sid === s.id;
    let status = done ? "✓ відклеїлась" : "не пройдено";
    if (cur && c.phase !== "released") status = `▶ раунд ${c.round + 1} з ${s.rounds.length}${done ? " · ✓ раніше" : ""}`;
    return `<button type="button" class="btn scen${cur && inChat ? " current" : ""}${done ? " done" : ""}" data-sid="${s.id}">
      <b>${s.icon} ${esc(s.title)}</b><small>${status}</small></button>`;
  }).join("");
  $("restart").disabled = !c;

  // Раунд
  const s = c && getScenario(c.sid);
  if (!inChat) {
    $("round-title").textContent = "Раунд";
    $("phase-text").textContent = state.view === "edit"
      ? "На екрані зараз «Редакція суду». Оберіть чат, щоб повернутися до гри."
      : "Оберіть чат вище — він відкриється на екрані.";
    $("plan").innerHTML = "";
    $("log").innerHTML = "";
  } else {
    const r = s.rounds[c.round];
    $("round-title").textContent = c.phase === "released"
      ? `${s.icon} ${s.title} · пройдено`
      : `${s.icon} Раунд ${c.round + 1} з ${s.rounds.length} · ${r.label}`;
    $("phase-text").textContent = PHASE_TEXT[c.phase](c.defender);
    renderPlan(c, s);
    $("log").innerHTML = c.msgs.map(m => m.from === "sys"
      ? `<li class="sys">${esc(m.t)}</li>`
      : m.from === "kid"
        ? `<li class="kid">Захисник №${m.defender}: ${esc(m.t)}</li>`
        : `<li>Липучка: ${esc(msgPreview(m))}</li>`).join("");
  }
  $("start").disabled = !inChat || c.phase !== "idle";
  $("skip").disabled = !inChat || c.phase !== "typing";

  // Відповідь
  const canAnswer = inChat && (c.phase === "await" || c.phase === "answered");
  $("answer-input").disabled = !canAnswer;
  $("answer-form").querySelector("button").disabled = !canAnswer;
  document.querySelectorAll(".chip").forEach(b => { b.disabled = !canAnswer; });
  $("answer-title").textContent = inChat && c.phase !== "released" ? `Відповідь захисника №${c.defender}` : "Відповідь захисника";
  $("answer-input").placeholder = inChat && c.phase === "answered"
    ? "Виправити відповідь (замінить текст на екрані)"
    : "Що сказала дитина?";
  $("classify").hidden = !(inChat && c.phase === "answered");
  $("rewind").hidden = !(inChat && c.phase === "freeze");

  renderCheat(c, s, inChat);
  renderPartB();
}

function renderPlan(c, s) {
  const r = s.rounds[c.round];
  const items = [];
  for (const m of r.msgs) {
    if (m.type === "burst") m.t.forEach((t, i) => items.push((i ? "↳ " : "Серія: ") + t));
    else items.push(msgPreview(m));
  }
  // скільки вже показано після останньої плашки раунду
  let shown = 0;
  if (c.phase !== "idle") {
    let i = c.msgs.length - 1;
    while (i >= 0 && c.msgs[i].from !== "sys") i--;
    for (let j = i + 1; j < c.msgs.length; j++) if (c.msgs[j].from === "ly" && !c.msgs[j].grab) shown++;
  }
  if (c.phase === "released") shown = items.length;
  let html = items.map((t, i) => `<li class="${i < shown ? "shown" : ""}">${esc(t)}</li>`).join("");
  const nextGrab = s.grab[c.grabIdx % s.grab.length];
  if (c.phase !== "released") html += `<li style="list-style:none;margin-left:-26px;margin-top:8px">🟡 Якщо довге пояснення, Липучка вчепиться: «${esc(nextGrab)}»</li>`;
  if (c.round === s.rounds.length - 1 && c.phase !== "released") html += `<li style="list-style:none;margin-left:-26px">🟢 Після сильної відповіді: «${esc(s.release)}»</li>`;
  $("plan").innerHTML = html;
}

function renderCheat(c, s, inChat) {
  const ri = inChat ? Math.min(c.round, 3) : 0;
  const tip = ROUND_TIPS[ri];
  const label = inChat ? s.rounds[ri].label : "Прохання";
  const sc = s || null;
  $("cheat").innerHTML = `
    <h2>Шпаргалка · Р${ri + 1} «${esc(label.replace(/[«»]/g, ""))}»</h2>
    <p class="goal">🎯 ${esc(tip.goal)}</p>
    ${tip.strong.map(t => `<div class="strong">💪 «${esc(t)}»</div>`).join("")}
    ${sc && sc.note ? `<div class="note">📌 ${esc(sc.note)}</div>` : ""}
    ${sc && sc.afterRound4Hint ? `<div class="note">🔴 Після раунду 4 на екрані: ${esc(sc.afterRound4Hint)}</div>` : ""}
    <div class="remind">Липучка не сперечається з відповіддю — тиск не логіка, його не перемагають аргументами.</div>
    <h3>Як оцінювати</h3>
    <dl>
      <dt>🟢 Спокійне «ні»</dt><dd>Коротко, без «бо…». Повтор тієї самої фрази — це «платівка».</dd>
      <dt>🔵 Змінили тему / пішли</dt><dd>«Давай краще…», «Я піду», «Бувай».</dd>
      <dt>🟡 Довге пояснення</dt><dd>Виправдовування, суперечка, багато причин. Липучка чіпляється за «бо…», раунд повторює новий захисник.</dd>
      <dt>🔴 Поступилися</dt><dd>«Ну добре, бери». Стоп-кадр, обговорення, перемотування. Програшу немає.</dd>
    </dl>
    <h3>Клавіші на екрані гри (якщо пульт не працює)</h3>
    <p class="muted">F — повний екран · Esc — до чатів · 1–5 — обрати чат у списку · 1/2/3/4 — 🟢/🔵/🟡/🔴 · Пробіл — пропустити «друкує…» (а також запустити раунд або перемотати).</p>`;
}

/* ---------- Частина Б ---------- */
const pbText = new Map(); // локальні чернетки тренера: "sid|i" → текст
let pbRendered = "";

$("pb-scen").addEventListener("click", e => {
  const b = e.target.closest("[data-sid]");
  if (b) send("pb.open", { sid: b.dataset.sid });
});
$("pb-show").addEventListener("click", () => state && send("pb.open", { sid: state.partB.sid }));
$("pb-drafts").addEventListener("input", e => {
  if (e.target.matches("textarea")) pbText.set(e.target.dataset.key, e.target.value);
});
$("pb-drafts").addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b || !state) return;
  const idx = +b.dataset.idx;
  const key = `${state.partB.sid}|${idx}`;
  const ta = $("pb-drafts").querySelector(`textarea[data-key="${key}"]`);
  if (b.dataset.act === "active") send("pb.active", { idx });
  if (b.dataset.act === "example") { ta.value = b.dataset.example; pbText.set(key, ta.value); ta.focus(); }
  if (b.dataset.act === "save") {
    if (!ta.value.trim()) { toast("Впишіть переробку, яку запропонували діти"); ta.focus(); return; }
    send("pb.save", { idx, text: ta.value });
    if (state.view !== "edit") toast("Екран перемкнувся на «Редакцію суду»");
  }
  if (b.dataset.act === "clear") { send("pb.clear", { idx }); pbText.delete(key); ta.value = ""; }
});

function renderPartB() {
  const pb = state.partB;
  const s = getScenario(pb.sid) || SCENARIOS[0];
  $("pb-scen").innerHTML = SCENARIOS.map(x => `<button type="button" class="btn scen${x.id === pb.sid ? " current" : ""}" data-sid="${x.id}">
      <b>${x.icon} ${esc(x.title)}</b><small>${Object.keys(x.rewrite).length} чернетки</small></button>`).join("");
  $("pb-show").textContent = state.view === "edit" ? "📺 Редакція вже на екрані" : "📺 Показати Редакцію на екрані";
  $("pb-show").disabled = state.view === "edit";

  const sig = JSON.stringify([pb.sid, pb.active, pb.rewrites]);
  if (sig === pbRendered) return;
  pbRendered = sig;
  const focused = document.activeElement?.dataset?.key;
  $("pb-drafts").innerHTML = Object.entries(s.rewrite).map(([orig, example], i) => {
    const key = `${s.id}|${i}`;
    const saved = pb.rewrites[key];
    if (!pbText.has(key) && saved) pbText.set(key, saved);
    return `<section class="card draft${pb.active === i ? " active" : ""}">
      <h2>Чернетка ${i + 1}${pb.active === i ? " · ✏️ активна на екрані" : ""}</h2>
      <div class="orig">«${esc(orig)}»</div>
      ${saved ? `<div class="saved">✅ На екрані: «${esc(saved)}»</div>` : ""}
      <div class="row"><button type="button" class="btn" data-act="active" data-idx="${i}" ${pb.active === i ? "disabled" : ""}>🔆 Зробити активною</button></div>
      <label for="ta-${i}">Як має звучати повага до «ні»?</label>
      <textarea id="ta-${i}" data-key="${key}" placeholder="Запишіть переробку дітей"></textarea>
      <div class="example">Приклад: <b>«${esc(example)}»</b></div>
      <div class="row">
        <button type="button" class="btn ghost" data-act="example" data-idx="${i}" data-example="${esc(example)}">Вставити приклад</button>
        <button type="button" class="btn primary big" data-act="save" data-idx="${i}">📺 Показати на екрані</button>
        ${saved ? `<button type="button" class="btn ghost" data-act="clear" data-idx="${i}">Прибрати з екрана</button>` : ""}
      </div>
    </section>`;
  }).join("");
  $("pb-drafts").querySelectorAll("textarea").forEach(ta => { ta.value = pbText.get(ta.dataset.key) || ""; });
  if (focused) $("pb-drafts").querySelector(`textarea[data-key="${focused}"]`)?.focus();
}

/* ---------- Дрібниці ---------- */
let toastTimer = null;
function toast(text) {
  let t = document.querySelector(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

renderConn();
render();
