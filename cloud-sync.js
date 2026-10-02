/* Cloudové ukládání (Supabase) — bez knihoven, jen fetch.
 *
 * - Přihlášení e-mailem + heslem (účty zakládá jen majitel v dashboardu,
 *   veřejná registrace je vypnutá). Session je v localStorage (CLOUD_SESSION_KEY).
 * - Přihlašovací brána (loadApp) načte app.js až po přihlášení. Je to jen UI
 *   brána: statické soubory samy jsou veřejné, chráněná jsou DATA (RLS).
 * - Tabulka `saves` (1 řádek na hráče) je chráněná RLS: každý vidí jen svůj.
 * - localStorage zůstává primární uložiště; cloud je záloha/synchronizace.
 *   Když cloud selže, hra běží dál beze změny.
 * - Používá se POUZE veřejný publishable klíč. Nikdy secret/service_role.
 */
const CLOUD_CONFIG = {
  url: "https://wwvlhfsfumtnwjlxhuwm.supabase.co",
  publishableKey: "sb_publishable_5zS5IBZWw-I3pPLEiVuDXQ_zGOTvZyT",
  pushDelayMs: 8000,
};
const CLOUD_SESSION_KEY = "idle-rpg-cloud-session";

const cloudSync = (() => {
  const params = new URLSearchParams(location.search);
  // Automatické testy (Playwright) a ?nocloud cloud nepoužívají.
  const enabled = !params.has("nocloud") && (!navigator.webdriver || params.has("cloud"));
  // Přihlašovací brána: vypnutá jen při lokálním vývoji (localhost) a v automatických testech.
  const devHost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
  const gated = !devHost && !(navigator.webdriver && !params.has("cloud"));
  let session = null;
  let timer = null;
  let pending = null;
  let status = enabled ? "init" : "off";
  const listeners = [];
  const setStatus = (value) => { status = value; listeners.forEach((fn) => fn(value)); };

  function readSession() { try { return JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY)); } catch { return null; } }
  function writeSession(value) { try { localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(value)); } catch { /* ignore */ } }

  async function authRequest(path, body) {
    const res = await fetch(`${CLOUD_CONFIG.url}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: CLOUD_CONFIG.publishableKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) { const err = new Error(`auth ${res.status}`); err.status = res.status; throw err; }
    const data = await res.json();
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000, userId: data.user?.id };
  }

  async function ensureSession() {
    session = session ?? readSession();
    if (session && session.expiresAt > Date.now()) return session;
    if (session?.refreshToken) {
      try { session = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refreshToken }); writeSession(session); return session; }
      catch { session = null; }
    }
    throw new Error("not signed in");
  }

  async function signIn(email, password) {
    session = await authRequest("token?grant_type=password", { email, password });
    writeSession(session);
    return session;
  }

  function signOut() {
    session = null; pending = null;
    try { localStorage.removeItem(CLOUD_SESSION_KEY); } catch { /* ignore */ }
    location.reload();
  }

  // Vrací true, pokud je platná session (obnoví ji přes refresh token).
  async function hasSession() {
    try { await ensureSession(); return true; } catch { return false; }
  }

  async function rest(method, query, body, extraHeaders = {}) {
    const s = await ensureSession();
    const res = await fetch(`${CLOUD_CONFIG.url}/rest/v1/saves${query}`, {
      method,
      headers: { apikey: CLOUD_CONFIG.publishableKey, Authorization: `Bearer ${s.accessToken}`, "Content-Type": "application/json", ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`rest ${res.status}`);
    return res.status === 204 ? null : res.json();
  }

  async function pushNow() {
    if (!enabled || !pending) return;
    const payload = pending; pending = null; clearTimeout(timer); timer = null;
    try {
      const s = await ensureSession();
      await rest("POST", "?on_conflict=user_id", { user_id: s.userId, data: payload, version: payload.version, updated_at: new Date().toISOString() },
        { Prefer: "resolution=merge-duplicates,return=minimal" });
      setStatus("ok");
    } catch { pending = pending ?? payload; setStatus("error"); }
  }

  return {
    get status() { return status; },
    gated, signIn, signOut, hasSession,
    onStatus(fn) { listeners.push(fn); },
    schedulePush(payload) {
      if (!enabled) return;
      pending = payload;
      if (!timer) timer = setTimeout(pushNow, CLOUD_CONFIG.pushDelayMs);
    },
    flush: pushNow,
    // Vrátí cloudový save, nebo null (žádný / chyba).
    async pull() {
      if (!enabled) return null;
      try {
        const s = await ensureSession();
        const rows = await rest("GET", `?user_id=eq.${s.userId}&select=data`);
        setStatus("ok");
        return rows?.[0]?.data ?? null;
      } catch { setStatus("error"); return null; }
    },
    async remove() {
      if (!enabled) return;
      pending = null; clearTimeout(timer); timer = null;
      try { const s = await ensureSession(); await rest("DELETE", `?user_id=eq.${s.userId}`); } catch { /* ignore */ }
    },
  };
})();

document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") cloudSync.flush(); });
window.addEventListener("pagehide", () => cloudSync.flush());

// ---- Přihlašovací brána ----------------------------------------------------
(function loadApp() {
  const appSrc = document.currentScript?.dataset.app ?? "app.js";
  const start = () => {
    const el = document.createElement("script");
    el.src = appSrc; el.async = false;
    document.body.appendChild(el);
    if (cloudSync.gated) addLogout();
  };
  function addLogout() {
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = "Odhlásit";
    btn.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:50;padding:4px 10px;font:12px system-ui,sans-serif;opacity:.55;cursor:pointer;border-radius:6px;border:1px solid #555;background:#1b1b22;color:#ddd";
    btn.addEventListener("click", () => cloudSync.signOut());
    document.body.appendChild(btn);
  }
  function showLogin() {
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#0f0f14;font-family:system-ui,sans-serif;color:#e8e8ee";
    box.innerHTML = `<form style="display:grid;gap:12px;width:min(320px,88vw);padding:24px;border-radius:12px;background:#1b1b22;border:1px solid #33333f">
      <h1 style="margin:0;font-size:20px">Idle RPG</h1>
      <p style="margin:0;font-size:13px;opacity:.7">Soukromý prototyp. Přihlas se.</p>
      <input name="email" type="email" autocomplete="username" placeholder="E-mail" required style="padding:10px;border-radius:8px;border:1px solid #444;background:#0f0f14;color:inherit">
      <input name="password" type="password" autocomplete="current-password" placeholder="Heslo" required style="padding:10px;border-radius:8px;border:1px solid #444;background:#0f0f14;color:inherit">
      <button type="submit" style="padding:10px;border-radius:8px;border:0;background:#5b7cfa;color:#fff;font-weight:600;cursor:pointer">Přihlásit</button>
      <p class="msg" role="alert" style="margin:0;min-height:1.2em;font-size:13px;color:#ff8a8a"></p></form>`;
    document.body.appendChild(box);
    const form = box.querySelector("form"), msg = box.querySelector(".msg"), btn = box.querySelector("button");
    form.addEventListener("submit", async (event) => {
      event.preventDefault(); btn.disabled = true; msg.textContent = "";
      try {
        await cloudSync.signIn(form.email.value.trim(), form.password.value);
        box.remove(); start();
      } catch (err) {
        msg.textContent = err.status === 400 || err.status === 401 ? "Nesprávný e-mail nebo heslo." : "Přihlášení se nepodařilo, zkus to znovu.";
        btn.disabled = false;
      }
    });
    form.email.focus();
  }
  const run = async () => {
    if (!cloudSync.gated) return start();
    if (await cloudSync.hasSession()) return start();
    showLogin();
  };
  if (document.body) run(); else document.addEventListener("DOMContentLoaded", run);
})();
