// Екран гри — джерело стану. Кожна зміна → повний знімок у канал.
import { SCENARIOS, getScenario, magnetSVG, msgPreview } from "./scenarios.js";
import { createLink, firebaseEnabled } from "./sync.js";

const LS_STATE = "lypuchka:state";
const LS_DONE = "lypuchka:done";
const LS_ROOM = "lypuchka:room";
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);

/* ---------------- Стан ---------------- */
function freshChat(sid) {
  return {
    sid, uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), round: 0, phase: "idle", // idle | typing | await | answered | freeze | released
    msgs: [], seq: 0, defender: 1, off: 0, grabIdx: 0,
    pending: [], afterSeq: null, typing: false, feedback: null
  };
}
function freshState() {
  return { v: 1, rev: 0, view: "list", chat: null, done: [], sound: false,
    partB: { sid: SCENARIOS[0].id, active: 0, rewrites: {} } };
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

let state = freshState();
try {
  const saved = JSON.parse(lsGet(LS_STATE) || "null");
  if (saved && saved.v === 1) state = Object.assign(freshState(), saved);
} catch (_) {}
try {
  const done = JSON.parse(lsGet(LS_DONE) || "[]");
  if (Array.isArray(done)) state.done = done.filter(id => getScenario(id));
} catch (_) {}
if (state.chat && !getScenario(state.chat.sid)) state.chat = null;

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

function sendState() { link.send({ type: "state", state }); }

function commit() {
  state.rev++;
  lsSet(LS_STATE, JSON.stringify(state));
  lsSet(LS_DONE, JSON.stringify(state.done));
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
function exec(cmd, arg) {
  const c = state.chat;
  switch (cmd) {
    case "openList": state.view = "list"; break;
    case "openChat": {
      if (!getScenario(arg.sid)) return;
      if (!c || c.sid !== arg.sid || arg.restart) { stopRunner(); state.chat = freshChat(arg.sid); }
      state.view = "chat";
      break;
    }
    case "start": return startRound();
    case "skip": return skipTyping();
    case "answer": return answer(String(arg.text || "").trim());
    case "classify": return classify(arg.kind);
    case "rewind": return rewind();
    case "sound": state.sound = !!arg.on; if (state.sound) audio.unlock(); break;
    case "newLesson": {
      stopRunner();
      const sound = state.sound;
      state = Object.assign(freshState(), { rev: state.rev, sound });
      break;
    }
    case "pb.open": {
      if (getScenario(arg.sid)) {
        if (state.partB.sid !== arg.sid) state.partB.active = 0;
        state.partB.sid = arg.sid;
      }
      state.view = "edit";
      break;
    }
    case "pb.active": state.partB.active = arg.idx | 0; break;
    case "pb.save": {
      const text = String(arg.text || "").trim();
      const key = `${state.partB.sid}|${arg.idx | 0}`;
      if (text) state.partB.rewrites[key] = text; else delete state.partB.rewrites[key];
      state.partB.active = arg.idx | 0;
      state.view = "edit";
      break;
    }
    case "pb.clear": delete state.partB.rewrites[`${state.partB.sid}|${arg.idx | 0}`]; break;
    default: return;
  }
  commit();
}

function scen() { return state.chat && getScenario(state.chat.sid); }

function startRound() {
  const c = state.chat, s = scen();
  if (!c || state.view !== "chat" || c.phase !== "idle") return;
  const r = s.rounds[c.round];
  const items = [{ type: "sys", t: `Раунд ${c.round + 1} · ${r.label}` }];
  for (const m of r.msgs) {
    if (m.type === "burst") m.t.forEach((t, i) => items.push({ type: "text", t, fast: i > 0, burstMore: i > 0 }));
    else items.push({ ...m });
  }
  c.feedback = null;
  queue(items, "await");
}

function queue(items, after) {
  const c = state.chat;
  c.pending = items;
  c.afterSeq = after;
  c.phase = "typing";
  commit();
  runQueue();
}

let runner = null;
function stopRunner() { if (runner) { clearTimeout(runner); runner = null; } }

function runQueue() {
  const c = state.chat;
  if (runner || !c || c.phase !== "typing") return;
  if (!c.pending.length) return seqDone();
  if (reduced) return skipTyping();
  const next = c.pending[0];
  if (next.type === "sys") {
    runner = setTimeout(() => { runner = null; showNext(); }, 250);
    return;
  }
  c.typing = true;
  commit();
  audio.typing();
  const delay = next.fast ? 450 + Math.random() * 350 : 800 + Math.random() * 700;
  runner = setTimeout(() => { runner = null; showNext(); }, delay);
}

function showNext() {
  const c = state.chat;
  if (!c || c.phase !== "typing") return;
  const m = c.pending.shift();
  if (m) pushMsg(m);
  c.typing = false;
  if (m && m.type !== "sys") audio.blip();
  if (c.pending.length) { commit(); runQueue(); } else seqDone();
}

function skipTyping() {
  const c = state.chat;
  if (!c || c.phase !== "typing") return;
  stopRunner();
  let any = false;
  while (c.pending.length) { const m = c.pending.shift(); pushMsg(m); if (m.type !== "sys") any = true; }
  c.typing = false;
  if (any) audio.blip();
  seqDone();
}

function pushMsg(m) {
  const c = state.chat;
  const { fast, ...rest } = m;
  c.msgs.push({ id: ++c.seq, from: m.type === "sys" ? "sys" : "ly", ...rest });
}

function seqDone() {
  const c = state.chat;
  stopRunner();
  c.typing = false;
  c.pending = [];
  if (c.afterSeq === "release") {
    c.phase = "released";
    if (!state.done.includes(c.sid)) state.done.push(c.sid);
    celebrateNext = true;
    audio.chime();
  } else {
    c.phase = "await";
  }
  c.afterSeq = null;
  commit();
}

function answer(text) {
  const c = state.chat;
  if (!c || state.view !== "chat" || !text) return;
  if (c.phase === "await") {
    c.msgs.push({ id: ++c.seq, from: "kid", t: text, defender: c.defender, read: false });
    c.phase = "answered";
  } else if (c.phase === "answered") {
    const last = lastKid();
    if (last) last.t = text;
  } else return;
  commit();
}

function lastKid() {
  const c = state.chat;
  for (let i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].from === "kid") return c.msgs[i];
  return null;
}

function classify(kind) {
  const c = state.chat, s = scen();
  if (!c || state.view !== "chat") return;
  if (!["green", "blue", "yellow", "red"].includes(kind)) return;
  if (c.phase !== "await" && c.phase !== "answered") return;
  if (c.phase === "await") {
    c.msgs.push({ id: ++c.seq, from: "kid", t: "🎙️ Відповідь голосом", defender: c.defender, read: false, voice: true });
  }
  const kid = lastKid();
  if (kind === "green" || kind === "blue") {
    kid.read = true;
    c.off = Math.min(4, c.round + 1);
    c.feedback = kind;
    c.defender++;
    if (c.round < s.rounds.length - 1) {
      c.round++;
      c.phase = "idle";
      commit();
    } else {
      queue([{ type: "text", t: s.release }], "release");
    }
  } else if (kind === "yellow") {
    kid.read = true;
    c.feedback = "yellow";
    c.defender++;
    const g = s.grab[c.grabIdx % s.grab.length];
    c.grabIdx++;
    queue([{ type: "text", t: g, grab: true }], "await");
  } else {
    c.phase = "freeze";
    c.feedback = null;
    snapNext = true;
    commit();
  }
}

function rewind() {
  const c = state.chat;
  if (!c || c.phase !== "freeze") return;
  const kid = lastKid();
  if (kid) c.msgs = c.msgs.filter(m => m !== kid);
  c.phase = "await";
  commit();
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
  const tone = (freq, start, dur, vol = .12, type = "sine") => {
    const a = get(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = freq;
    const t = a.currentTime + start;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + .02);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t); o.stop(t + dur + .05);
  };
  return {
    unlock: () => { get(); },
    blip: () => { tone(880, 0, .14); tone(1320, .09, .18); },
    typing: () => { for (let i = 0; i < 3; i++) tone(520 + i * 40, i * .12, .05, .04, "triangle"); },
    chime: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .12, .5, .12, "triangle")); }
  };
})();
["pointerdown", "keydown"].forEach(ev => addEventListener(ev, () => audio.unlock(), { passive: true }));

/* ---------------- Рендер ---------------- */
let celebrateNext = false;
let snapNext = false;
let shownChatSid = null;
let prevOff = null;

function render() {
  for (const v of ["list", "chat", "edit"]) $("view-" + v).classList.toggle("on", state.view === v);
  if (state.view === "list") renderList();
  if (state.view === "chat" && state.chat) renderChat();
  if (state.view === "edit") renderEdit();
  renderCorner();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function renderList() {
  const grid = $("chat-grid");
  grid.innerHTML = SCENARIOS.map(s => {
    const done = state.done.includes(s.id);
    return `<div class="chat-card${done ? " done" : ""}" data-sid="${s.id}">
      <div class="ava">${magnetSVG(done ? "happy" : "sly")}<span class="ic">${s.icon}</span></div>
      <div class="card-title">${esc(s.title)}</div>
      <span class="place-pill">${esc(s.place)}</span>
      <div class="card-preview">${esc(msgPreview(s.rounds[0].msgs[0]))}</div>
      <span class="card-badge">${done ? "✓ відклеїлась" : s.rounds.length + " нових"}</span>
    </div>`;
  }).join("");
}
$("chat-grid").addEventListener("click", e => {
  const card = e.target.closest(".chat-card");
  if (card) exec("openChat", { sid: card.dataset.sid });
});

function renderChat() {
  const c = state.chat, s = scen();
  const fresh = shownChatSid !== (c.uid || c.sid);
  if (fresh) {
    $("msgs").innerHTML = "";
    shownChatSid = c.uid || c.sid;
    prevOff = c.off;
    const bm = $("big-magnet");
    bm.classList.remove("fly", "snap");
    $("confetti").innerHTML = "";
  }
  $("ctx-place").textContent = s.place;
  $("ctx-text").textContent = "📱 " + s.context;
  const tm = s.place.match(/\d{1,2}:\d{2}/);
  const now = new Date();
  $("ph-time").textContent = tm ? tm[0] : `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;

  // Шкала
  document.querySelectorAll("#meter .seg").forEach(seg => {
    const i = +seg.dataset.i;
    const off = i >= 4 - c.off;
    if (off && !seg.classList.contains("off") && prevOff !== null && !fresh) {
      seg.classList.add("pop");
      setTimeout(() => seg.classList.remove("pop"), 700);
    }
    seg.classList.toggle("off", off);
  });
  prevOff = c.off;
  const roundNo = Math.min(c.round + 1, s.rounds.length);
  $("round-pill").textContent = c.phase === "released"
    ? `Усі ${s.rounds.length} раунди пройдено`
    : `Раунд ${roundNo} з ${s.rounds.length} · ${s.rounds[c.round].label}`;

  // Магніт
  const bm = $("big-magnet");
  const mood = c.phase === "freeze" ? "happy" : c.off >= 3 ? "sad" : c.off >= 2 ? "wow" : "sly";
  bm.innerHTML = magnetSVG(mood);
  bm.style.setProperty("--away", `${-c.off * 70}px`);
  bm.classList.toggle("wiggle", c.phase === "typing" && !reduced);
  $("field").style.opacity = String(Math.max(0, 1 - c.off * .25));
  if (c.phase === "released") {
    if (celebrateNext) {
      celebrateNext = false;
      bm.classList.add("fly");
      confetti();
      const uid = c.uid;
      setTimeout(() => {
        if (state.chat?.uid !== uid || state.chat.phase !== "released") return;
        bm.style.visibility = "hidden"; $("win-card").classList.add("on");
      }, reduced ? 0 : 1300);
    } else if (!bm.classList.contains("fly")) {
      bm.style.visibility = "hidden";
      $("win-card").classList.add("on");
    }
  } else {
    bm.style.visibility = "";
    bm.classList.remove("fly");
    $("win-card").classList.remove("on");
  }
  if (snapNext) {
    snapNext = false;
    bm.classList.remove("snap"); void bm.offsetWidth; bm.classList.add("snap");
  }

  // Стоп-кадр
  $("freeze").classList.toggle("on", c.phase === "freeze");
  $("view-chat").classList.toggle("frozen", c.phase === "freeze");

  // Шапка телефона
  $("ph-ava").innerHTML = magnetSVG(mood);
  const st = $("ph-state");
  st.classList.toggle("typing", !!c.typing);
  st.innerHTML = c.typing ? "друкує…" : '<i class="online-dot"></i>у мережі';

  renderMsgs(fresh);
  renderFeedback();
}

function msgEl(m) {
  const el = document.createElement("div");
  el.dataset.id = m.id;
  if (m.from === "sys") {
    el.className = "msg sys";
    el.innerHTML = `<span class="sys-pill">${esc(m.t)}</span>`;
    return el;
  }
  if (m.from === "kid") {
    el.className = "msg kid";
    el.innerHTML = `<div class="who">Захисник №${m.defender}</div>
      <div class="bub"><span class="kid-t"></span><span class="ticks${m.read ? " read" : ""}">✓✓</span></div>`;
    el.querySelector(".kid-t").textContent = m.t;
    return el;
  }
  el.className = "msg ly" + (m.burstMore ? " burst-more" : "");
  if (m.type === "voice") {
    let seed = 0;
    for (const ch of m.transcript) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const bars = Array.from({ length: 22 }, (_, i) => {
      seed = (seed * 37 + 11 + i) % 997;
      return `<i style="height:${12 + seed % 38}px"></i>`;
    }).join("");
    el.innerHTML = `<div class="bub voice">
      <div class="voice-row"><span class="voice-play">▶</span><span class="wave">${bars}</span><span class="voice-dur">${esc(m.dur)}</span></div>
      <div class="voice-tr">«${esc(m.transcript)}»</div></div>`;
  } else if (m.type === "sticker") {
    el.innerHTML = `<div class="sticker">${esc(m.t)}</div>`;
  } else {
    el.innerHTML = `<div class="bub">${esc(m.t)}</div>`;
  }
  return el;
}

function renderMsgs(fresh) {
  const box = $("msgs"), c = state.chat;
  const ids = new Set(c.msgs.map(m => String(m.id)));
  box.querySelector(".typing-row")?.remove();
  for (const el of [...box.children]) {
    if (!ids.has(el.dataset.id) && !el.classList.contains("leave")) {
      if (reduced) el.remove();
      else { el.classList.add("leave"); setTimeout(() => el.remove(), 500); }
    }
  }
  for (const m of c.msgs) {
    let el = box.querySelector(`[data-id="${m.id}"]:not(.leave)`);
    if (!el) {
      el = msgEl(m);
      if (!fresh && !reduced) el.classList.add("enter");
      box.appendChild(el);
    } else if (m.from === "kid" && el.querySelector(".kid-t")) {
      el.querySelector(".kid-t").textContent = m.t;
      el.querySelector(".ticks").classList.toggle("read", !!m.read);
    }
  }
  if (c.typing) {
    const t = document.createElement("div");
    t.className = "msg ly typing-row" + (reduced ? "" : " enter");
    t.innerHTML = '<div class="bub typing-bub"><i></i><i></i><i></i></div>';
    box.appendChild(t);
  }
  requestAnimationFrame(() => box.scrollTo({ top: box.scrollHeight, behavior: fresh || reduced ? "auto" : "smooth" }));
}

function renderFeedback() {
  const c = state.chat, s = scen();
  const out = [];
  if (c.phase === "released") {
    if (s.afterRound4Hint) out.push(`<div class="fb alert">🔴 ${esc(s.afterRound4Hint)}</div>`);
  } else {
    if (c.feedback === "green") out.push(`<div class="fb praise"><big>🔁 Платівка спрацювала!</big>Спокійне «ні» — і Липучка слабшає.</div>`);
    if (c.feedback === "blue") out.push(`<div class="fb praise blue"><big>🚶 Класний вихід!</big>Змінити тему чи піти — теж «ні».</div>`);
    if (c.feedback === "yellow") out.push(`<div class="fb warn"><big>📜 Стаття 2: пояснення — за бажанням.</big>Спробуйте коротше!</div>`);
    if (c.phase === "idle") out.push(`<div class="fb turn">🎤 Хто стане захисником №${c.defender}?</div>`);
    if (c.phase === "typing") out.push(`<div class="fb turn">🎤 Захиснику №${c.defender}, приготуйтеся!</div>`);
    if (c.phase === "await") out.push(`<div class="fb turn">🎤 Захиснику №${c.defender}, ваша черга! Відповідайте голосом.</div>`);
    if (c.phase === "answered") out.push(`<div class="fb turn">👀 Липучка читає відповідь…</div>`);
  }
  const html = out.join("");
  const fb = $("feedback");
  if (fb.dataset.html !== html) { fb.innerHTML = html; fb.dataset.html = html; }
}

function renderEdit() {
  const pb = state.partB, s = getScenario(pb.sid) || SCENARIOS[0];
  $("edit-sub").textContent = `Чернетки Липучки з чату «${s.title}». Як переписати їх, щоб вони поважали «ні»?`;
  const drafts = Object.keys(s.rewrite || {});
  const html = drafts.map((orig, i) => {
    const now = pb.rewrites[`${s.id}|${i}`];
    const active = pb.active === i;
    return `<div class="draft${active ? " active" : ""}">
      <div class="draft-top"><div class="ava">${magnetSVG(now ? "happy" : "sly")}</div>
        <div class="draft-label">Чернетка ${i + 1}</div>
        ${now ? '<span class="tag ok">✓ переписано</span>' : active ? '<span class="tag edit">✏️ редагуємо</span>' : ""}</div>
      <div class="was${now ? " struck" : ""}">${now ? '<span class="lbl">було</span> ' : ""}${esc(orig)}</div>
      ${now ? `<div class="arrow">⬇️</div><div class="now"><span class="lbl">стало</span><br>${esc(now)}</div>` : ""}
    </div>`;
  }).join("");
  const box = $("drafts");
  if (box.dataset.html !== html) { box.innerHTML = html; box.dataset.html = html; }
}

function renderCorner() {
  const connected = Date.now() - lastPing < 6000;
  $("pult-dot").classList.toggle("on", connected);
  $("corner-hint").classList.toggle("on", !firebaseEnabled && !connected);
  if (firebaseEnabled && room) {
    const url = new URL(`pult.html?room=${room}`, location.href).href;
    const html = `Код кімнати для пульта на телефоні:<div class="room-code">${room}</div><a href="${esc(url)}" target="lypuchka-pult">${esc(url)}</a>`;
    if ($("pop-room").dataset.html !== html) { $("pop-room").innerHTML = html; $("pop-room").dataset.html = html; }
  }
}

$("pult-link").addEventListener("click", e => { e.stopPropagation(); $("pult-pop").classList.toggle("on"); });
addEventListener("click", e => { if (!e.target.closest(".corner")) $("pult-pop").classList.remove("on"); });

function confetti() {
  if (reduced) return;
  const box = $("confetti");
  const colors = ["#2B4BF2", "#FFC629", "#F0432E", "#14998F", "#F5A9C6", "#86B04A"];
  let html = "";
  for (let i = 0; i < 140; i++) {
    const d = 2.2 + Math.random() * 2.5;
    html += `<i style="left:${Math.random() * 1920}px;background:${colors[i % colors.length]};animation-duration:${d}s;animation-delay:${Math.random() * 1.2}s;transform:rotate(${Math.random() * 360}deg)"></i>`;
  }
  box.innerHTML = html;
  setTimeout(() => { box.innerHTML = ""; }, 6000);
}

/* ---------------- Клавіші-дублери ---------------- */
addEventListener("keydown", e => {
  if (e.target.closest && e.target.closest("input, textarea")) return;
  const k = e.key;
  if (k === "f" || k === "F" || k === "а" || k === "А") {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
    return;
  }
  if (k === "Escape") { $("pult-pop").classList.remove("on"); if (state.view !== "list") exec("openList", {}); return; }
  if (state.view === "list" && /^[1-5]$/.test(k)) { exec("openChat", { sid: SCENARIOS[+k - 1].id }); return; }
  if (state.view !== "chat" || !state.chat) return;
  const map = { "1": "green", "2": "blue", "3": "yellow", "4": "red" };
  if (map[k]) { classify(map[k]); return; }
  if (k === " " || e.code === "Space") {
    e.preventDefault();
    const p = state.chat.phase;
    if (p === "typing") skipTyping();
    else if (p === "idle") startRound();
    else if (p === "freeze") rewind();
  }
});

/* ---------------- Масштаб ---------------- */
function fit() {
  const w = innerWidth, h = innerHeight;
  const s = Math.min(w / 1920, h / 1080);
  $("stage").style.transform = `translate(${(w - 1920 * s) / 2}px, ${(h - 1080 * s) / 2}px) scale(${s})`;
}
addEventListener("resize", fit);
fit();

$("list-mag").innerHTML = magnetSVG("sly");

// Відновлення після перезавантаження
if (state.chat) {
  state.chat.typing = false;
  if (state.chat.phase === "typing") { render(); sendState(); runQueue(); }
}
render();
sendState();
