// Пульт-майстер для тренера: один крок — одна дія.
import { TRICKS, EVIDENCE, trickById, colorOf, INTRO_READ, VERDICT_READ, REMINDER } from "./data.js";
import { createLink, firebaseEnabled, newId } from "./sync.js";

const $ = id => document.getElementById(id);
const LS_ROOM = "sprava:pultRoom";
const LAST = EVIDENCE.length - 1;
let state = null;
let lastBeat = 0;
let tried = new Set(); // невлучні версії на поточному доказі (лише для пульта)
let triedKey = "";

const link = createLink("pult", msg => {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "state" && msg.state) {
    lastBeat = Date.now();
    if (!state || msg.state.rev !== state.rev) { state = msg.state; render(); }
    renderConn();
  } else if (msg.type === "beat") { lastBeat = Date.now(); renderConn(); }
});
const send = (cmd, arg = {}) => link.send({ type: "cmd", id: newId(), cmd, arg });
link.send({ type: "hello" });
link.send({ type: "ping" });
setInterval(() => { link.send({ type: "ping" }); renderConn(); }, 2000);

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

/* ---------- Кімната (Firebase) ---------- */
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
if (firebaseEnabled) {
  $("room").hidden = false;
  const fromUrl = new URLSearchParams(location.search).get("room");
  const code = /^\d{4}$/.test(fromUrl || "") ? fromUrl : lsGet(LS_ROOM);
  if (/^\d{4}$/.test(code || "")) { $("room-input").value = code; joinRoom(code); }
  $("room").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("room-input").value.trim();
    if (/^\d{4}$/.test(v)) { joinRoom(v); closeMenu(); }
  });
}
function joinRoom(code) { lsSet(LS_ROOM, code); link.setRoom(code); link.send({ type: "ping" }); }

/* ---------- Верх і меню ---------- */
function renderConn() {
  const on = Date.now() - lastBeat < 6000;
  $("conn").classList.toggle("on", on);
  $("conn-t").textContent = on ? "екран" : "немає екрана";
  $("conn").title = on ? "Екран гри підключено" : "Екран гри не знайдено — відкрийте його в меню ⚙️";
}
function openMenu() { $("menu").hidden = false; $("menu-btn").setAttribute("aria-expanded", "true"); $("m-confirm").hidden = true; $("menu-close").focus(); }
function closeMenu() { $("menu").hidden = true; $("menu-btn").setAttribute("aria-expanded", "false"); }
$("menu-btn").addEventListener("click", openMenu);
$("menu-close").addEventListener("click", closeMenu);
$("menu").addEventListener("click", e => { if (e.target === $("menu")) closeMenu(); });
addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
$("m-sound").addEventListener("click", () => state && send("sound", { on: !state.sound }));
$("m-restart").addEventListener("click", () => { $("m-confirm").hidden = false; });
$("m-no").addEventListener("click", () => { $("m-confirm").hidden = true; });
$("m-yes").addEventListener("click", () => { send("restart"); closeMenu(); });
$("m-open").addEventListener("click", () => setTimeout(closeMenu, 100));

/* ---------- Кроки ---------- */
$("step").addEventListener("click", e => {
  const b = e.target.closest("[data-cmd]");
  if (!b || b.disabled) return;
  const cmd = b.dataset.cmd;
  if (cmd === "guess") {
    const ev = state && EVIDENCE[state.idx];
    if (ev && ev.trick !== b.dataset.id && !ev.alsoOk.includes(b.dataset.id)) tried.add(b.dataset.id);
    send("guess", { id: b.dataset.id });
  } else if (cmd === "restartAsk") {
    openMenu(); $("m-confirm").hidden = false;
  } else send(cmd);
});

function stepView(s) {
  if (!s || s.step === "intro") return "intro";
  if (s.step === "verdict") return "done";
  if (s.phase === "ask") return "evidence";
  if (s.phase === "choose") return "choose";
  if (s.phase === "exposed") return "shield";
  return s.idx < LAST ? "praised" : "verdict";
}

function act(label, cmd, note, primary = true, disabled = false) {
  return `<div class="act"><button type="button" class="btn${primary ? " primary" : ""}" data-cmd="${cmd}" ${disabled ? "disabled" : ""}>${label}</button><small>На екрані: ${note}</small></div>`;
}

function head(label, canBack) {
  return `<div class="step-head"><span class="step-lbl">${label}</span><button type="button" class="back" data-cmd="back" ${canBack ? "" : "disabled"}>↩ Назад</button></div>`;
}

function render() {
  const s = state || { step: "intro", idx: 0, sound: false, canBack: false };
  const view = stepView(s);
  const ev = EVIDENCE[s.idx];
  const key = `${s.step}|${s.idx}`;
  if (key !== triedKey) { triedKey = key; tried = new Set(); }

  $("where").textContent = s.step === "intro" ? "Заставка" : s.step === "verdict" ? "Вирок" : `Доказ ${s.idx + 1} з ${EVIDENCE.length}`;
  $("m-sound").textContent = s.sound ? "🔊 Звук увімкнено" : "🔇 Звук вимкнено";

  let html = "";
  if (view === "intro") {
    html = `${head("Крок 0 · Заставка", s.canBack)}
      <p class="what">Прочитайте вступ: Липучка на суді, діти — слідчі.</p>
      <div class="read"><span class="lbl">Читайте вголос</span>${esc(INTRO_READ)}</div>
      <div class="actions">${act("Показати перший доказ →", "start", "доказ №1 і питання «Який це прийом?»", true, !state)}</div>`;
  } else if (view === "evidence") {
    html = `${head(`Крок 1 · Доказ №${ev.id}`, s.canBack)}
      <p class="what">Прочитайте доказ вголос голосом Липучки. Потім спитайте: «Який це прийом?»</p>
      <div class="read"><span class="lbl">Голосом Липучки</span>${esc(ev.text)}</div>
      <div class="meta">${esc(ev.place)} · ${esc(ev.context)}</div>
      <div class="actions">${act("Слідчі відповіли →", "toChoose", "нічого не зміниться, обираєте прийом у пульті")}</div>`;
  } else if (view === "choose") {
    html = `${head(`Крок 2 · Доказ №${ev.id}`, s.canBack)}
      <p class="what">Торкніться прийому, який назвали діти.</p>
      <div class="tricks">${TRICKS.map(t => {
        const right = ev.trick === t.id, ok = ev.alsoOk.includes(t.id);
        const cls = right ? " right" : ok ? " ok" : tried.has(t.id) ? " tried" : "";
        const tag = right ? '<span class="tag">✓ правильно</span>' : ok ? '<span class="tag">теж ок</span>' : "";
        return `<button type="button" class="trick${cls}" data-cmd="guess" data-id="${t.id}" style="background:${colorOf(t)}"><span class="ic">${t.icon}</span>${esc(t.name)}${tag}</button>`;
      }).join("")}</div>
      ${ev.combo ? `<div class="status">🤯 Комбо: зарахуйте будь-який із трьох — упадуть усі три печатки.</div>` : ""}
      ${s.doubt ? `<div class="status">На екрані: «🤔 Суд сумнівається… Ще версії?»</div>` : ""}
      <button type="button" class="link" data-cmd="reveal">Показати відповідь (печатка «${esc(trickById(ev.trick).name)}»)</button>`;
  } else if (view === "shield") {
    const named = trickById(s.named) || trickById(ev.trick);
    html = `${head(`Крок 3 · Щит · доказ №${ev.id}`, s.canBack)}
      <p class="what">Попросіть охочого відповісти Липучці щитом — спокійним «ні» без суперечки.</p>
      <div class="done-line">✅ Викрито: ${ev.combo ? ev.comboTricks.map(id => esc(trickById(id).name)).join(" + ") : esc(named.name)}</div>
      <ul class="strong">${ev.strong.map(x => `<li>«${esc(x)}»</li>`).join("")}</ul>
      <div class="actions">
        ${act("👍 Захисник відповів", "shieldOk", ev.id < EVIDENCE.length ? "похвала «Щит спрацював!», далі наступний доказ" : "похвала «Щит спрацював!»")}
        ${act(s.hint ? "🛡 Щит-підказку показано" : "🛡 Показати щит-підказку", "shieldHint", `картка щита «${esc(named.shield)}»`, false, s.hint)}
      </div>`;
  } else if (view === "praised") {
    html = `${head(`Доказ №${ev.id} · готово`, s.canBack)}
      <p class="what">Щит спрацював! Наступний доказ з'явиться сам за кілька секунд.</p>
      <div class="actions">${act("Наступний доказ →", "nextEvidence", `доказ №${ev.id + 1}`, false)}</div>`;
  } else if (view === "verdict") {
    html = `${head("Крок 4 · Вирок", s.canBack)}
      <p class="what">Оголосіть вирок голосом Сови. Похваліть слідчих!</p>
      <div class="read"><span class="lbl">Голосом Сови-судді</span>${esc(VERDICT_READ)}</div>
      <div class="actions">${act("⚖️ Оголосити вирок", "verdict", "молоток, вирок, Липучка відклеюється, конфеті")}</div>`;
  } else {
    html = `${head("Гру завершено", s.canBack)}
      <p class="what">Вирок оголошено. На екрані лишаються «Ваші щити від тиску» — можна обговорити їх або перейти до наступного слайда уроку.</p>
      <div class="read"><span class="lbl">Можна сказати</span>Тиск, який ви впізнали й назвали, діє слабше. А щит — це коротке спокійне «ні».</div>
      <div class="actions">${act("↺ Почати заново", "restartAsk", "заставка (після підтвердження)", false)}</div>`;
  }
  $("step").innerHTML = `<section class="step">${html}</section>`;

  // Підказка
  let hint = "";
  if (s.step === "case") {
    hint += `<p><b>Чому це «${esc(trickById(ev.trick).name)}»:</b> ${esc(ev.why)}</p>`;
    if (ev.alsoOk.length) hint += `<p><b>Теж зараховуємо:</b> ${ev.alsoOk.map(id => esc(trickById(id).name)).join(", ")}.</p>`;
    if (ev.trainerNote) hint += `<p>⚠️ ${esc(ev.trainerNote)}</p>`;
  } else if (s.step === "intro") {
    hint += `<p>7 доказів ≈ 8 хвилин. Прийом визначає весь клас (2–3 версії), щит промовляє один охочий. Програшу немає.</p>`;
  } else {
    hint += `<p>Після гри на уроці — окрема тема про небезпеку («червона печатка»).</p>`;
  }
  hint += `<p class="remind">${esc(REMINDER)}</p>`;
  $("hint-body").innerHTML = hint;
}

renderConn();
render();
