// Екран гри — джерело стану. Кожна зміна → повний знімок у канал.
import { TRICKS, EVIDENCE, trickById, colorOf, isHit, magnetSVG, owlSVG, gavelSVG } from "./data.js";
import { createLink, firebaseEnabled } from "./sync.js";

const LS_STATE = "sprava:state";
const LS_ROOM = "sprava:room";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
const LAST = EVIDENCE.length - 1;

/* ---------------- Стан ---------------- */
function freshState(sound = false) {
  return { v: 2, rev: 0, sound, step: "intro", idx: 0, phase: "ask",
    doubt: false, named: null, stamps: [], hint: false, open: [], history: [] };
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

let state = freshState();
try {
  const saved = JSON.parse(lsGet(LS_STATE) || "null");
  if (saved && saved.v === 2 && EVIDENCE[saved.idx]) state = Object.assign(freshState(), saved);
} catch (_) {}

/* ---------------- Зв'язок ---------------- */
let lastPing = 0;
const seenCmd = new Set();
const link = createLink("screen", onMessage);
let room = lsGet(LS_ROOM);
if (firebaseEnabled) {
  if (!/^\d{4}$/.test(room || "")) { room = String(1000 + Math.floor(Math.random() * 9000)); lsSet(LS_ROOM, room); }
  link.setRoom(room);
  link.cleanupRooms();
}
function snapshot() { const { history, ...rest } = state; return { ...rest, canBack: history.length > 0 }; }
function sendState() { link.send({ type: "state", state: snapshot() }); }

function commit() {
  state.rev++;
  lsSet(LS_STATE, JSON.stringify(state));
  sendState();
  render();
}

function onMessage(msg) {
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "hello") { lastPing = Date.now(); renderCorner(); sendState(); return; }
  if (msg.type === "ping") { lastPing = Date.now(); renderCorner(); return; }
  if (msg.type === "cmd") {
    if (msg.id) {
      if (seenCmd.has(msg.id)) return;
      seenCmd.add(msg.id);
      if (seenCmd.size > 300) seenCmd.delete(seenCmd.values().next().value);
    }
    lastPing = Date.now();
    exec(msg.cmd, msg.arg || {});
  }
}
setInterval(() => { link.send({ type: "beat" }); renderCorner(); }, 2000);

/* ---------------- Команди ---------------- */
function remember() {
  const { history, ...rest } = state;
  history.push(JSON.stringify(rest));
  if (history.length > 60) history.shift();
}

function exec(cmd, arg) {
  if (cmd === "sound") { state.sound = !!arg.on; if (state.sound) audio.unlock(); return commit(); }
  if (cmd === "back") return back();
  const ev = EVIDENCE[state.idx];
  const s = state;
  switch (cmd) {
    case "start":
      if (s.step !== "intro") return;
      remember(); s.step = "case"; s.idx = 0; resetEvidence(); break;
    case "toChoose":
      if (s.step !== "case" || s.phase !== "ask") return;
      remember(); s.phase = "choose"; break;
    case "guess": {
      if (s.step !== "case" || (s.phase !== "ask" && s.phase !== "choose")) return;
      if (!trickById(arg.id)) return;
      remember();
      if (isHit(ev, arg.id)) expose(arg.id);
      else { s.phase = "choose"; s.doubt = true; }
      break;
    }
    case "reveal":
      if (s.step !== "case" || (s.phase !== "ask" && s.phase !== "choose")) return;
      remember(); expose(ev.trick); break;
    case "shieldHint":
      if (s.step !== "case" || s.phase !== "exposed") return;
      remember(); s.hint = true; break;
    case "shieldOk":
      if (s.step !== "case" || s.phase !== "exposed") return;
      remember(); s.phase = "praised"; break;
    case "nextEvidence":
      if (s.step !== "case" || s.phase !== "praised" || s.idx >= LAST) return;
      advance(); break;
    case "verdict":
      if (s.step !== "case" || s.phase !== "praised" || s.idx < LAST) return;
      remember(); s.step = "verdict"; s.open = TRICKS.map(t => t.id); verdictNext = true; break;
    case "restart": {
      remember();
      const h = s.history;
      state = freshState(s.sound); state.rev = s.rev; state.history = h;
      break;
    }
    default: return;
  }
  commit();
  schedule();
}

function resetEvidence() {
  const s = state;
  s.phase = "ask"; s.doubt = false; s.named = null; s.stamps = []; s.hint = false;
}

function expose(named) {
  const s = state, ev = EVIDENCE[s.idx];
  s.named = named;
  s.stamps = ev.combo ? [...ev.comboTricks] : [named];
  for (const id of s.stamps) if (!s.open.includes(id)) s.open.push(id);
  s.phase = "exposed"; s.doubt = false; s.hint = false;
  stampNext = true;
}

function advance() {
  clearTimeout(autoTimer); autoTimer = null;
  if (state.step !== "case" || state.phase !== "praised" || state.idx >= LAST) return;
  state.idx++;
  resetEvidence();
  commit();
}

// Після похвали — автоматично наступний доказ (крім останнього).
let autoTimer = null;
function schedule() {
  clearTimeout(autoTimer); autoTimer = null;
  if (state.step === "case" && state.phase === "praised" && state.idx < LAST) {
    autoTimer = setTimeout(advance, reduced ? 1500 : 2600);
  }
}

function back() {
  const h = state.history;
  if (!h.length) return;
  clearTimeout(autoTimer); autoTimer = null;
  let prev = JSON.parse(h.pop());
  // Похвалу проміжного доказу пропускаємо, бо з неї гра сама йде далі.
  while (prev.step === "case" && prev.phase === "praised" && prev.idx < LAST && h.length) prev = JSON.parse(h.pop());
  const sound = state.sound, rev = state.rev;
  state = Object.assign(freshState(), prev, { history: h, sound, rev });
  if (state.step === "case" && state.phase === "praised" && state.idx < LAST) state.phase = "exposed";
  commit();
}

function next() {
  const s = state;
  if (s.step === "intro") return exec("start", {});
  if (s.step !== "case") return;
  if (s.phase === "ask") return exec("toChoose", {});
  if (s.phase === "choose") return exec("reveal", {});
  if (s.phase === "exposed") return exec("shieldOk", {});
  if (s.phase === "praised") return s.idx < LAST ? advance() : exec("verdict", {});
}

/* ---------------- Звук (WebAudio, без файлів) ---------------- */
const audio = (() => {
  let ctx = null;
  const get = () => {
    if (!state.sound) return null;
    try {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch (_) { return null; }
    return ctx;
  };
  const tone = (freq, start, dur, vol = .15, type = "sine", to = null) => {
    const a = get(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type;
    const t = a.currentTime + start;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .01);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + .05);
  };
  const thud = start => { tone(140, start, .25, .4, "sine", 50); tone(900, start, .05, .08, "square", 200); };
  return {
    unlock: () => { get(); },
    stamp: n => { for (let i = 0; i < n; i++) thud(i * .55 + .3); },
    gavel: () => { for (let i = 0; i < 3; i++) { tone(220, i * .5 + .2, .12, .35, "triangle", 90); tone(1200, i * .5 + .2, .03, .1, "square"); } },
    unstick: () => { tone(300, 1.8, .6, .12, "sawtooth", 1400); [523, 659, 784, 1047].forEach((f, i) => tone(f, 2.3 + i * .12, .5, .12, "triangle")); }
  };
})();
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, () => audio.unlock(), { passive: true }));

/* ---------------- Рендер ---------------- */
let stampNext = false;
let verdictNext = false;
let shownIdx = null;
let shownStamps = "";
let callTimer = null;

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const emojiOf = place => place.split(" ")[0];

function render() {
  for (const v of ["intro", "case", "verdict"]) $("view-" + v).classList.toggle("on", state.step === v);
  if (state.step === "case") renderCase();
  if (state.step === "verdict") renderVerdict();
  if (state.step !== "case") shownIdx = null;
  renderCorner();
}

function evidenceHTML(ev) {
  const t = esc(ev.text);
  switch (ev.format) {
    case "note":
      return `<div class="f-note"><div class="hand">${t}</div><div class="sign">— Л. 🧲</div></div>`;
    case "screenshot":
      return `<div class="f-shot"><div class="bar"><span>⚔️ Чат команди</span><span>🟢 4 онлайн</span></div>
        <div class="msgs">
          <div class="line"><b>Дракон77:</b> хто в рейд? 🐉</div>
          <div class="line"><b>Котик_Ninja:</b> я за, через 5 хв</div>
          <div class="me"><div class="av">${magnetSVG("guilty")}</div><div class="b"><small>Липучка 🧲 · особисто тобі</small>${t}</div></div>
        </div></div>`;
    case "voice": {
      let seed = 7;
      const bars = Array.from({ length: 34 }, (_, i) => { seed = (seed * 37 + 11 + i) % 997; return `<i style="height:${18 + seed % 66}px"></i>`; }).join("");
      return `<div class="f-voice"><div class="vb"><div class="av">${magnetSVG("guilty")}</div><span class="play">▶</span>
        <span class="wave${reduced ? "" : " play"}">${bars}</span><span class="dur">${esc(ev.duration || "0:05")}</span></div>
        <div class="tr"><small>Розшифровка голосового</small>«${t}»</div></div>`;
    }
    case "call":
      return `<div class="f-call"><div class="screen"><div class="ring">${magnetSVG("guilty")}</div>
        <div class="name">Липучка 🧲</div><div class="time" id="call-time">00:23</div>
        <div class="btns"><span>🔇</span><span class="end">📞</span><span>🔊</span></div></div>
        <div class="subs"><div class="lbl">💬 Субтитри розмови</div><div class="cc">${t}</div></div></div>`;
    case "comment":
      return `<div class="f-comment"><div class="top">💬 Чат класу</div>
        <div class="photo">📸 <span>Фото з прогулянки класу</span></div>
        <div class="likes">❤️ 14 · 💬 3 коментарі</div>
        <div class="c"><div class="av">${magnetSVG("guilty")}</div><div class="box">
          <div class="nm">Липучка 🧲</div><div class="tx">${t}</div><div class="meta">щойно · 👍 2 · Відповісти</div></div></div></div>`;
    default:
      return `<div class="f-speech"><div class="scene-ic">${emojiOf(ev.place)}</div><div class="who">${magnetSVG("guilty")}</div>
        <div class="bubble">${t}</div></div>`;
  }
}

function renderCase() {
  const s = state, ev = EVIDENCE[s.idx];
  if (shownIdx !== s.idx) {
    shownIdx = s.idx;
    shownStamps = "";
    $("stamps").innerHTML = "";
    $("ev-num").textContent = `Доказ №${s.idx + 1} з ${EVIDENCE.length}`;
    $("ev-place").textContent = ev.place;
    $("ev-ctx").textContent = ev.context;
    const body = $("ev-body");
    body.innerHTML = evidenceHTML(ev);
    body.classList.remove("enter"); void body.offsetWidth; body.classList.add("enter");
    clearInterval(callTimer);
    if (ev.format === "call") {
      let sec = 23;
      callTimer = setInterval(() => {
        const el = $("call-time"); if (!el) return clearInterval(callTimer);
        sec++; el.textContent = `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
      }, 1000);
    }
  }

  // Печатки
  const sig = s.stamps.join(",");
  if (sig !== shownStamps) {
    shownStamps = sig;
    const small = s.stamps.length > 1;
    $("stamps").innerHTML = s.stamps.map((id, i) => {
      const t = trickById(id);
      return `<div class="stamp${small ? " small s" + i : ""}" style="background:${colorOf(t)}"><div class="k">Викрито:</div><div class="v">${esc(t.name.replace(/[«»]/g, ""))}</div></div>`;
    }).join("");
    if (stampNext && s.stamps.length) {
      stampNext = false;
      audio.stamp(s.stamps.length);
      const card = $("ev-card");
      s.stamps.forEach((_, i) => setTimeout(() => { card.classList.remove("thud"); void card.offsetWidth; card.classList.add("thud"); }, reduced ? 0 : 380 + i * 550));
    }
  }
  const showWhy = s.phase === "exposed" || s.phase === "praised";
  const whyHTML = showWhy ? `<div class="why">📌 ${esc(ev.why)}</div>` : "";
  if ($("ev-why").dataset.h !== whyHTML) { $("ev-why").innerHTML = whyHTML; $("ev-why").dataset.h = whyHTML; }

  // Плашки
  const p = [];
  if (s.phase === "ask" || s.phase === "choose") {
    p.push(`<div class="plq ask">🔍 Слідчі, який прийом використала Липучка?<small>Відповідайте голосом!</small></div>`);
    if (s.doubt) p.push(`<div class="plq doubt">🤔 Суд сумнівається… Ще версії?</div>`);
  } else if (s.phase === "exposed") {
    if (ev.combo) p.push(`<div class="plq combo">КОМБО! Три прийоми одразу 🤯</div>`);
    if (s.hint) {
      const t = trickById(s.named) || trickById(ev.trick);
      p.push(`<div class="plq hint">🛡 «${esc(t.shield)}»<small>Щит від прийому ${esc(t.name)}</small></div>`);
    } else {
      p.push(`<div class="plq shield">🛡 Захиснику, ваша відповідь-щит!<small>Спокійне «ні» — без суперечки й довгих пояснень.</small></div>`);
    }
  } else if (s.phase === "praised") {
    p.push(`<div class="plq praise">👍 Щит спрацював!<small>${s.idx < LAST ? "Наступний доказ…" : "Суд готується винести вирок…"}</small></div>`);
  }
  const ph = p.join("");
  if ($("plaques").dataset.h !== ph) { $("plaques").innerHTML = ph; $("plaques").dataset.h = ph; }
  $("plaques").classList.toggle("two", p.length > 1);

  renderBoard();
  const w = s.open.length / TRICKS.length;
  $("bench-mag").style.setProperty("--w", String(w));
  const mood = s.phase === "praised" || s.phase === "exposed" ? "sad" : "guilty";
  const mh = `<div>${magnetSVG(mood)}</div>`;
  if ($("bench-mag").dataset.h !== mh) { $("bench-mag").innerHTML = mh; $("bench-mag").dataset.h = mh; }
}

let boardBuilt = false;
let prevOpen = null;
function renderBoard() {
  const box = $("board");
  if (!boardBuilt) {
    box.innerHTML = TRICKS.map(t => `<div class="tcard" data-id="${t.id}"><div class="in">
      <div class="front">?</div>
      <div class="back" style="background:${colorOf(t)}"><div class="ic">${t.icon}</div><div class="nm">${esc(t.name)}</div><div class="how">${esc(t.how)}</div></div>
    </div></div>`).join("");
    boardBuilt = true;
  }
  const open = new Set(state.open);
  box.querySelectorAll(".tcard").forEach(c => {
    const was = c.classList.contains("open");
    const now = open.has(c.dataset.id);
    c.classList.toggle("open", now);
    if (now && !was && prevOpen !== null) { c.classList.add("fresh"); setTimeout(() => c.classList.remove("fresh"), 2500); }
  });
  const cnt = $("counter");
  const txt = `Викрито: ${open.size} з ${TRICKS.length}`;
  if (cnt.textContent !== txt) {
    cnt.textContent = txt;
    if (prevOpen !== null) { cnt.classList.remove("pop"); void cnt.offsetWidth; cnt.classList.add("pop"); }
  }
  prevOpen = open.size;
}

let verdictBuilt = false;
function renderVerdict() {
  if (!verdictBuilt) {
    $("v-owl").innerHTML = owlSVG();
    $("gavel").innerHTML = gavelSVG();
    $("shields").innerHTML = TRICKS.map((t, i) => `<div class="shcard" style="background:${colorOf(t)};animation-delay:${2 + i * .15}s">
      <div class="nm">${t.icon} ${esc(t.name)}</div><div class="sh">🛡 «${esc(t.shield)}»</div></div>`).join("");
    verdictBuilt = true;
  }
  $("v-mag").innerHTML = magnetSVG("happy");
  const g = $("gavel"), m = $("v-mag");
  if (verdictNext) {
    verdictNext = false;
    g.classList.remove("knock"); void g.offsetWidth; g.classList.add("knock");
    m.classList.remove("fly"); void m.offsetWidth; m.classList.add("fly");
    audio.gavel(); audio.unstick();
    setTimeout(confetti, reduced ? 0 : 2300);
  } else {
    m.classList.add("fly"); // після перезавантаження Липучка вже відлетіла
  }
}

function renderCorner() {
  const connected = Date.now() - lastPing < 6000;
  $("pult-dot").classList.toggle("on", connected);
  $("corner-hint").classList.toggle("on", !firebaseEnabled && !connected);
  if (firebaseEnabled && room) {
    const url = new URL(`pult.html?room=${room}`, location.href).href;
    const html = `Код кімнати для пульта на телефоні:<div class="room-code">${room}</div><a href="${esc(url)}" target="sprava-pult">${esc(url)}</a>`;
    if ($("pop-room").dataset.h !== html) { $("pop-room").innerHTML = html; $("pop-room").dataset.h = html; }
  }
}
$("pult-link").addEventListener("click", e => { e.stopPropagation(); $("pult-pop").classList.toggle("on"); });
addEventListener("click", e => { if (!e.target.closest(".corner")) $("pult-pop").classList.remove("on"); });

function confetti() {
  if (reduced) return;
  const box = $("confetti");
  const colors = ["#2B4BF2", "#FFC629", "#F0432E", "#14998F", "#F5A9C6", "#86B04A"];
  let html = "";
  for (let i = 0; i < 150; i++) {
    html += `<i style="left:${Math.random() * 1920}px;background:${colors[i % colors.length]};animation-duration:${2.2 + Math.random() * 2.5}s;animation-delay:${Math.random() * 1.2}s"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => { box.innerHTML = ""; }, 6500);
}

/* ---------------- Клавіші-дублери ---------------- */
addEventListener("keydown", e => {
  const k = e.key;
  if (k === "f" || k === "F" || k === "а" || k === "А") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
    return;
  }
  if (k === "Escape") { $("pult-pop").classList.remove("on"); if (state.step !== "intro") exec("restart", {}); return; }
  if (k === " " || e.code === "Space") { e.preventDefault(); next(); return; }
  if (/^[1-6]$/.test(k)) exec("guess", { id: TRICKS[+k - 1].id });
});

/* ---------------- Масштаб ---------------- */
function fit() {
  const w = innerWidth, h = innerHeight;
  const sc = Math.min(w / 1920, h / 1080);
  $("stage").style.transform = `translate(${(w - 1920 * sc) / 2}px, ${(h - 1080 * sc) / 2}px) scale(${sc})`;
}
addEventListener("resize", fit);
fit();

$("intro-owl").innerHTML = owlSVG();
$("intro-mag").innerHTML = magnetSVG("guilty");

render();
sendState();
schedule();
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("no-anim")));
