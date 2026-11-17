// Транспорт між екраном гри і пультом.
// 1) BroadcastChannel — завжди (дві вкладки в одному браузері).
// 2) Firebase Realtime Database через REST + Server-Sent Events — якщо задано config.js.
//    rooms/{code}/out  — пише екран (state, beat), читає пульт
//    rooms/{code}/in   — пише пульт (cmds, ping), читає екран
import { CHANNEL_NAME } from "./scenarios.js";
import { FIREBASE, ROOM_TTL_HOURS } from "./config.js";

export const firebaseEnabled = !!(FIREBASE && FIREBASE.databaseURL);

const dbBase = () => FIREBASE.databaseURL.replace(/\/+$/, "");

function setAt(obj, path, value) {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return value;
  let o = obj && typeof obj === "object" ? obj : {};
  const root = o;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = {};
    o = o[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (value === null) delete o[last]; else o[last] = value;
  return root;
}

// Слухає вузол бази і тримає його дзеркало.
function listen(path, onChange) {
  let mirror = null;
  let es = null;
  let closed = false;
  const open = () => {
    if (closed) return;
    es = new EventSource(`${dbBase()}/${path}.json`);
    const apply = (e, patch) => {
      try {
        const { path: p, data } = JSON.parse(e.data);
        if (patch) {
          for (const [k, v] of Object.entries(data || {})) mirror = setAt(mirror, `${p}/${k}`, v);
        } else {
          mirror = setAt(mirror, p, data);
        }
        onChange(mirror || {});
      } catch (_) { /* ігноруємо */ }
    };
    es.addEventListener("put", e => apply(e, false));
    es.addEventListener("patch", e => apply(e, true));
    es.addEventListener("cancel", () => { es.close(); setTimeout(open, 3000); });
    es.onerror = () => { /* EventSource перепідключається сам */ };
  };
  open();
  return () => { closed = true; es && es.close(); };
}

function req(method, path, body) {
  return fetch(`${dbBase()}/${path}.json`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: true
  }).catch(() => null);
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * role: "screen" | "pult"
 * onMessage(msg): msg.type = state | beat | hello | ping | cmd
 */
export function createLink(role, onMessage) {
  let bc = null;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = e => e.data && onMessage(e.data, "bc");
  } catch (_) { bc = null; }

  let room = null;
  let stopListen = null;
  let statePending = null;
  let stateTimer = null;
  const seenCmds = new Set();

  function setRoom(code) {
    if (stopListen) { stopListen(); stopListen = null; }
    room = null;
    if (!firebaseEnabled || !/^\d{4}$/.test(code || "")) return;
    room = code;
    if (role === "screen") {
      req("PUT", `rooms/${room}/expires`, Date.now() + ROOM_TTL_HOURS * 3600e3);
      stopListen = listen(`rooms/${room}/in`, data => {
        if (data.ping) onMessage({ type: "ping", t: data.ping }, "fb");
        const cmds = data.cmds || {};
        for (const [key, cmd] of Object.entries(cmds)) {
          if (seenCmds.has(key)) continue;
          seenCmds.add(key);
          onMessage(cmd, "fb");
          req("DELETE", `rooms/${room}/in/cmds/${key}`);
        }
      });
    } else {
      stopListen = listen(`rooms/${room}/out`, data => {
        if (data.state) onMessage({ type: "state", state: data.state }, "fb");
        if (data.beat) onMessage({ type: "beat", t: data.beat }, "fb");
      });
    }
  }

  function send(msg) {
    if (bc) { try { bc.postMessage(msg); } catch (_) {} }
    if (!room) return;
    if (role === "screen") {
      if (msg.type === "state") {
        statePending = msg.state;
        if (!stateTimer) stateTimer = setTimeout(() => {
          stateTimer = null;
          req("PUT", `rooms/${room}/out/state`, statePending);
        }, 120);
      } else if (msg.type === "beat") {
        req("PUT", `rooms/${room}/out/beat`, Date.now());
      }
    } else {
      if (msg.type === "cmd") req("POST", `rooms/${room}/in/cmds`, msg);
      else if (msg.type === "ping") req("PUT", `rooms/${room}/in/ping`, Date.now());
    }
  }

  // Прибирання прострочених кімнат (best effort, потрібен .indexOn у правилах).
  async function cleanupRooms() {
    if (!firebaseEnabled) return;
    try {
      const r = await fetch(`${dbBase()}/rooms.json?orderBy=%22expires%22&endAt=${Date.now()}&limitToFirst=50`);
      if (!r.ok) return;
      const data = await r.json();
      for (const code of Object.keys(data || {})) if (code !== room) req("DELETE", `rooms/${code}`);
    } catch (_) {}
  }

  return { send, setRoom, cleanupRooms, get room() { return room; } };
}
