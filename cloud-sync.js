/* Cloudové ukládání (Supabase) — bez knihoven, jen fetch.
 *
 * - Anonymní přihlášení: hráč se nic nezadává, účet vznikne automaticky a
 *   drží se v localStorage (klíč CLOUD_SESSION_KEY). Smazání dat prohlížeče
 *   = ztráta přístupu k cloudovému savu (později jde přidat e-mail).
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
    if (!res.ok) throw new Error(`auth ${res.status}`);
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
    session = await authRequest("signup", {}); // anonymní účet
    writeSession(session);
    return session;
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
