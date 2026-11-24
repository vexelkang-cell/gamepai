// Deployment refresh: activate the latest shared-bank pagination and fast-read changes.
const OWNER = "vexelkang-cell";
const REPO = "gamepai";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://vexelgamepai.pages.dev";
const CATEGORIES = ["Game Score", "Edukasi", "Petualangan", "Aksi", "Strategy", "Puzzle", "Olahraga", "Multiplayer", "Simulasi", "Layar IFP", "Lainnya"];

function nextJakartaMidnight() {
  const jakartaNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return new Date(Date.UTC(jakartaNow.getUTCFullYear(), jakartaNow.getUTCMonth(), jakartaNow.getUTCDate() + 1, -7, 0, 0)).toISOString();
}

function response(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin"
    }
  });
}

function safeSlug(value) {
  return String(value || "")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48);
}

function utf8Base64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function signSessionPayload(payload, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return base64UrlEncode(mac);
}
async function createAdminSession(secret) {
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({role:"admin",exp:Math.floor(Date.now()/1000)+28800})));
  return payload + "." + await signSessionPayload(payload, secret);
}
async function verifyAdminSession(token, secret) {
  try {
    const parts=String(token||"").split(".");
    if(parts.length!==2)return false;
    const [payload,sig]=parts;
    const expected=await signSessionPayload(payload,secret);
    const x=base64UrlDecode(sig),y=base64UrlDecode(expected);
    if(x.length!==y.length)return false;
    let diff=0; for(let i=0;i<x.length;i++)diff|=x[i]^y[i];
    if(diff)return false;
    const data=JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    return data.role==="admin" && Number(data.exp)>Math.floor(Date.now()/1000);
  } catch { return false; }
}


const ADMIN_EMAIL = "vexelkang@gmail.com";
const FRONTEND_AUTH_REDIRECT = ALLOWED_ORIGIN;

function parseCookies(header) {
  return Object.fromEntries(String(header || "").split(";").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? ["", ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }).filter(([key]) => key));
}
async function createSignedToken(payload, secret) {
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  return encoded + "." + await signSessionPayload(encoded, secret);
}
async function readSignedToken(token, secret) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 2 || !secret) return null;
    const [payload, signature] = parts;
    const expected = await signSessionPayload(payload, secret);
    const a = base64UrlDecode(signature), b = base64UrlDecode(expected);
    if (a.length !== b.length) return null;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    if (diff) return null;
    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (!data.exp || Number(data.exp) <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}
async function verifyGoogleSession(token, secret, requiredRole) {
  const data = await readSignedToken(token, secret);
  return data && data.sub && data.email && (!requiredRole || data.role === requiredRole) ? data : null;
}
function randomString(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(bytes);
}
async function handleGoogleStart(request, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.AUTH_SECRET) {
    return response({ error: "Google OAuth belum dikonfigurasi di Cloudflare Worker." }, 503, ALLOWED_ORIGIN);
  }
  const state = await createSignedToken({
    nonce: randomString(24),
    exp: Math.floor(Date.now() / 1000) + 600
  }, env.AUTH_SECRET);
  const callback = new URL("/auth/google/callback", request.url).toString();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return new Response(null, {
    status: 302,
    headers: {
      "Location": url.toString(),
      "Set-Cookie": "vx_oauth_state=" + state + "; HttpOnly; Secure; SameSite=Lax; Path=/auth/google/callback; Max-Age=600",
      "Cache-Control": "no-store"
    }
  });
}
async function handleGoogleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const cookies = parseCookies(request.headers.get("Cookie"));
  const clearOAuthCookie = "vx_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/google/callback; Max-Age=0";
  const errorRedirect = (reason) => new Response(null, {
    status: 302,
    headers: {
      "Location": FRONTEND_AUTH_REDIRECT + "/?auth_error=" + encodeURIComponent(reason),
      "Set-Cookie": clearOAuthCookie,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer"
    }
  });
  const stateData = await readSignedToken(state, env.AUTH_SECRET);
  if (!code || !stateData || !stateData.nonce || cookies.vx_oauth_state !== state) {
    return errorRedirect("invalid_state");
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.AUTH_SECRET || !env.DB) {
    return errorRedirect("oauth_not_configured");
  }
  const redirectUri = new URL("/auth/google/callback", request.url).toString();
  try {
    // Batasi waktu tunggu ke Google agar callback tidak menggantung tanpa batas.
    const googleTimeout = AbortSignal.timeout(15000);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: googleTimeout,
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error("Google gagal memverifikasi login.");
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
      signal: AbortSignal.timeout(15000)
    });
    const google = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok || !google.sub || !google.email || google.email_verified !== true) {
      throw new Error("Email Google belum terverifikasi.");
    }
    const email = String(google.email).trim().toLowerCase();
    const role = email === ADMIN_EMAIL ? "admin" : "player";
    const now = new Date().toISOString();
    const newUserId = "VX-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase();
    await env.DB.prepare(
      "INSERT INTO users (id,google_sub,email,display_name,avatar_url,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,avatar_url=excluded.avatar_url,role=excluded.role,updated_at=excluded.updated_at"
    ).bind(newUserId, String(google.sub), email, String(google.name || ""), String(google.picture || ""), role, now, now).run();
    const user = await env.DB.prepare(
      "SELECT id,nickname,role FROM users WHERE google_sub=?"
    ).bind(String(google.sub)).first();
    if (!user) throw new Error("Akun belum berhasil disimpan.");
    const session = await createSignedToken({
      sub: String(google.sub),
      email,
      role,
      exp: Math.floor(Date.now() / 1000) + 604800
    }, env.AUTH_SECRET);
    const fragment = new URLSearchParams({
      auth_token: session,
      auth_role: role,
      auth_profile_required: role === "player" && !user.nickname ? "1" : "0"
    });
    return new Response(null, {
      status: 302,
      headers: {
        "Location": FRONTEND_AUTH_REDIRECT + "/#" + fragment.toString(),
        "Set-Cookie": clearOAuthCookie,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer"
      }
    });
  } catch (error) {
    const message = String(error.name === "TimeoutError" || error.name === "AbortError"
      ? "Koneksi ke Google terlalu lama. Silakan coba login kembali."
      : (error.message || "Login Google gagal.")).slice(0, 160);
    return errorRedirect(message);
  }
}

async function githubPut(path, content, token, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const result = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VEXEL-GAMES-Uploader",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content,
      branch: BRANCH
    })
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(data.message || `GitHub API error ${result.status}`);
    error.status = result.status;
    throw error;
  }
  return data;
}


async function githubDelete(path, sha, token, message) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const result = await fetch(url, {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "VEXEL-GAMES-Uploader",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, sha, branch: BRANCH })
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    const error = new Error(data.message || `GitHub API error ${result.status}`);
    error.status = result.status;
    throw error;
  }
  return data;
}


/**
 * VEXEL QUIZ Durable Object.
 * Keeps WebSocket connections for one room and broadcasts authoritative
 * room-change notifications to every connected participant.
 */
export class QuizRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcast" && request.method === "POST") {
      const payload = await request.json().catch(() => ({}));
      const message = JSON.stringify({
        type: "room_update",
        event: String(payload.event || "changed"),
        at: Date.now()
      });
      let delivered = 0;
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(message); delivered++; } catch {}
      }
      return Response.json({ success: true, delivered });
    }

    if (url.pathname === "/connect" && request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      server.send(JSON.stringify({ type: "connected" }));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  webSocketMessage() {}
  webSocketClose() {}
  webSocketError() {}
}

async function advanceQuizRoom() {
  // Progres ROOM VEXEL QUIZ bersifat individual; tidak ada timer
  // maupun perpindahan soal global.
  return false;
}

async function notifyQuizRoom(env, code, event) {
  // Notifikasi realtime bersifat tambahan; kegagalannya tidak boleh membatalkan
  // operasi utama D1 seperti membuat atau memasuki room.
  if (!env.QUIZ_ROOM || !code) return;
  try {
    const id = env.QUIZ_ROOM.idFromName(String(code));
    const stub = env.QUIZ_ROOM.get(id);
    await stub.fetch("https://quiz-room/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event })
    });
  } catch (error) {
    console.error("Quiz room notification failed:", error);
  }
}


const FIREFLY_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const FIREFLY_CATEGORIES = ["DUNIA HEWAN","ALAM","LUAR ANGKASA","SAINS","SEJARAH","TEKNOLOGI","TUBUH MANUSIA","LAUT"];

function jakartaMondayDate(date = new Date()) {
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const weekday = local.getUTCDay();
  local.setUTCDate(local.getUTCDate() - ((weekday + 6) % 7));
  return local.toISOString().slice(0, 10);
}

function parseFireflyJson(result) {
  const raw = typeof result === "string" ? result : (result?.response || result?.output_text || result?.text || "");
  if (typeof raw !== "string" || !raw.trim()) throw new Error("AI tidak mengembalikan teks fakta.");
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const startArray = cleaned.indexOf("[");
  const startObject = cleaned.indexOf("{");
  const start = startArray < 0 ? startObject : startObject < 0 ? startArray : Math.min(startArray, startObject);
  const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
  if (start < 0 || end < start) throw new Error("Format JSON fakta dari AI tidak lengkap.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return Array.isArray(parsed) ? parsed : parsed.facts;
}

async function ensureFireflyTable(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS firefly_facts (
    id TEXT PRIMARY KEY, week_start TEXT NOT NULL, position INTEGER NOT NULL,
    icon TEXT NOT NULL, category TEXT NOT NULL, title TEXT NOT NULL,
    fact_text TEXT NOT NULL, created_at TEXT NOT NULL
  )`).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_firefly_week_position ON firefly_facts(week_start, position)").run();
}

async function generateWeeklyFireflyFacts(env, referenceDate = new Date()) {
  if (!env.DB) throw new Error("Binding D1 DB tidak tersedia.");
  if (!env.AI) throw new Error("Binding Workers AI belum tersedia.");
  await ensureFireflyTable(env);
  const weekStart = jakartaMondayDate(referenceDate);
  const oldRows = await env.DB.prepare("SELECT title FROM firefly_facts ORDER BY position LIMIT 50").all();
  const usedTitles = new Set((oldRows.results || []).map(row => String(row.title || "").toLocaleLowerCase("id-ID").trim()));
  const generated = [];

  for (let batchNumber = 0; batchNumber < 5; batchNumber++) {
    const prompt = [
      "Buat tepat 10 fakta unik dunia dalam bahasa Indonesia untuk portal game keluarga.",
      'Keluarkan JSON valid saja dengan bentuk: {"facts":[{"icon":"emoji","category":"KATEGORI","title":"judul singkat","text":"penjelasan 1-3 kalimat"}]}.',
      "Kategori yang diizinkan: " + FIREFLY_CATEGORIES.join(", ") + ".",
      "Pilih fakta akurat, mapan, menarik, mudah dipahami anak dan orang dewasa. Jangan mengarang angka atau klaim kontroversial. Jika ragu, pilih fakta lain.",
      "Setiap fakta harus berbeda topik dan bukan parafrasa fakta lain.",
      "Jangan gunakan judul yang sudah dipakai: " + [...usedTitles].slice(-100).join(" | "),
      "Ini batch " + (batchNumber + 1) + " dari 5. Kembalikan tepat 10 fakta baru."
    ].join("\n");
    let batchFacts=null, lastError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const aiResult=await env.AI.run(FIREFLY_MODEL,{
          messages:[
            {role:"system",content:"Anda penyusun ensiklopedia populer. Utamakan ketepatan fakta. Keluarkan JSON valid saja."},
            {role:"user",content:prompt}
          ],
          max_tokens:5000,
          temperature:0.65
        });
        const parsed=parseFireflyJson(aiResult);
        if(!Array.isArray(parsed)||parsed.length!==10)throw new Error("AI harus mengembalikan tepat 10 fakta.");
        const cleaned=parsed.map(item=>({
          icon:String(item.icon||"✨").slice(0,12),
          category:String(item.category||"").trim().toUpperCase(),
          title:String(item.title||"").trim().slice(0,140),
          text:String(item.text||"").trim().slice(0,900)
        }));
        if(cleaned.some(item=>!item.title||!item.text||!FIREFLY_CATEGORIES.includes(item.category)))throw new Error("Ada fakta tidak lengkap atau kategori tidak valid.");
        const keys=cleaned.map(item=>item.title.toLocaleLowerCase("id-ID"));
        if(new Set(keys).size!==10||keys.some(key=>usedTitles.has(key)))throw new Error("AI menghasilkan judul fakta duplikat.");
        batchFacts=cleaned;break;
      }catch(error){lastError=error;}
    }
    if(!batchFacts)throw new Error("Pembuatan batch "+(batchNumber+1)+" gagal: "+(lastError?.message||"kesalahan AI"));
    for(const fact of batchFacts){generated.push(fact);usedTitles.add(fact.title.toLocaleLowerCase("id-ID"));}
  }

  if(generated.length!==50)throw new Error("Jumlah fakta tidak tepat 50; data lama dipertahankan.");
  const now=new Date().toISOString();
  const statements=[
    env.DB.prepare("DELETE FROM firefly_facts"),
    ...generated.map((fact,index)=>env.DB.prepare(
      "INSERT INTO firefly_facts (id,week_start,position,icon,category,title,fact_text,created_at) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(crypto.randomUUID(),weekStart,index+1,fact.icon,fact.category,fact.title,fact.text,now))
  ];
  await env.DB.batch(statements);
  return {weekStart,count:generated.length};
}

export default {
  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    const now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM quiz_room_players WHERE room_code IN (SELECT code FROM quiz_rooms WHERE expires_at <= ?)").bind(now).run();
    await env.DB.prepare("DELETE FROM quiz_rooms WHERE expires_at <= ?").bind(now).run();
    const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM quiz_assignment_attempts WHERE assignment_id IN (SELECT id FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?)").bind(archiveCutoff).run();
    await env.DB.prepare("DELETE FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?").bind(archiveCutoff).run();
    // Minggu 17.00 UTC = Senin 00.00 WIB: buat 50 fakta baru.
    if (controller.cron === "0 17 * * 0") {
      const result = await generateWeeklyFireflyFacts(env, new Date(controller.scheduledTime || Date.now()));
      console.log("VEXEL FIREFLY weekly facts refreshed:", JSON.stringify(result));
    }
  },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const pathname = new URL(request.url).pathname;
    const allowed = origin === ALLOWED_ORIGIN;
    // Endpoint baca Bank Soal bersifat publik: izinkan juga akses langsung tanpa header Origin.
    const directBankRead = !origin && request.method === "GET" && pathname === "/quiz/bank";
    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    if (!allowed && !directBankRead && pathname !== "/auth/google/callback" && pathname !== "/auth/google") return response({ error: "Origin tidak diizinkan." }, 403, ALLOWED_ORIGIN);
    const auth = request.headers.get("Authorization") || "";
    const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (pathname === "/auth/google" && request.method === "GET") {
      return handleGoogleStart(request, env);
    }
    if (pathname === "/auth/google/callback" && request.method === "GET") {
      return handleGoogleCallback(request, env);
    }

    // VEXEL FIREFLY: 50 fakta aktif untuk minggu berjalan.
    if (pathname === "/firefly/facts" && request.method === "GET") {
      if (!env.DB) return response({ error: "Database fakta unik belum tersedia." }, 503, origin);
      try {
        await ensureFireflyTable(env);
        const weekStart = jakartaMondayDate();
        const rows = await env.DB.prepare("SELECT icon,category,title,fact_text AS text,position FROM firefly_facts WHERE week_start=? ORDER BY position").bind(weekStart).all();
        return response({ success: true, weekStart, count: (rows.results || []).length, facts: rows.results || [] }, 200, origin);
      } catch (error) {
        return response({ error: "Fakta unik gagal dimuat: " + String(error.message || error) }, 500, origin);
      }
    }

    // VEXEL FIREFLY: pemicu pembaruan manual, khusus admin.
    if (pathname === "/firefly/update") {
      if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
      const adminOk = Boolean(
        (env.UPLOAD_KEY && await verifyAdminSession(suppliedToken, env.UPLOAD_KEY)) ||
        await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "admin")
      );
      if (!adminOk) return response({ error: "Hanya admin VEXEL GAMES yang boleh memperbarui fakta." }, 401, origin);
      if (!env.DB || !env.AI) return response({ error: "Binding database atau Workers AI belum tersedia." }, 503, origin);
      try {
        const result = await generateWeeklyFireflyFacts(env, new Date());
        const check = await env.DB.prepare(
          "SELECT COUNT(*) AS count, MIN(week_start) AS weekStart, MAX(week_start) AS latestWeek FROM firefly_facts"
        ).first();
        if (Number(check?.count || 0) !== 50 || check?.latestWeek !== result.weekStart) {
          return response({ error: "Pembaruan selesai tetapi verifikasi 50 fakta gagal.", result, verification: check }, 500, origin);
        }
        return response({
          success: true,
          message: "50 fakta VEXEL FIREFLY berhasil diperbarui. Fakta lama telah diganti.",
          weekStart: result.weekStart,
          count: Number(check.count)
        }, 200, origin);
      } catch (error) {
        console.error("Manual VEXEL FIREFLY update failed:", error);
        return response({ error: "Pembaruan fakta gagal: " + String(error.message || error) }, 500, origin);
      }
    }

    // VEXEL QUIZ Durable Object WebSocket endpoint (one object per numeric room code).
    if (pathname === "/quiz/connect" && request.method === "GET") {
      const code = String(new URL(request.url).searchParams.get("code") || "").replace(/[^0-9]/g, "").slice(0, 6);
      if (!/^\\d{6}$/.test(code)) return response({ error: "Kode room tidak valid." }, 400, origin);
      if (!env.QUIZ_ROOM) return response({ error: "Durable Object QUIZ_ROOM belum terpasang." }, 503, origin);
      const id = env.QUIZ_ROOM.idFromName(code);
      return env.QUIZ_ROOM.get(id).fetch("https://quiz-room/connect", request);
    }

    // Fast path: shared bank reads bypass per-request schema migrations and room cleanup.
    if (pathname === "/quiz/bank" && request.method === "GET") {
      if (!env.DB) return response({error:"Database bank soal belum tersedia."},503,origin);
      try {
        // Pastikan kolom metadata tersedia pada database lama sebelum jalur cepat membaca bank.
        try { await env.DB.prepare("ALTER TABLE quiz_question_bank ADD COLUMN class_level TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_question_bank ADD COLUMN subject TEXT").run(); } catch (_) {}
        const params=new URL(request.url).searchParams;
        const id=String(params.get("id")||"").slice(0,80);
        if(id){
          const row=await env.DB.prepare("SELECT id,title,questions_json AS questions,author,class_level AS classLevel,subject,created_at AS createdAt FROM quiz_question_bank WHERE id=?").bind(id).first();
          if(!row)return response({error:"Paket soal tidak ditemukan."},404,origin);
          return response({success:true,pack:{...row,questions:JSON.parse(row.questions)}},200,origin);
        }
        const paged=params.has("limit"),limit=paged?Math.max(1,Math.min(5,Number(params.get("limit"))||5)):100,offset=paged?Math.max(0,Number(params.get("offset"))||0):0;
        const totalRow=paged?await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_question_bank").first():null;
        const rows=await env.DB.prepare("SELECT id,title,author,class_level AS classLevel,subject,created_at AS createdAt FROM quiz_question_bank ORDER BY updated_at DESC LIMIT ? OFFSET ?").bind(limit,offset).all();
        return response({success:true,packs:rows.results||[],...(paged?{total:Number(totalRow?.total||0),limit,offset}: {})},200,origin);
      } catch(error) { return response({error:"Bank Soal gagal dimuat: "+(error.message||"Kesalahan database.")},500,origin); }
    }

    // VEXEL QUIZ LOBBY API — D1 persistence + Durable Objects live notifications.
    if (pathname.startsWith("/quiz/")) {
      if (!env.DB) return response({error:"Database lobby belum tersedia pada Worker."},503,origin);
      try {

        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_question_bank (id TEXT PRIMARY KEY, title TEXT NOT NULL, questions_json TEXT NOT NULL, author TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_rooms (code TEXT PRIMARY KEY, room_name TEXT NOT NULL, host_name TEXT NOT NULL, host_token TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'waiting', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, pack_id TEXT, class_level TEXT, subject TEXT, duration_minutes INTEGER, owner_sub TEXT)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_room_players (id TEXT PRIMARY KEY, room_code TEXT NOT NULL, player_name TEXT NOT NULL, role TEXT NOT NULL, session_token TEXT NOT NULL UNIQUE, joined_at TEXT NOT NULL, last_seen TEXT NOT NULL)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_quiz_players_room ON quiz_room_players(room_code,joined_at)").run();
        try { await env.DB.prepare("ALTER TABLE quiz_room_players ADD COLUMN answers_json TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_room_players ADD COLUMN score INTEGER").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_room_players ADD COLUMN submitted_at TEXT").run(); } catch (_) {}
        await env.DB.prepare("DELETE FROM quiz_room_players WHERE room_code IN (SELECT code FROM quiz_rooms WHERE expires_at < ?)").bind(new Date().toISOString()).run();
        await env.DB.prepare("DELETE FROM quiz_rooms WHERE expires_at < ?").bind(new Date().toISOString()).run();


        // Kolom metadata paket ditambahkan secara aman untuk database lama.
        try { await env.DB.prepare("ALTER TABLE quiz_question_bank ADD COLUMN class_level TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_question_bank ADD COLUMN subject TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN pack_id TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN class_level TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN subject TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN duration_minutes INTEGER").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN owner_sub TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN start_at TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN class_id TEXT").run(); } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_assignments (id TEXT PRIMARY KEY, title TEXT NOT NULL, pack_title TEXT NOT NULL, questions_json TEXT NOT NULL, class_level TEXT NOT NULL, subject TEXT NOT NULL, duration_minutes INTEGER NOT NULL, start_at TEXT NOT NULL, due_at TEXT, owner_key TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published')").run();
        try { await env.DB.prepare("ALTER TABLE quiz_assignments ADD COLUMN creator_nickname TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_assignments ADD COLUMN class_id TEXT").run(); } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_classes (id TEXT PRIMARY KEY, name TEXT NOT NULL, class_level TEXT NOT NULL, join_code TEXT NOT NULL UNIQUE, owner_sub TEXT NOT NULL, owner_nickname TEXT NOT NULL, created_at TEXT NOT NULL)").run();
        try { await env.DB.prepare("ALTER TABLE quiz_classes ADD COLUMN password_hash TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_classes ADD COLUMN password_encrypted TEXT").run(); } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_class_members (id TEXT PRIMARY KEY, class_id TEXT NOT NULL, student_sub TEXT NOT NULL, student_nickname TEXT NOT NULL, joined_at TEXT NOT NULL, UNIQUE(class_id,student_sub))").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_quiz_classes_owner ON quiz_classes(owner_sub,created_at)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_quiz_class_members_student ON quiz_class_members(student_sub)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_assignment_attempts (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, student_name TEXT NOT NULL, started_at TEXT NOT NULL, ends_at TEXT NOT NULL, submitted_at TEXT, answers_json TEXT, score INTEGER, status TEXT NOT NULL DEFAULT 'in_progress')").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_assignment_attempts ON quiz_assignment_attempts(assignment_id,started_at)").run();
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN started_at TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN ends_at TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN game_mode TEXT NOT NULL DEFAULT 'competition'").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN question_index INTEGER NOT NULL DEFAULT 0").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN question_started_at TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN question_ends_at TEXT").run(); } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_question_answers (id TEXT PRIMARY KEY,room_code TEXT NOT NULL,player_id TEXT NOT NULL,question_index INTEGER NOT NULL,selected_option INTEGER NOT NULL,is_correct INTEGER NOT NULL,submitted_at TEXT NOT NULL,UNIQUE(room_code,player_id,question_index))").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_quiz_answers_room_question ON quiz_question_answers(room_code,question_index)").run();

        const hashClassPassword=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))))).map(b=>b.toString(16).padStart(2,"0")).join("");
        const classPasswordKey=async()=>crypto.subtle.importKey("raw",await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(env.AUTH_SECRET||""))),"AES-GCM",false,["encrypt","decrypt"]);
        const encryptClassPassword=async value=>{const iv=crypto.getRandomValues(new Uint8Array(12)),key=await classPasswordKey(),data=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(String(value)));return btoa(String.fromCharCode(...iv,...new Uint8Array(data)))};
        const decryptClassPassword=async value=>{if(!value)return "";try{const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0)),iv=raw.slice(0,12),data=raw.slice(12),key=await classPasswordKey(),plain=await crypto.subtle.decrypt({name:"AES-GCM",iv},key,data);return new TextDecoder().decode(plain)}catch(_){return ""}};
        if (pathname === "/quiz/classes/search" && request.method === "GET") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          const url=new URL(request.url);
          const query=String(url.searchParams.get("q")||"").trim().slice(0,80);
          const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get("page")||"1",10)||1));
          const pageSize=10;
          const offset=(page-1)*pageSize;
          let count,rows;
          if(query.length>=2){
            const pattern="%"+query+"%";
            count=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_classes WHERE (name LIKE ? OR class_level LIKE ? OR owner_nickname LIKE ?)").bind(pattern,pattern,pattern).first();
            rows=await env.DB.prepare("SELECT id,name,class_level AS classLevel,owner_nickname AS teacherName FROM quiz_classes WHERE (name LIKE ? OR class_level LIKE ? OR owner_nickname LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(pattern,pattern,pattern,pageSize,offset).all();
          }else{
            count=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_classes").first();
            rows=await env.DB.prepare("SELECT id,name,class_level AS classLevel,owner_nickname AS teacherName FROM quiz_classes ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(pageSize,offset).all();
          }
          const total=Number(count?.total||0);
          return response({success:true,classes:rows.results||[],page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))},200,origin);
        }
        if ((pathname === "/quiz/classes" || pathname === "/quiz/classes/my") && request.method === "GET") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          if(pathname==="/quiz/classes"){
            const rows=await env.DB.prepare("SELECT c.id,c.name,c.class_level AS classLevel,c.join_code AS joinCode,c.password_encrypted AS passwordEncrypted,c.created_at AS createdAt,(SELECT COUNT(*) FROM quiz_class_members m WHERE m.class_id=c.id) AS studentCount FROM quiz_classes c WHERE c.owner_sub=? ORDER BY c.created_at DESC").bind(accountSession.sub).all();
            const classes=[];
            for(const c of (rows.results||[])){
              const members=await env.DB.prepare("SELECT student_nickname AS nickname,joined_at AS joinedAt FROM quiz_class_members WHERE class_id=? ORDER BY joined_at ASC").bind(c.id).all();
              classes.push({...c,password:await decryptClassPassword(c.passwordEncrypted),passwordEncrypted:undefined,students:members.results||[]});
            }
            return response({success:true,classes},200,origin);
          }
          const rows=await env.DB.prepare("SELECT c.id,c.name,c.class_level AS classLevel,c.join_code AS joinCode,c.owner_nickname AS teacherName,c.created_at AS createdAt,m.joined_at AS joinedAt FROM quiz_class_members m JOIN quiz_classes c ON c.id=m.class_id WHERE m.student_sub=? ORDER BY m.joined_at DESC").bind(accountSession.sub).all();
          return response({success:true,classes:rows.results||[]},200,origin);
        }
        if (pathname === "/quiz/classes" && request.method === "DELETE") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          const id=String(new URL(request.url).searchParams.get("id")||"").slice(0,80);
          if(!id)return response({error:"ID kelas diperlukan."},400,origin);
          const klass=await env.DB.prepare("SELECT id FROM quiz_classes WHERE id=? AND owner_sub=?").bind(id,accountSession.sub).first();
          if(!klass)return response({error:"Kelas tidak ditemukan atau bukan milik akun ini."},404,origin);
          await env.DB.prepare("DELETE FROM quiz_class_members WHERE class_id=?").bind(id).run();
          await env.DB.prepare("DELETE FROM quiz_classes WHERE id=? AND owner_sub=?").bind(id,accountSession.sub).run();
          return response({success:true,message:"Kelas berhasil dihapus."},200,origin);
        }
        if (pathname === "/quiz/classes/detail" && request.method === "GET") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          const id=String(new URL(request.url).searchParams.get("id")||"").slice(0,80);
          if(!id)return response({error:"ID kelas diperlukan."},400,origin);
          const klass=await env.DB.prepare("SELECT id,name,class_level AS classLevel,owner_nickname AS teacherName,password_encrypted AS passwordEncrypted,created_at AS createdAt FROM quiz_classes WHERE id=? AND owner_sub=?").bind(id,accountSession.sub).first();
          if(!klass)return response({error:"Kelas tidak ditemukan atau bukan milik akun ini."},404,origin);
          const members=await env.DB.prepare("SELECT id AS memberId,student_nickname AS nickname,joined_at AS joinedAt FROM quiz_class_members WHERE class_id=? ORDER BY joined_at ASC").bind(id).all();
          return response({success:true,class:{...klass,password:await decryptClassPassword(klass.passwordEncrypted),passwordEncrypted:undefined,students:members.results||[],studentCount:(members.results||[]).length}},200,origin);
        }
        if (pathname === "/quiz/classes/members" && request.method === "DELETE") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          const body=await request.json().catch(()=>({}));
          const classId=String(body.classId||"").trim().slice(0,80);
          const memberId=String(body.memberId||"").trim().slice(0,80);
          if(!classId||!memberId)return response({error:"ID kelas dan anggota diperlukan."},400,origin);
          const klass=await env.DB.prepare("SELECT id FROM quiz_classes WHERE id=? AND owner_sub=?").bind(classId,accountSession.sub).first();
          if(!klass)return response({error:"Kelas tidak ditemukan atau bukan milik akun ini."},404,origin);
          const member=await env.DB.prepare("SELECT id FROM quiz_class_members WHERE id=? AND class_id=?").bind(memberId,classId).first();
          if(!member)return response({error:"Murid tidak ditemukan sebagai anggota kelas ini."},404,origin);
          await env.DB.prepare("DELETE FROM quiz_class_members WHERE id=? AND class_id=?").bind(memberId,classId).run();
          return response({success:true,message:"Murid berhasil dikeluarkan dari kelas. Akun siswa tetap aktif."},200,origin);
        }
        if (pathname === "/quiz/classes" && request.method === "POST") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Silakan login ke akun VEXEL GAMES terlebih dahulu."},401,origin);
          const body=await request.json().catch(()=>({}));
          const name=String(body.name||"").trim().replace(/[<>]/g,"").slice(0,60);
          const classLevel=String(body.classLevel||"").trim().slice(0,20);
          const classPassword=String(body.password||"");
          if(!name||!classLevel||classPassword.length<4||classPassword.length>32)return response({error:"Nama kelas, tingkat kelas, dan password 4–32 karakter wajib diisi."},400,origin);
          const passwordHash=await hashClassPassword(classPassword);
          if(await env.DB.prepare("SELECT id FROM quiz_classes WHERE password_hash=?").bind(passwordHash).first())return response({error:"Password ini sudah digunakan kelas lain. Buat password yang berbeda agar murid masuk ke kelas yang tepat."},409,origin);
          const account=await env.DB.prepare("SELECT nickname,display_name AS displayName FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(accountSession.sub).first();
          const nickname=String(account?.nickname||account?.displayName||"Guru").trim().slice(0,40);
          let joinCode="",exists=true;
          for(let i=0;i<8&&exists;i++){
            joinCode=String(Math.floor(100000+Math.random()*900000));
            exists=Boolean(await env.DB.prepare("SELECT id FROM quiz_classes WHERE join_code=?").bind(joinCode).first());
          }
          if(exists)return response({error:"Kode kelas belum dapat dibuat. Silakan coba lagi."},503,origin);
          const id="cls_"+randomString(14),createdAt=new Date().toISOString();
          const passwordEncrypted=await encryptClassPassword(classPassword);
          await env.DB.prepare("INSERT INTO quiz_classes(id,name,class_level,join_code,owner_sub,owner_nickname,created_at,password_hash,password_encrypted) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,name,classLevel,joinCode,accountSession.sub,nickname,createdAt,passwordHash,passwordEncrypted).run();
          return response({success:true,class:{id,name,classLevel,joinCode,studentCount:0,students:[],createdAt}},201,origin);
        }
        if (pathname === "/quiz/classes/join" && request.method === "POST") {
          const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
          if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Login akun VEXEL GAMES diperlukan untuk bergabung ke kelas."},401,origin);
          const body=await request.json().catch(()=>({}));
          const classPassword=String(body.password||"");
          const classId=String(body.classId||"").trim().slice(0,80);
          if(classPassword.length<4||classPassword.length>32)return response({error:"Masukkan password kelas yang valid."},400,origin);
          const passwordHash=await hashClassPassword(classPassword);
          const matches=classId
            ? await env.DB.prepare("SELECT id,name,class_level AS classLevel,owner_nickname AS teacherName,owner_sub,password_hash AS passwordHash FROM quiz_classes WHERE id=? AND password_hash=?").bind(classId,passwordHash).all()
            : await env.DB.prepare("SELECT id,name,class_level AS classLevel,owner_nickname AS teacherName,owner_sub,password_hash AS passwordHash FROM quiz_classes WHERE password_hash=?").bind(passwordHash).all();
          if(!matches.results||matches.results.length===0)return response({error:classId?"Password tidak sesuai dengan kelas yang dipilih. Periksa kembali password dari guru.":"Password kelas tidak ditemukan. Periksa kembali password dari guru."},404,origin);
          if(matches.results.length>1)return response({error:"Password ini digunakan lebih dari satu kelas. Minta guru mengganti password kelas."},409,origin);
          const klass=matches.results[0];
          if(klass.owner_sub===accountSession.sub)return response({error:"Guru tidak dapat bergabung ke kelas miliknya sendiri sebagai murid."},400,origin);
          const account=await env.DB.prepare("SELECT nickname,display_name AS displayName FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(accountSession.sub).first();
          const nickname=String(account?.nickname||account?.displayName||"").trim().slice(0,40);
          if(!nickname)return response({error:"Atur nickname akun VEXEL GAMES terlebih dahulu."},400,origin);
          const existing=await env.DB.prepare("SELECT id FROM quiz_class_members WHERE class_id=? AND student_sub=?").bind(klass.id,accountSession.sub).first();
          if(!existing)await env.DB.prepare("INSERT INTO quiz_class_members(id,class_id,student_sub,student_nickname,joined_at) VALUES(?,?,?,?,?)").bind("mem_"+randomString(14),klass.id,accountSession.sub,nickname,new Date().toISOString()).run();
          return response({success:true,alreadyJoined:Boolean(existing),class:klass,message:existing?"Kamu sudah tergabung di kelas ini.":"Berhasil bergabung ke kelas "+klass.name+"."},200,origin);
        }

        if (pathname === "/quiz/assignments" && request.method === "GET") {
          const now=new Date().toISOString();
          const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          await env.DB.prepare("DELETE FROM quiz_assignment_attempts WHERE assignment_id IN (SELECT id FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?)").bind(archiveCutoff).run();
          await env.DB.prepare("DELETE FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?").bind(archiveCutoff).run();
          // Daftar tugas aktif ditampilkan untuk semua murid. Status pengumpulan dicek saat murid memilih dan memulai tugas.
          const sql="SELECT id,title,pack_title AS packTitle,class_level AS classLevel,subject,duration_minutes AS durationMinutes,start_at AS startAt,due_at AS dueAt,created_at AS createdAt,COALESCE(NULLIF(creator_nickname,''),'Guru') AS creatorNickname,(SELECT COUNT(*) FROM quiz_assignment_attempts a WHERE a.assignment_id=quiz_assignments.id AND a.status='submitted') AS submittedCount FROM quiz_assignments WHERE status='published' AND start_at<=? AND (due_at IS NULL OR due_at>?) ORDER BY created_at DESC LIMIT 100";
          const rows=await env.DB.prepare(sql).bind(now,now).all();
          return response({success:true,assignments:rows.results||[]},200,origin);
        }
        if (pathname === "/quiz/assignments/create" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const ownerKey=String(body.ownerKey||"").trim();
          const packId=String(body.packId||"").trim().slice(0,80);
          const title=String(body.title||"").trim().replace(/[<>]/g,"").slice(0,80);
          const duration=Number(body.durationMinutes);
          const startAt=body.startAt?new Date(body.startAt):new Date();
          const dueAt=body.dueAt?new Date(body.dueAt):null;
          if(ownerKey.length<24||!title||!packId||!Number.isInteger(duration)||duration<1||duration>240||!Number.isFinite(startAt.getTime())||startAt.getTime()<Date.now()-30000) return response({error:"Judul, paket soal, durasi, kunci guru, dan waktu mulai yang valid wajib diisi."},400,origin);
          if(dueAt&&(!Number.isFinite(dueAt.getTime())||dueAt<=startAt)) return response({error:"Batas akhir harus setelah waktu mulai."},400,origin);
          const pack=await env.DB.prepare("SELECT title,questions_json,class_level,subject FROM quiz_question_bank WHERE id=?").bind(packId).first();
          if(!pack)return response({error:"Paket soal tidak ditemukan."},404,origin);
          const questions=JSON.parse(pack.questions_json||"[]");
          if(!Array.isArray(questions)||!questions.length)return response({error:"Paket soal tidak memiliki pertanyaan."},400,origin);
          const token=suppliedToken;
          const session=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!session||!["player","admin"].includes(session.role))return response({error:"Silakan login ke VEXEL GAMES terlebih dahulu untuk membuat tugas."},401,origin);
          const account=await env.DB.prepare("SELECT nickname FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(session.sub).first();
          const accountNickname=String(account?.nickname||"").trim().slice(0,16);
          const creatorNickname=String(body.creatorNickname||"").trim().slice(0,16);
          if(!accountNickname)return response({error:"Nickname akun belum diatur. Atur nickname di profil sebelum membuat tugas."},400,origin);
          if(!creatorNickname||creatorNickname!==accountNickname)return response({error:"Nickname pemberi tugas tidak cocok dengan akun yang sedang login. Muat ulang halaman dan coba lagi."},400,origin);
          const id="task_"+randomString(12),now=new Date().toISOString();
          await env.DB.prepare("INSERT INTO quiz_assignments(id,title,pack_title,questions_json,class_level,subject,duration_minutes,start_at,due_at,owner_key,created_at,status,creator_nickname) VALUES(?,?,?,?,?,?,?,?,?,?,?,'published',?)").bind(id,title,pack.title,JSON.stringify(questions),pack.class_level||"Umum",pack.subject||"",duration,startAt.toISOString(),dueAt?dueAt.toISOString():null,ownerKey,now,creatorNickname).run();
          return response({success:true,assignment:{id,title,packTitle:pack.title,classLevel:pack.class_level,subject:pack.subject,durationMinutes:duration,startAt:startAt.toISOString(),dueAt:dueAt?dueAt.toISOString():null,creatorNickname}},201,origin);
        }
        if (pathname === "/quiz/assignments/start" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const id=String(body.assignmentId||"").slice(0,80),studentName=String(body.studentName||"").trim().replace(/[<>]/g,"").slice(0,40);
          if(!id||!studentName)return response({error:"Nama siswa wajib diisi."},400,origin);
          const now=new Date(),nowIso=now.toISOString();
          const task=await env.DB.prepare("SELECT id,title,questions_json,duration_minutes AS durationMinutes,start_at AS startAt,due_at AS dueAt FROM quiz_assignments WHERE id=? AND status='published'").bind(id).first();
          if(!task)return response({error:"Tugas tidak ditemukan atau sudah ditutup."},404,origin);
          if(task.startAt>nowIso)return response({error:"Tugas belum tersedia. Periksa kembali jadwal mulai."},409,origin);
          if(task.dueAt&&task.dueAt<=nowIso)return response({error:"Batas pengumpulan tugas sudah berakhir."},409,origin);
          const questions=JSON.parse(task.questions_json||"[]").map(q=>({question:q.question,options:q.options}));
          const previous=await env.DB.prepare("SELECT id,started_at AS startedAt,ends_at AS endsAt,answers_json AS answersJson,status FROM quiz_assignment_attempts WHERE assignment_id=? AND lower(student_name)=lower(?) ORDER BY started_at DESC LIMIT 1").bind(id,studentName).first();
          if(previous){
            if(previous.status!=="in_progress")return response({error:"Tugas dengan nama ini sudah dikumpulkan. Hubungi guru jika merasa ini bukan hasil pengerjaanmu."},409,origin);
            if(previous.endsAt<=nowIso)return response({error:"Waktu pengerjaan sesi ini sudah berakhir."},409,origin);
            return response({success:true,resumed:true,attempt:{id:previous.id,assignmentId:id,title:task.title,studentName,startedAt:previous.startedAt,endsAt:previous.endsAt,answers:previous.answersJson?JSON.parse(previous.answersJson):[],questions}},200,origin);
          }
          const ends=new Date(now.getTime()+Number(task.durationMinutes)*60000);
          const endAt=task.dueAt&&task.dueAt<ends.toISOString()?task.dueAt:ends.toISOString();
          const attemptId="att_"+randomString(16);
          await env.DB.prepare("INSERT INTO quiz_assignment_attempts(id,assignment_id,student_name,started_at,ends_at,status) VALUES(?,?,?,?,?,'in_progress')").bind(attemptId,id,studentName,nowIso,endAt).run();
          return response({success:true,resumed:false,attempt:{id:attemptId,assignmentId:id,title:task.title,studentName,startedAt:nowIso,endsAt:endAt,answers:[],questions}},201,origin);
        }
        if (pathname === "/quiz/assignments/progress" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const attemptId=String(body.attemptId||"").slice(0,100),answers=Array.isArray(body.answers)?body.answers:[];
          if(!attemptId)return response({error:"Sesi pengerjaan tidak valid."},400,origin);
          const attempt=await env.DB.prepare("SELECT a.id,a.status,a.ends_at AS endsAt,t.questions_json AS questions FROM quiz_assignment_attempts a JOIN quiz_assignments t ON t.id=a.assignment_id WHERE a.id=?").bind(attemptId).first();
          if(!attempt)return response({error:"Sesi pengerjaan tidak ditemukan."},404,origin);
          if(attempt.status!=="in_progress")return response({error:"Tugas sudah dikumpulkan."},409,origin);
          if(attempt.endsAt<=new Date().toISOString())return response({error:"Waktu pengerjaan sudah habis."},409,origin);
          const questions=JSON.parse(attempt.questions||"[]");
          const normalized=questions.map((q,i)=>Number.isInteger(Number(answers[i]))&&Number(answers[i])>=0&&Number(answers[i])<q.options.length?Number(answers[i]):-1);
          await env.DB.prepare("UPDATE quiz_assignment_attempts SET answers_json=? WHERE id=? AND status='in_progress'").bind(JSON.stringify(normalized),attemptId).run();
          return response({success:true,saved:true},200,origin);
        }
        if (pathname === "/quiz/assignments/submit" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const attemptId=String(body.attemptId||"").slice(0,100),answers=Array.isArray(body.answers)?body.answers:[];
          const attempt=await env.DB.prepare("SELECT a.id,a.assignment_id AS assignmentId,a.ends_at AS endsAt,a.status,t.questions_json AS questions FROM quiz_assignment_attempts a JOIN quiz_assignments t ON t.id=a.assignment_id WHERE a.id=?").bind(attemptId).first();
          if(!attempt)return response({error:"Sesi pengerjaan tidak ditemukan."},404,origin);
          if(attempt.status!=="in_progress")return response({error:"Jawaban tugas ini sudah dikumpulkan."},409,origin);
          // Pengiriman otomatis dari browser tetap diterima setelah timer mencapai nol; skor tetap dihitung di server.
          const questions=JSON.parse(attempt.questions||"[]");
          const normalized=questions.map((q,i)=>Number.isInteger(Number(answers[i]))&&Number(answers[i])>=0&&Number(answers[i])<q.options.length?Number(answers[i]):-1);
          const correct=questions.reduce((n,q,i)=>n+(normalized[i]===Number(q.correct)?1:0),0);
          const score=questions.length?Math.round(correct/questions.length*100):0,now=new Date().toISOString();
          await env.DB.prepare("UPDATE quiz_assignment_attempts SET answers_json=?,score=?,submitted_at=?,status='submitted' WHERE id=? AND status='in_progress'").bind(JSON.stringify(normalized),score,now,attemptId).run();
          return response({success:true,score,correct,total:questions.length,submittedAt:now},200,origin);
        }
        if (pathname === "/quiz/assignments/results" && request.method === "GET") {
          const url=new URL(request.url),ownerKey=String(url.searchParams.get("ownerKey")||"").trim(),id=String(url.searchParams.get("id")||"").slice(0,80);
          if(ownerKey.length<24||!id)return response({error:"Kunci guru dan ID tugas diperlukan."},400,origin);
          const task=await env.DB.prepare("SELECT id,title,pack_title AS packTitle,class_level AS classLevel,subject,duration_minutes AS durationMinutes,start_at AS startAt,due_at AS dueAt,created_at AS createdAt,questions_json AS questionsJson FROM quiz_assignments WHERE id=? AND owner_key=?").bind(id,ownerKey).first();
          if(!task)return response({error:"Tugas tidak ditemukan atau akses guru tidak valid."},404,origin);
          const rows=await env.DB.prepare("SELECT id,student_name AS studentName,started_at AS startedAt,ends_at AS endsAt,submitted_at AS submittedAt,answers_json AS answersJson,score,status FROM quiz_assignment_attempts WHERE assignment_id=? ORDER BY CASE WHEN status='submitted' THEN 0 ELSE 1 END,score DESC,started_at").bind(id).all();
          const questions=JSON.parse(task.questionsJson||"[]");
          const results=(rows.results||[]).map(row=>({...row,answers:row.answersJson?JSON.parse(row.answersJson):[],answersJson:undefined}));
          const questionAnalysis=questions.map((q,index)=>{
            const submitted=results.filter(r=>r.status==="submitted");
            const correct=submitted.filter(r=>Number(r.answers[index])===Number(q.correct)).length;
            return {number:index+1,question:q.question,options:q.options,correctAnswer:Number(q.correct),submitted:submitted.length,correct,incorrect:submitted.length-correct,accuracy:submitted.length?Math.round(correct/submitted.length*100):0};
          });
          return response({success:true,task:{...task,questions:questions.map(q=>({question:q.question,options:q.options,correct:Number(q.correct)})),questionsJson:undefined},results,questionAnalysis},200,origin);
        }

        if (pathname === "/quiz/bank" && request.method === "GET") {
          const id=String(new URL(request.url).searchParams.get("id")||"").slice(0,80);
          if(id){const row=await env.DB.prepare("SELECT id,title,questions_json AS questions,author,class_level AS classLevel,subject,created_at AS createdAt FROM quiz_question_bank WHERE id=?").bind(id).first();if(!row)return response({error:"Paket soal tidak ditemukan."},404,origin);return response({success:true,pack:{...row,questions:JSON.parse(row.questions)}},200,origin);}
          const params=new URL(request.url).searchParams;
          const paged=params.has("limit");
          const totalRow=paged?await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_question_bank").first():null;
          const limit=paged?Math.max(1,Math.min(5,Number(params.get("limit"))||5)):100;
          const offset=paged?Math.max(0,Number(params.get("offset"))||0):0;
          const rows=await env.DB.prepare("SELECT id,title,author,class_level AS classLevel,subject,created_at AS createdAt FROM quiz_question_bank ORDER BY updated_at DESC LIMIT ? OFFSET ?").bind(limit,offset).all();
          return response({success:true,packs:rows.results||[],...(paged?{total:Number(totalRow?.total||0),limit,offset}: {})},200,origin);
        }

        if (pathname === "/quiz/bank" && request.method === "DELETE") {
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const session=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!session||!["player","admin"].includes(session.role))return response({error:"Login VEXEL GAMES diperlukan untuk menghapus paket."},401,origin);
          const account=await env.DB.prepare("SELECT display_name AS displayName,nickname FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(session.sub).first();
          if(!account)return response({error:"Akun VEXEL GAMES tidak ditemukan."},403,origin);
          const id=String(new URL(request.url).searchParams.get("id")||"").trim().slice(0,80);
          if(!id)return response({error:"ID paket yang akan dihapus belum diberikan."},400,origin);
          const pack=await env.DB.prepare("SELECT id,title,questions_json,author,created_at,updated_at,class_level,subject FROM quiz_question_bank WHERE id=?").bind(id).first();
          if(!pack)return response({error:"Paket soal tidak ditemukan atau sudah dihapus."},404,origin);
          const nickname=String(account.nickname||"").trim().toLocaleLowerCase("id");
          const displayName=String(account.displayName||"").trim().toLocaleLowerCase("id");
          const author=String(pack.author||"").trim().toLocaleLowerCase("id");
          if(session.role!=="admin"&&author!==nickname&&author!==displayName)return response({error:"Anda hanya boleh menghapus paket yang Anda buat."},403,origin);
          const active=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_rooms WHERE pack_id=? AND expires_at>?").bind(id,new Date().toISOString()).first();
          if(Number(active?.total||0)>0)return response({error:"Paket sedang digunakan pada room yang masih aktif. Tunggu room berakhir sebelum menghapusnya."},409,origin);
          await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_question_bank_archive (id TEXT PRIMARY KEY,title TEXT NOT NULL,questions_json TEXT NOT NULL,author TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,class_level TEXT,subject TEXT,deleted_at TEXT NOT NULL)").run();
          const deletedAt=new Date().toISOString();
          await env.DB.prepare("INSERT OR REPLACE INTO quiz_question_bank_archive(id,title,questions_json,author,created_at,updated_at,class_level,subject,deleted_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(pack.id,pack.title,pack.questions_json,pack.author,pack.created_at,pack.updated_at,pack.class_level||null,pack.subject||null,deletedAt).run();
          const result=await env.DB.prepare("DELETE FROM quiz_question_bank WHERE id=?").bind(id).run();
          if(!result.meta?.changes)return response({error:"Paket tidak terhapus. Silakan muat ulang bank soal."},409,origin);
          return response({success:true,id,message:"Paket berhasil dihapus. Salinan soal lama tersimpan sebagai cadangan."},200,origin);
        }

        if (pathname === "/quiz/bank" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const session=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!session||!["player","admin"].includes(session.role))return response({error:"Login akun VEXEL GAMES diperlukan untuk menyimpan paket soal."},401,origin);
          const account=await env.DB.prepare("SELECT display_name AS displayName,nickname FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(session.sub).first();
          if(!account)return response({error:"Akun VEXEL GAMES tidak ditemukan."},403,origin);
          const title=String(body.title||"").trim().replace(/[<>]/g,"").slice(0,60);
          const classLevel=String(body.classLevel||"").trim().slice(0,20);
          const subject=String(body.subject||"").trim().replace(/[<>]/g,"").slice(0,80);
          const questions=Array.isArray(body.questions)?body.questions:[];
          if(!title||!classLevel||!subject||questions.length<1)return response({error:"Nama paket, kelas, mata pelajaran, dan minimal satu soal wajib diisi."},400,origin);
          for(let i=0;i<questions.length;i++){const q=questions[i];if(!q||typeof q.question!=="string"||!q.question.trim()||q.question.length>500||!Array.isArray(q.options)||q.options.length<2||q.options.length>4||q.options.some(v=>typeof v!=="string"||!v.trim()||v.length>180)||!Number.isInteger(q.correct)||q.correct<0||q.correct>=q.options.length)return response({error:"Format soal nomor "+(i+1)+" tidak valid. Setiap soal wajib memiliki 2 sampai 4 pilihan dan kunci jawaban yang sesuai."},400,origin);}
          const now=new Date().toISOString(),id="qb_"+randomString(12),author=account.nickname||account.displayName||session.email;
          await env.DB.prepare("INSERT INTO quiz_question_bank(id,title,questions_json,author,created_at,updated_at,class_level,subject) VALUES(?,?,?,?,?,?,?,?)").bind(id,title,JSON.stringify(questions),author,now,now,classLevel,subject).run();
          return response({success:true,id,message:"Paket soal berhasil disimpan ke Bank Soal."},201,origin);
        }

        if (pathname === "/quiz/rooms" && request.method === "GET") {
          const now=new Date().toISOString(), activeSince=new Date(Date.now()-45000).toISOString();
          const found = await env.DB.prepare("SELECT r.code,r.room_name AS roomName,r.host_name AS hostName,r.status,r.created_at AS createdAt,(SELECT COUNT(*) FROM quiz_room_players p WHERE p.room_code=r.code) AS playerCount FROM quiz_rooms r JOIN quiz_room_players h ON h.room_code=r.code AND h.role='host' WHERE r.status='waiting' AND r.class_id IS NULL AND (r.start_at IS NULL OR r.start_at<=?) AND r.expires_at>? AND h.last_seen>=? ORDER BY r.created_at DESC LIMIT 40").bind(now,now,activeSince).all();
          return response({success:true,rooms:found.results||[]},200,origin);
        }
        if (pathname === "/quiz/claim-rooms" && request.method === "POST") {
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const account=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!account||!["player","admin"].includes(account.role))return response({error:"Login akun VEXEL GAMES diperlukan."},401,origin);
          const body=await request.json().catch(()=>({}));
          const rooms=Array.isArray(body.rooms)?body.rooms.slice(0,30):[];
          let claimed=0;
          for(const item of rooms){
            const code=String(item?.code||"").replace(/[^A-Z0-9]/gi,"").slice(0,6);
            const hostToken=String(item?.token||"").slice(0,100);
            if(!code||!hostToken)continue;
            const result=await env.DB.prepare("UPDATE quiz_rooms SET owner_sub=? WHERE code=? AND host_token=? AND (owner_sub IS NULL OR owner_sub=?)").bind(account.sub,code,hostToken,account.sub).run();
            claimed+=result.meta?.changes||0;
          }
          return response({success:true,claimed},200,origin);
        }
        if (pathname === "/quiz/my-rooms" && request.method === "GET") {
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const account=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!account||!["player","admin"].includes(account.role))return response({error:"Login akun VEXEL GAMES diperlukan untuk melihat Room Anda."},401,origin);
          const now=new Date().toISOString(),activeSince=new Date(Date.now()-45000).toISOString();
          const found=await env.DB.prepare("SELECT r.code,r.room_name AS roomName,r.host_name AS hostName,r.status,r.created_at AS createdAt,r.expires_at AS expiresAt,r.class_level AS classLevel,r.subject,r.host_token AS token,(SELECT COUNT(*) FROM quiz_room_players p WHERE p.room_code=r.code AND p.role='player') AS playerCount,CASE WHEN h.last_seen>=? THEN 1 ELSE 0 END AS hostOnline FROM quiz_rooms r JOIN quiz_room_players h ON h.room_code=r.code AND h.role='host' WHERE r.owner_sub=? AND r.expires_at>? ORDER BY r.created_at DESC LIMIT 50").bind(activeSince,account.sub,now).all();
          return response({success:true,rooms:found.results||[]},200,origin);
        }
        if (pathname === "/quiz/create" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const accountToken=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const account=accountToken?await verifyGoogleSession(accountToken,env.AUTH_SECRET):null;
          const ownerSub=account&&["player","admin"].includes(account.role)?account.sub:null;
          const classId=String(body.classId||"").trim().slice(0,80);
          const hostName=String(body.hostName||"").trim().replace(/[<>]/g,"").slice(0,20);
          const roomName=String(body.roomName||"").trim().replace(/[<>]/g,"").slice(0,36)||"Kuis VEXEL";
          const packId=String(body.packId||"").trim().slice(0,80);
          const classLevel=String(body.classLevel||"").trim().slice(0,20);
          const subject=String(body.subject||"").trim().replace(/[<>]/g,"").slice(0,80);
          if(!hostName) return response({error:"Nama host wajib diisi."},400,origin);
          if(!packId||!classLevel||!subject) return response({error:"Paket soal, kelas, dan mata pelajaran wajib diatur."},400,origin);
          if(classId){
            if(!ownerSub)return response({error:"Login akun guru diperlukan untuk membuat permainan dari kelas."},401,origin);
            const ownedClass=await env.DB.prepare("SELECT id FROM quiz_classes WHERE id=? AND owner_sub=?").bind(classId,ownerSub).first();
            if(!ownedClass)return response({error:"Kelas tidak ditemukan atau bukan milik akun guru ini."},403,origin);
          }
          const durationMinutes=null;
          const allowedGameModes=["race","attack","plane"];
          const gameMode=allowedGameModes.includes(String(body.gameMode||""))?String(body.gameMode):"race";
          const pack=await env.DB.prepare("SELECT id FROM quiz_question_bank WHERE id=?").bind(packId).first();
          if(!pack) return response({error:"Paket soal yang dipilih tidak ditemukan di Bank Soal."},404,origin);
          const now=new Date().toISOString(), expiry=nextJakartaMidnight();
          const requestedStart=body.scheduledAt?new Date(body.scheduledAt):new Date(now);
          if(!Number.isFinite(requestedStart.getTime())||requestedStart.getTime()<Date.now()-30000||requestedStart.toISOString()>=expiry) return response({error:"Waktu mulai harus sekarang atau waktu mendatang sebelum pukul 00.00 WIB."},400,origin);
          const startAt=requestedStart.toISOString();
          let code="",saved=false,hostToken=randomString(24);
          for(let attempt=0;attempt<6&&!saved;attempt++){
            const codeRandom = new Uint32Array(1);
            crypto.getRandomValues(codeRandom);
            code = String(codeRandom[0] % 1000000).padStart(6,"0");
            try{
              await env.DB.prepare("INSERT INTO quiz_rooms(code,room_name,host_name,host_token,status,created_at,updated_at,expires_at,pack_id,class_level,subject,duration_minutes,owner_sub,start_at,game_mode,class_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(code,roomName,hostName,hostToken,"waiting",now,now,expiry,packId,classLevel,subject,durationMinutes,ownerSub,startAt,gameMode,classId||null).run();
              saved=true;
            }catch(e){ if(attempt===5) throw e; }
          }
          if(!saved) return response({error:"Kode room belum berhasil dibuat. Coba lagi."},503,origin);
          const playerId="qp_"+randomString(12);

          await env.DB.prepare("INSERT INTO quiz_room_players(id,room_code,player_name,role,session_token,joined_at,last_seen) VALUES(?,?,?,?,?,?,?)").bind(playerId,code,hostName,"host",hostToken,now,now).run();
          await notifyQuizRoom(env, code, "created");
          return response({success:true,code,token:hostToken,role:"host"},201,origin);
        }
        if (pathname === "/quiz/join" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
          let playerName=String(body.playerName||"").trim().replace(/[<>]/g,"").replace(/\s+/g," ").slice(0,60);
          if(!code) return response({error:"Kode room wajib diisi."},400,origin);
          const room=await env.DB.prepare("SELECT code,status,expires_at,start_at AS startAt,class_id AS classId FROM quiz_rooms WHERE code=?").bind(code).first();
          if(!room||room.expires_at<=new Date().toISOString()) return response({error:"Room tidak ditemukan atau sudah kedaluwarsa."},404,origin);
          if(room.classId){
            const accountSession=await verifyGoogleSession(suppliedToken,env.AUTH_SECRET);
            if(!accountSession||!["player","admin"].includes(accountSession.role))return response({error:"Login akun siswa diperlukan untuk masuk ke permainan kelas."},401,origin);
            const membership=await env.DB.prepare("SELECT student_nickname AS nickname FROM quiz_class_members WHERE class_id=? AND student_sub=?").bind(room.classId,accountSession.sub).first();
            if(!membership)return response({error:"Kamu bukan anggota kelas ini. Hanya siswa yang terdaftar di kelas guru yang dapat bergabung."},403,origin);
            playerName=String(membership.nickname||"").trim().slice(0,60);
            if(playerName.length<3)return response({error:"Profil siswa belum memiliki nama yang valid."},400,origin);
          }else if(playerName.length<3){
            return response({error:"Nama lengkap (minimal 3 karakter) wajib diisi."},400,origin);
          }
          if(room.status!=="waiting") return response({error:"Room sudah dimulai dan dikunci. Peserta terlambat tidak bisa bergabung."},409,origin);
          if(room.startAt&&room.startAt>new Date().toISOString()) return response({error:"Tugas belum dimulai. Silakan bergabung sesuai jadwal yang ditentukan guru."},409,origin);
          const duplicate=await env.DB.prepare("SELECT id FROM quiz_room_players WHERE room_code=? AND lower(player_name)=lower(?)").bind(code,playerName).first();
          if(duplicate) return response({error:"Nama tersebut sudah digunakan di room ini."},409,origin);
          const token=randomString(24),now=new Date().toISOString();
          const inserted=await env.DB.prepare("INSERT INTO quiz_room_players(id,room_code,player_name,role,session_token,joined_at,last_seen) SELECT ?,?,?, 'player',?,?,? WHERE (SELECT COUNT(*) FROM quiz_room_players WHERE room_code=?)<41 AND (SELECT status FROM quiz_rooms WHERE code=?)='waiting'").bind("qp_"+randomString(12),code,playerName,token,now,now,code,code).run();
          if(!inserted.meta?.changes) return response({error:"Room sudah penuh atau baru saja dimulai."},409,origin);
          await env.DB.prepare("UPDATE quiz_rooms SET updated_at=? WHERE code=?").bind(now,code).run();
          await notifyQuizRoom(env, code, "joined");
          return response({success:true,code,token,role:"player",playerName},201,origin);
        }
        if (pathname === "/quiz/room" && request.method === "GET") {
          const code=String(new URL(request.url).searchParams.get("code")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const viewer=await env.DB.prepare("SELECT id,role FROM quiz_room_players WHERE room_code=? AND session_token=?").bind(code,token).first();
          if(!viewer)return response({error:"Sesi room tidak valid."},401,origin);
          const room=await env.DB.prepare("SELECT code,room_name AS roomName,host_name AS hostName,status,created_at AS createdAt,expires_at AS expiresAt,pack_id AS packId,class_level AS classLevel,subject,start_at AS scheduledAt,started_at AS startedAt,COALESCE(game_mode,'competition') AS gameMode FROM quiz_rooms WHERE code=?").bind(code).first();
          if(!room) return response({error:"Room tidak ditemukan."},404,origin);
          const pack=room.packId?await env.DB.prepare("SELECT questions_json FROM quiz_question_bank WHERE id=?").bind(room.packId).first():null;
          const allQuestions=JSON.parse(pack?.questions_json||"[]");
          const rawPeople=await env.DB.prepare("SELECT p.id,p.player_name AS name,p.role,p.joined_at AS joinedAt,p.score,p.submitted_at AS submittedAt,(SELECT COUNT(*) FROM quiz_question_answers a WHERE a.room_code=p.room_code AND a.player_id=p.id) AS answeredCount,(SELECT COUNT(*) FROM quiz_question_answers a WHERE a.room_code=p.room_code AND a.player_id=p.id AND a.is_correct=1) AS correctCount FROM quiz_room_players p WHERE p.room_code=? ORDER BY CASE p.role WHEN 'host' THEN 0 ELSE 1 END,p.joined_at").bind(code).all();
          const people=(rawPeople.results||[]).map(p=>{
            const answeredCount=Number(p.answeredCount||0),correctCount=Number(p.correctCount||0);
            return {...p,answeredCount,completed:p.role==="player"&&answeredCount>=allQuestions.length,score:allQuestions.length?Math.round(correctCount*100/allQuestions.length):0};
          });
          const studentCount=people.filter(p=>p.role==="player").length;
          const me=people.find(p=>p.id===viewer.id);
          const myProgress=viewer.role==="player"?Number(me?.answeredCount||0):0;
          const myCompleted=viewer.role==="player"&&myProgress>=allQuestions.length;
          const myScore=Number(me?.score||0);
          let questions=[];
          if(room.status==="started"&&viewer.role==="player"&&!myCompleted&&allQuestions[myProgress]){
            const q=allQuestions[myProgress];
            questions=[{index:myProgress,question:q.question,options:q.options}];
          }
          if(room.status==="completed") questions=allQuestions.map((q,i)=>({index:i,question:q.question,options:q.options,correct:Number(q.correct),explanation:String(q.explanation||q.explain||"")}));
          const answerCount=people.filter(p=>p.role==="player").reduce((sum,p)=>sum+Number(p.answeredCount||0),0);
          return response({success:true,room,questions,players:people,answerCount,studentCount,questionCount:allQuestions.length,myProgress,myCompleted,myScore,viewerRole:viewer.role},200,origin);
        }
        if (pathname === "/quiz/heartbeat" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").toUpperCase().slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          if(!token) return response({error:"Sesi room tidak ditemukan."},401,origin);
          const touched=await env.DB.prepare("UPDATE quiz_room_players SET last_seen=? WHERE room_code=? AND session_token=?").bind(new Date().toISOString(),code,token).run();
          if(!touched.meta?.changes) return response({error:"Sesi peserta tidak valid."},401,origin);
          return response({success:true},200,origin);
        }
        if (pathname === "/quiz/answer" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").replace(/[^0-9]/g,"").slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const member=await env.DB.prepare("SELECT p.id,p.role,p.submitted_at AS submittedAt,r.status,r.pack_id AS packId FROM quiz_room_players p JOIN quiz_rooms r ON r.code=p.room_code WHERE p.room_code=? AND p.session_token=?").bind(code,token).first();
          if(!member||member.role!=="player")return response({error:"Sesi peserta tidak valid."},403,origin);
          if(member.status!=="started"||member.submittedAt)return response({error:"Kuis sudah selesai untuk akun ini."},409,origin);
          const pack=await env.DB.prepare("SELECT questions_json FROM quiz_question_bank WHERE id=?").bind(member.packId).first();
          const all=JSON.parse(pack?.questions_json||"[]");
          const progress=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_question_answers WHERE room_code=? AND player_id=?").bind(code,member.id).first();
          const index=Number(progress?.total||0),q=all[index];
          if(!q)return response({error:"Seluruh soal sudah dikerjakan."},409,origin);
          const selected=Number(body.answer);
          if(!Number.isInteger(selected)||selected<0||selected>=q.options.length)return response({error:"Pilihan jawaban tidak valid."},400,origin);
          const now=new Date().toISOString(),correct=selected===Number(q.correct)?1:0;
          const saved=await env.DB.prepare("INSERT INTO quiz_question_answers(id,room_code,player_id,question_index,selected_option,is_correct,submitted_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(room_code,player_id,question_index) DO NOTHING").bind("qa_"+randomString(12),code,member.id,index,selected,correct,now).run();
          if(!saved.meta?.changes)return response({error:"Jawaban soal ini sudah tersimpan. Soal berikutnya sedang dimuat."},409,origin);
          const nextProgress=index+1;
          let completed=false,score=null,roomCompleted=false;
          if(nextProgress>=all.length){
            const correctTotal=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_question_answers WHERE room_code=? AND player_id=? AND is_correct=1").bind(code,member.id).first();
            score=Math.round(Number(correctTotal?.total||0)*100/all.length);
            await env.DB.prepare("UPDATE quiz_room_players SET last_seen=?,score=?,submitted_at=? WHERE id=?").bind(now,score,now,member.id).run();
            completed=true;
            const remaining=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_room_players WHERE room_code=? AND role='player' AND submitted_at IS NULL").bind(code).first();
            if(Number(remaining?.total||0)===0){
              const finished=await env.DB.prepare("UPDATE quiz_rooms SET status='completed',updated_at=? WHERE code=? AND status='started'").bind(now,code).run();
              roomCompleted=!!finished.meta?.changes;
            }
          }else{
            await env.DB.prepare("UPDATE quiz_room_players SET last_seen=? WHERE id=?").bind(now,member.id).run();
          }
          await notifyQuizRoom(env,code,completed?"player_completed":"answer_submitted");
          if(roomCompleted)await notifyQuizRoom(env,code,"completed");
          const nextQuestion=!completed&&all[nextProgress]?{index:nextProgress,question:all[nextProgress].question,options:all[nextProgress].options}:null;
          const correctCount=await env.DB.prepare("SELECT COUNT(*) AS total FROM quiz_question_answers WHERE room_code=? AND player_id=? AND is_correct=1").bind(code,member.id).first();
          return response({success:true,saved:true,progress:nextProgress,total:all.length,completed,score,roomCompleted,isCorrect:!!correct,correctCount:Number(correctCount?.total||0),nextQuestion},200,origin);
        }
        if (pathname === "/quiz/next" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").replace(/[^0-9]/g,"").slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const host=await env.DB.prepare("SELECT p.id,r.status,r.game_mode AS gameMode FROM quiz_room_players p JOIN quiz_rooms r ON r.code=p.room_code WHERE p.room_code=? AND p.session_token=? AND p.role='host'").bind(code,token).first();
          if(!host)return response({error:"Hanya guru/host room yang dapat melanjutkan soal."},403,origin);
          if(host.status!=="started"||host.gameMode!=="together")return response({error:"Perpindahan manual hanya berlaku pada mode Kuis Bersama."},409,origin);
          const moved=await advanceQuizRoom(env,code,true);
          if(!moved)return response({error:"Soal belum dapat dilanjutkan atau room sudah selesai."},409,origin);
          return response({success:true},200,origin);
        }
        if (pathname === "/quiz/start" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").toUpperCase().slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const host=await env.DB.prepare("SELECT p.id,r.start_at AS startAt,r.pack_id AS packId FROM quiz_room_players p JOIN quiz_rooms r ON r.code=p.room_code WHERE p.room_code=? AND p.session_token=? AND p.role='host'").bind(code,token).first();
          if(!host) return response({error:"Hanya host room yang boleh memulai."},403,origin);
          if(host.startAt&&host.startAt>new Date().toISOString()) return response({error:"Kuis belum waktunya dimulai. Tunggu sampai jadwal mulai."},409,origin);
          const pack=await env.DB.prepare("SELECT questions_json FROM quiz_question_bank WHERE id=?").bind(host.packId).first();
          const questions=JSON.parse(pack?.questions_json||"[]");
          if(!questions.length)return response({error:"Paket soal kosong."},409,origin);
          const startedIso=new Date().toISOString();
          // Masa aktif room diperpanjang setelah mulai; ini hanya masa simpan room,
          // bukan batas waktu pengerjaan siswa.
          const roomExpiry=new Date(Date.now()+30*24*60*60*1000).toISOString();
          const result=await env.DB.prepare("UPDATE quiz_rooms SET status='started',started_at=?,ends_at=NULL,question_index=0,question_started_at=?,question_ends_at=NULL,expires_at=?,updated_at=? WHERE code=? AND status='waiting'").bind(startedIso,startedIso,roomExpiry,startedIso,code).run();
          if(!result.meta?.changes) return response({error:"Room sudah dimulai atau tidak tersedia."},409,origin);
          await notifyQuizRoom(env,code,"started");
          return response({success:true,status:"started"},200,origin);
        }
        if (pathname === "/quiz/leave" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").toUpperCase().slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const member=await env.DB.prepare("SELECT role FROM quiz_room_players WHERE room_code=? AND session_token=?").bind(code,token).first();
          if(!member) return response({success:true},200,origin);
          if(member.role==="host"){
            await env.DB.prepare("DELETE FROM quiz_room_players WHERE room_code=?").bind(code).run();
            await env.DB.prepare("DELETE FROM quiz_rooms WHERE code=?").bind(code).run();
          }else{
            await env.DB.prepare("DELETE FROM quiz_room_players WHERE room_code=? AND session_token=?").bind(code,token).run();
          }
          await notifyQuizRoom(env, code, "left");
          return response({success:true},200,origin);
        }
        return response({error:"Endpoint lobby VEXEL QUIZ tidak ditemukan."},404,origin);
      } catch(error) {
        return response({error:"Lobby gagal memproses permintaan: "+String(error.message||error).slice(0,180)},500,origin);
      }
    }

    // SOCIAL + DIRECT MESSAGE API (existing D1 database)
    if(pathname.startsWith("/admin/social/")){
      const adminOk=Boolean((env.UPLOAD_KEY&&await verifyAdminSession(suppliedToken,env.UPLOAD_KEY))||await verifyGoogleSession(suppliedToken,env.AUTH_SECRET,"admin"));
      if(!adminOk)return response({error:"Akses moderator diperlukan."},401,origin);
      if(!env.DB)return response({error:"Database belum tersedia."},503,origin);
      try{
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open')").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_suspensions (user_id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL, admin_email TEXT)").run();
        if(pathname==="/admin/social/users"&&request.method==="GET"){
          const q=String(new URL(request.url).searchParams.get("q")||"").trim().slice(0,50);
          const rows=await env.DB.prepare("SELECT u.id,u.nickname,u.avatar_url AS avatarUrl,u.email,COALESCE((SELECT COUNT(*) FROM social_posts p WHERE p.user_id=u.id),0) AS postCount,COALESCE((SELECT COUNT(*) FROM social_follows f WHERE f.following_id=u.id),0) AS followerCount,CASE WHEN s.user_id IS NULL THEN 0 ELSE 1 END AS suspended,s.reason AS suspensionReason FROM users u LEFT JOIN social_suspensions s ON s.user_id=u.id WHERE u.role='player' AND (?='' OR u.nickname LIKE '%'||?||'%' OR u.email LIKE '%'||?||'%') ORDER BY u.id DESC LIMIT 100").bind(q,q,q).all();
          return response({success:true,players:rows.results||[]},200,origin);
        }
        const userMatch=pathname.match(/^\/admin\/social\/users\/([^/]+)\/(suspend|restore)$/);
        if(userMatch&&request.method==="POST"){
          const userId=decodeURIComponent(userMatch[1]).slice(0,64),action=userMatch[2],body=await request.json().catch(()=>({}));
          const target=await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='player'").bind(userId).first();
          if(!target)return response({error:"Akun pemain tidak ditemukan."},404,origin);
          if(action==="suspend"){
            const reason=String(body.reason||"Pelanggaran pedoman komunitas").trim().slice(0,250);
            await env.DB.prepare("INSERT INTO social_suspensions(user_id,reason,created_at,admin_email) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,created_at=excluded.created_at,admin_email=excluded.admin_email").bind(userId,reason,socialNow(),ADMIN_EMAIL).run();
          }else await env.DB.prepare("DELETE FROM social_suspensions WHERE user_id=?").bind(userId).run();
          return response({success:true,suspended:action==="suspend"},200,origin);
        }
        const removeMatch=pathname.match(/^\/admin\/social\/content\/(post|comment)\/(\d+)$/);
        if(removeMatch&&request.method==="DELETE"){
          const type=removeMatch[1],id=Number(removeMatch[2]);
          if(type==="post"){
            const post=await env.DB.prepare("SELECT id FROM social_posts WHERE id=?").bind(id).first();
            if(!post)return response({error:"Postingan tidak ditemukan."},404,origin);
            await env.DB.prepare("DELETE FROM social_comments WHERE post_id=?").bind(id).run();
            await env.DB.prepare("DELETE FROM social_likes WHERE post_id=?").bind(id).run();
            await env.DB.prepare("DELETE FROM social_posts WHERE id=?").bind(id).run();
          }else{
            const result=await env.DB.prepare("DELETE FROM social_comments WHERE id=?").bind(id).run();
            if(!result.meta?.changes)return response({error:"Komentar tidak ditemukan."},404,origin);
          }
          return response({success:true,deleted:true},200,origin);
        }
        if(pathname==="/admin/social/reports"&&request.method==="GET"){
          const status=new URL(request.url).searchParams.get("status")==="all"?"all":"open";
          const rows=await env.DB.prepare("SELECT r.id,r.target_type AS targetType,r.target_id AS targetId,r.reason,r.created_at AS createdAt,r.status,u.nickname AS reporterNickname FROM social_reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE (?='all' OR r.status='open') ORDER BY r.id DESC LIMIT 100").bind(status).all();
          return response({success:true,reports:rows.results||[]},200,origin);
        }
        const match=pathname.match(/^\/admin\/social\/reports\/(\d+)$/);
        if(match&&request.method==="POST"){
          const body=await request.json().catch(()=>({})),status=String(body.status||"");
          if(!["resolved","dismissed"].includes(status))return response({error:"Status harus resolved atau dismissed."},400,origin);
          const result=await env.DB.prepare("UPDATE social_reports SET status=? WHERE id=?").bind(status,Number(match[1])).run();
          if(!result.meta?.changes)return response({error:"Laporan tidak ditemukan."},404,origin);
          return response({success:true,status},200,origin);
        }
        return response({error:"Endpoint moderasi tidak ditemukan."},404,origin);
      }catch(error){return response({error:"Moderasi sosial gagal diproses."},500,origin);}
    }

    if (pathname.startsWith("/social/") || pathname.startsWith("/dm/")) {
      const playerSession = await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "player");
      if (!playerSession) return response({ error: "Login pemain diperlukan untuk menggunakan Sosial dan DM." }, 401, origin);
      if (!env.DB) return response({ error: "Database pemain belum tersedia." }, 503, origin);
      try {
        const account = await env.DB.prepare(
          "SELECT id,nickname,avatar_url AS avatarUrl FROM users WHERE google_sub=? AND role='player'"
        ).bind(playerSession.sub).first();
        if (!account || !account.nickname) return response({ error: "Lengkapi nickname profil terlebih dahulu." }, 403, origin);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_suspensions (user_id TEXT PRIMARY KEY, reason TEXT NOT NULL, created_at TEXT NOT NULL, admin_email TEXT)").run();
        const suspension=await env.DB.prepare("SELECT reason FROM social_suspensions WHERE user_id=?").bind(account.id).first();
        if(suspension)return response({error:"Akses VEXEL SOCIAL akun ini sedang dibatasi moderator. Alasan: "+suspension.reason},403,origin);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, last_seen TEXT NOT NULL, activity TEXT NOT NULL DEFAULT 'online')").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS direct_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_id,recipient_id,id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id,read_at,id)").run();


        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_posts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body)<=500), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(id DESC)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_likes (post_id INTEGER NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(post_id,user_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id TEXT NOT NULL, body TEXT NOT NULL CHECK(length(body)<=500), created_at TEXT NOT NULL)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id,id)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_follows (follower_id TEXT NOT NULL, following_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(follower_id,following_id), CHECK(follower_id<>following_id))").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_social_following ON social_follows(follower_id,created_at DESC)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_social_followers ON social_follows(following_id,created_at DESC)").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(blocker_id,blocked_id), CHECK(blocker_id<>blocked_id))").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open')").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS social_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, recipient_id TEXT NOT NULL, actor_id TEXT NOT NULL, type TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL, read_at TEXT)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_social_notifications_recipient ON social_notifications(recipient_id,id DESC)").run();
        const socialNow = () => new Date().toISOString();
        const socialPlayer = async (id) => env.DB.prepare("SELECT id,nickname,avatar_url AS avatarUrl FROM users WHERE id=? AND role='player' AND nickname IS NOT NULL").bind(id).first();
        const socialBlocked = async (otherId) => !!(await env.DB.prepare("SELECT 1 FROM social_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)").bind(account.id,otherId,otherId,account.id).first());

        if(pathname==="/social/user-posts" && request.method==="GET"){
          const url=new URL(request.url),userId=String(url.searchParams.get("userId")||account.id).slice(0,64);
          if(await socialBlocked(userId))return response({error:"Postingan pemain ini tidak tersedia."},403,origin);
          const limit=Math.min(30,Math.max(1,Number(url.searchParams.get("limit")||20)));
          const rows=await env.DB.prepare("SELECT p.id,p.body,p.created_at AS createdAt,u.id AS userId,u.nickname,u.avatar_url AS avatarUrl,(SELECT COUNT(*) FROM social_likes l WHERE l.post_id=p.id) AS likeCount,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) AS commentCount,EXISTS(SELECT 1 FROM social_likes mine WHERE mine.post_id=p.id AND mine.user_id=?) AS liked FROM social_posts p JOIN users u ON u.id=p.user_id WHERE p.user_id=? ORDER BY p.id DESC LIMIT ?").bind(account.id,userId,limit).all();
          return response({success:true,posts:rows.results||[]},200,origin);
        }
        if (pathname === "/social/posts" && request.method === "GET") {
          const url = new URL(request.url);
          const scope = url.searchParams.get("scope") === "following" ? "following" : "all";
          const requestedLimit = Number(url.searchParams.get("limit") || 10);
          const limit = Number.isFinite(requestedLimit) ? Math.min(20, Math.max(1, Math.floor(requestedLimit))) : 10;
          const requestedBefore = Number(url.searchParams.get("before") || 0);
          const before = Number.isSafeInteger(requestedBefore) && requestedBefore > 0 ? requestedBefore : 0;
          // Build only active filters so D1 placeholders always match bindings.
          const feedFilters = [
            "NOT EXISTS (SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?))"
          ];
          const feedBindings = [account.id, account.id];
          if (scope === "following") {
            feedFilters.push("EXISTS (SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.following_id=p.user_id)");
            feedBindings.push(account.id);
          }
          if (before > 0) {
            feedFilters.push("p.id < ?");
            feedBindings.push(before);
          }
          feedBindings.push(limit);
          const rows = await env.DB.prepare(
            "SELECT p.id,p.body,p.created_at AS createdAt,u.id AS userId,u.nickname,u.avatar_url AS avatarUrl,(SELECT COUNT(*) FROM social_likes l WHERE l.post_id=p.id) AS likeCount,(SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) AS commentCount,EXISTS(SELECT 1 FROM social_likes mine WHERE mine.post_id=p.id AND mine.user_id=?) AS liked FROM social_posts p JOIN users u ON u.id=p.user_id WHERE " + feedFilters.join(" AND ") + " ORDER BY p.id DESC LIMIT ?"
          ).bind(account.id, ...feedBindings).all();
          const posts = rows.results || [];
          return response({success:true,posts,nextBefore:posts.length ? posts[posts.length-1].id : null},200,origin);
        }
        if (pathname === "/social/posts" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const content=String(body.body||"").trim();
          if(!content||content.length>500)return response({error:"Postingan wajib diisi dan maksimal 500 karakter."},400,origin);
          const now=socialNow();
          const saved=await env.DB.prepare("INSERT INTO social_posts(user_id,body,created_at,updated_at) VALUES(?,?,?,?)").bind(account.id,content,now,now).run();
          return response({success:true,post:{id:saved.meta?.last_row_id||null,body:content,createdAt:now,userId:account.id,nickname:account.nickname}},201,origin);
        }
        const postLikeMatch=pathname.match(/^\/social\/posts\/(\d+)\/like$/);
        if(postLikeMatch && request.method==="POST"){
          const postId=Number(postLikeMatch[1]);
          const exists=await env.DB.prepare("SELECT id FROM social_posts WHERE id=?").bind(postId).first();
          if(!exists)return response({error:"Postingan tidak ditemukan."},404,origin);
          const likeOwner=await env.DB.prepare("SELECT user_id FROM social_posts WHERE id=?").bind(postId).first();
          if(likeOwner&&await socialBlocked(likeOwner.user_id))return response({error:"Postingan tidak tersedia."},403,origin);
          const old=await env.DB.prepare("SELECT 1 FROM social_likes WHERE post_id=? AND user_id=?").bind(postId,account.id).first();
          if(old){await env.DB.prepare("DELETE FROM social_likes WHERE post_id=? AND user_id=?").bind(postId,account.id).run();}
          else{
            await env.DB.prepare("INSERT INTO social_likes(post_id,user_id,created_at) VALUES(?,?,?)").bind(postId,account.id,socialNow()).run();
            const owner=await env.DB.prepare("SELECT user_id FROM social_posts WHERE id=?").bind(postId).first();
            if(owner&&owner.user_id!==account.id)await env.DB.prepare("INSERT INTO social_notifications(recipient_id,actor_id,type,target_id,created_at) VALUES(?,?,?,?,?)").bind(owner.user_id,account.id,"like",String(postId),socialNow()).run();
          }
          const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM social_likes WHERE post_id=?").bind(postId).first();
          return response({success:true,liked:!old,likeCount:count?.total||0},200,origin);
        }
        const postCommentsMatch=pathname.match(/^\/social\/posts\/(\d+)\/comments$/);
        if(postCommentsMatch){
          const postId=Number(postCommentsMatch[1]);
          const post=await env.DB.prepare("SELECT user_id FROM social_posts WHERE id=?").bind(postId).first();
          if(!post)return response({error:"Postingan tidak ditemukan."},404,origin);
          if(await socialBlocked(post.user_id))return response({error:"Postingan tidak tersedia."},403,origin);
          if(request.method==="GET"){
            const rows=await env.DB.prepare("SELECT c.id,c.body,c.created_at AS createdAt,u.id AS userId,u.nickname,u.avatar_url AS avatarUrl FROM social_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=? ORDER BY c.id ASC LIMIT 100").bind(postId).all();
            return response({success:true,comments:rows.results||[]},200,origin);
          }
          if(request.method==="POST"){
            const body=await request.json().catch(()=>({}));
            const content=String(body.body||"").trim();
            if(!content||content.length>500)return response({error:"Komentar wajib diisi dan maksimal 500 karakter."},400,origin);
            const now=socialNow();
            const saved=await env.DB.prepare("INSERT INTO social_comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)").bind(postId,account.id,content,now).run();
            if(post.user_id!==account.id)await env.DB.prepare("INSERT INTO social_notifications(recipient_id,actor_id,type,target_id,created_at) VALUES(?,?,?,?,?)").bind(post.user_id,account.id,"comment",String(postId),now).run();
            return response({success:true,comment:{id:saved.meta?.last_row_id||null,body:content,createdAt:now,userId:account.id,nickname:account.nickname}},201,origin);
          }
        }
        const postDeleteMatch=pathname.match(/^\/social\/posts\/(\d+)$/);
        if(postDeleteMatch && ["DELETE","PUT"].includes(request.method)){
          const postId=Number(postDeleteMatch[1]);
          const post=await env.DB.prepare("SELECT user_id FROM social_posts WHERE id=?").bind(postId).first();
          if(!post)return response({error:"Postingan tidak ditemukan."},404,origin);
          if(post.user_id!==account.id)return response({error:"Kamu hanya dapat mengubah postingan sendiri."},403,origin);
        if(request.method==="PUT"){
          const body=await request.json().catch(()=>({}));
          const content=String(body.body||"").trim();
          if(!content||content.length>500)return response({error:"Postingan wajib diisi dan maksimal 500 karakter."},400,origin);
          const updatedAt=socialNow();
          await env.DB.prepare("UPDATE social_posts SET body=?,updated_at=? WHERE id=? AND user_id=?").bind(content,updatedAt,postId,account.id).run();
          return response({success:true,post:{id:postId,body:content,updatedAt}},200,origin);
        }
        if(post.user_id!==account.id)return response({error:"Kamu hanya dapat menghapus postingan sendiri."},403,origin);
          await env.DB.prepare("DELETE FROM social_comments WHERE post_id=?").bind(postId).run();
          await env.DB.prepare("DELETE FROM social_likes WHERE post_id=?").bind(postId).run();
          await env.DB.prepare("DELETE FROM social_posts WHERE id=?").bind(postId).run();
          return response({success:true},200,origin);
        }
        const commentDeleteMatch=pathname.match(/^\/social\/comments\/(\d+)$/);
        if(commentDeleteMatch && request.method==="DELETE"){
          const commentId=Number(commentDeleteMatch[1]);
          const comment=await env.DB.prepare("SELECT user_id FROM social_comments WHERE id=?").bind(commentId).first();
          if(!comment)return response({error:"Komentar tidak ditemukan."},404,origin);
          if(comment.user_id!==account.id)return response({error:"Kamu hanya dapat menghapus komentar sendiri."},403,origin);
          await env.DB.prepare("DELETE FROM social_comments WHERE id=?").bind(commentId).run();
          return response({success:true},200,origin);
        }
        const followMatch=pathname.match(/^\/social\/follow\/([^/]+)$/);
        if(followMatch && ["POST","DELETE"].includes(request.method)){
          const otherId=decodeURIComponent(followMatch[1]).slice(0,64);
          if(otherId===account.id)return response({error:"Kamu tidak dapat mengikuti akun sendiri."},400,origin);
          const other=await socialPlayer(otherId);
          if(!other)return response({error:"Pemain tidak ditemukan."},404,origin);
          if(await socialBlocked(otherId))return response({error:"Relasi tidak tersedia karena pemblokiran akun."},403,origin);
          if(request.method==="POST"){
            const prior=await env.DB.prepare("SELECT 1 FROM social_follows WHERE follower_id=? AND following_id=?").bind(account.id,otherId).first();
            await env.DB.prepare("INSERT OR IGNORE INTO social_follows(follower_id,following_id,created_at) VALUES(?,?,?)").bind(account.id,otherId,socialNow()).run();
            if(!prior)await env.DB.prepare("INSERT INTO social_notifications(recipient_id,actor_id,type,target_id,created_at) VALUES(?,?,?,?,?)").bind(otherId,account.id,"follow",otherId,socialNow()).run();
          }else await env.DB.prepare("DELETE FROM social_follows WHERE follower_id=? AND following_id=?").bind(account.id,otherId).run();
          const state=await env.DB.prepare("SELECT 1 FROM social_follows WHERE follower_id=? AND following_id=?").bind(account.id,otherId).first();
          return response({success:true,following:!!state},200,origin);
        }
        if(pathname==="/social/search" && request.method==="GET"){
          const q=String(new URL(request.url).searchParams.get("q")||"").trim().replace(/[\\%_]/g,"").slice(0,32);
          const rows=await env.DB.prepare("SELECT u.id,u.nickname,u.avatar_url AS avatarUrl,EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.following_id=u.id) AS following,(SELECT COUNT(*) FROM social_follows x WHERE x.following_id=u.id) AS followerCount FROM users u WHERE u.role='player' AND u.nickname IS NOT NULL AND u.id<>? AND (?='' OR u.nickname LIKE ?) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY u.nickname LIMIT 50").bind(account.id,account.id,q,q?"%"+q+"%":"",account.id,account.id).all();
          return response({success:true,players:rows.results||[]},200,origin);
        }
        if(pathname==="/social/profile" && request.method==="GET"){
          const userId=String(new URL(request.url).searchParams.get("id")||"").slice(0,64);
          const target=await socialPlayer(userId);
          if(!target)return response({error:"Profil pemain tidak ditemukan."},404,origin);
          if(await socialBlocked(userId))return response({error:"Profil tidak tersedia."},403,origin);
          const counts=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM social_posts WHERE user_id=?) AS postCount,(SELECT COUNT(*) FROM social_follows WHERE following_id=?) AS followerCount,(SELECT COUNT(*) FROM social_follows WHERE follower_id=?) AS followingCount,(SELECT COUNT(*) FROM social_follows WHERE follower_id=? AND following_id=?) AS isFollowing").bind(userId,userId,userId,account.id,userId).first();
          return response({success:true,profile:{...target,...counts}},200,origin);
        }
        if(pathname==="/social/followers" || pathname==="/social/following"){
          if(request.method!=="GET")return response({error:"Gunakan metode GET."},405,origin);
          const userId=String(new URL(request.url).searchParams.get("userId")||account.id).slice(0,64);
          const column=pathname.endsWith("/followers")?"following_id":"follower_id";
          const joinColumn=pathname.endsWith("/followers")?"follower_id":"following_id";
          const rows=await env.DB.prepare("SELECT u.id,u.nickname,u.avatar_url AS avatarUrl FROM social_follows f JOIN users u ON u.id=f."+joinColumn+" WHERE f."+column+"=? AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY f.created_at DESC LIMIT 100").bind(userId,account.id,account.id).all();
          return response({success:true,players:rows.results||[]},200,origin);
        }
        if(pathname==="/social/notifications" && request.method==="GET"){
          const rows=await env.DB.prepare("SELECT n.id,n.type,n.target_id AS targetId,n.created_at AS createdAt,n.read_at AS readAt,u.id AS actorId,u.nickname,u.avatar_url AS avatarUrl FROM social_notifications n JOIN users u ON u.id=n.actor_id WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 50").bind(account.id).all();
          return response({success:true,notifications:rows.results||[]},200,origin);
        }
        if(pathname==="/social/notifications/read" && request.method==="POST"){
          await env.DB.prepare("UPDATE social_notifications SET read_at=? WHERE recipient_id=? AND read_at IS NULL").bind(socialNow(),account.id).run();
          return response({success:true},200,origin);
        }
        const blockMatch=pathname.match(/^\/social\/block\/([^/]+)$/);
        if(blockMatch && ["POST","DELETE"].includes(request.method)){
          const otherId=decodeURIComponent(blockMatch[1]).slice(0,64);
          if(otherId===account.id)return response({error:"Tidak dapat memblokir akun sendiri."},400,origin);
          if(!await socialPlayer(otherId))return response({error:"Pemain tidak ditemukan."},404,origin);
          if(request.method==="POST"){
            await env.DB.prepare("INSERT OR IGNORE INTO social_blocks(blocker_id,blocked_id,created_at) VALUES(?,?,?)").bind(account.id,otherId,socialNow()).run();
            await env.DB.prepare("DELETE FROM social_follows WHERE (follower_id=? AND following_id=?) OR (follower_id=? AND following_id=?)").bind(account.id,otherId,otherId,account.id).run();
          }else await env.DB.prepare("DELETE FROM social_blocks WHERE blocker_id=? AND blocked_id=?").bind(account.id,otherId).run();
          return response({success:true,blocked:request.method==="POST"},200,origin);
        }
        if(pathname==="/social/report" && request.method==="POST"){
          const body=await request.json().catch(()=>({}));
          const type=String(body.targetType||"").slice(0,20);
          const targetId=String(body.targetId||"").slice(0,64);
          const reason=String(body.reason||"").trim().slice(0,300);
          if(!["post","comment","user"].includes(type)||!targetId||!reason)return response({error:"Jenis, target, dan alasan laporan wajib diisi."},400,origin);
          await env.DB.prepare("INSERT INTO social_reports(reporter_id,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?)").bind(account.id,type,targetId,reason,socialNow()).run();
          return response({success:true},201,origin);
        }
        if (pathname === "/social/heartbeat") {
          if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
          await env.DB.prepare("INSERT INTO player_presence (user_id,last_seen,activity) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen,activity=excluded.activity")
            .bind(account.id, new Date().toISOString(), "online").run();
          return response({ success: true }, 200, origin);
        }
        if (pathname === "/social/online" && request.method === "GET") {
          const result = await env.DB.prepare(
            "SELECT u.id,u.nickname,u.avatar_url AS avatarUrl,p.last_seen AS lastSeen FROM player_presence p JOIN users u ON u.id=p.user_id WHERE u.role='player' AND u.nickname IS NOT NULL AND u.id<>? AND p.last_seen>=? AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) ORDER BY p.last_seen DESC LIMIT 100"
          ).bind(account.id, new Date(Date.now()-90000).toISOString(),account.id,account.id).all();
          return response({ success: true, players: result.results || [] }, 200, origin);
        }
        if (pathname === "/dm/inbox" && request.method === "GET") {
          const result = await env.DB.prepare(
            "SELECT u.id AS userId,u.nickname,u.avatar_url AS avatarUrl,m.body AS lastMessage,m.created_at AS lastMessageAt,m.sender_id AS lastSenderId,(SELECT COUNT(*) FROM direct_messages unread WHERE unread.sender_id=u.id AND unread.recipient_id=? AND unread.read_at IS NULL) AS unreadCount FROM direct_messages m JOIN users u ON u.id=CASE WHEN m.sender_id=? THEN m.recipient_id ELSE m.sender_id END WHERE (m.sender_id=? OR m.recipient_id=?) AND NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?)) AND m.id IN (SELECT MAX(id) FROM direct_messages WHERE sender_id=? OR recipient_id=? GROUP BY CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END) ORDER BY m.id DESC LIMIT 100"
          ).bind(account.id,account.id,account.id,account.id,account.id,account.id,account.id,account.id,account.id).all();
          return response({ success: true, conversations: result.results || [] }, 200, origin);
        }
        if (pathname === "/dm/messages" && request.method === "GET") {
          const otherId = String(new URL(request.url).searchParams.get("with") || "").slice(0,64);
          if (!otherId || otherId === account.id) return response({ error: "Penerima pesan tidak valid." }, 400, origin);
          if(await socialBlocked(otherId))return response({error:"Percakapan tidak tersedia karena pemblokiran akun."},403,origin);
          const other = await env.DB.prepare("SELECT id,nickname,avatar_url AS avatarUrl FROM users WHERE id=? AND role='player' AND nickname IS NOT NULL").bind(otherId).first();
          if (!other) return response({ error: "Pemain tidak ditemukan." }, 404, origin);
          const result = await env.DB.prepare(
            "SELECT id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt,read_at AS readAt FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY id DESC LIMIT 100"
          ).bind(account.id,otherId,otherId,account.id).all();
          await env.DB.prepare("UPDATE direct_messages SET read_at=? WHERE sender_id=? AND recipient_id=? AND read_at IS NULL").bind(new Date().toISOString(),otherId,account.id).run();
          return response({ success: true, player: other, messages: (result.results || []).reverse() }, 200, origin);
        }
        if (pathname === "/dm/send" && request.method === "POST") {
          const body = await request.json().catch(()=>({}));
          const recipientId = String(body.recipientId || "").slice(0,64);
          const message = String(body.message || "").trim();
          if (!recipientId || recipientId === account.id) return response({ error: "Penerima pesan tidak valid." }, 400, origin);
          if (!message || message.length > 2000) return response({ error: "Pesan wajib diisi dan maksimal 2.000 karakter." }, 400, origin);
          if(await socialBlocked(recipientId))return response({error:"Pesan tidak dapat dikirim karena pemblokiran akun."},403,origin);
          const recipient = await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='player' AND nickname IS NOT NULL").bind(recipientId).first();
          if (!recipient) return response({ error: "Pemain tujuan tidak ditemukan." }, 404, origin);
          const createdAt = new Date().toISOString();
          const saved = await env.DB.prepare("INSERT INTO direct_messages (sender_id,recipient_id,body,created_at) VALUES (?,?,?,?)").bind(account.id,recipientId,message,createdAt).run();
          return response({ success: true, message: { id: saved.meta?.last_row_id || null, senderId: account.id, recipientId, body: message, createdAt, readAt: null } }, 201, origin);
        }
        return response({ error: "Endpoint Sosial/DM tidak ditemukan." }, 404, origin);
      } catch (error) {
        return response({ error: "Layanan Sosial belum berhasil memproses permintaan." }, 500, origin);
      }
    }

    if (pathname === "/auth/me" && request.method === "GET") {
      const session = await verifyGoogleSession(suppliedToken, env.AUTH_SECRET);
      if (!session) return response({ error: "Sesi login tidak valid atau sudah berakhir." }, 401, origin);
      if (!env.DB) return response({ error: "Database akun belum tersedia." }, 503, origin);
      const user = await env.DB.prepare(
        "SELECT id,email,display_name AS displayName,avatar_url AS avatarUrl,nickname,role,created_at AS createdAt FROM users WHERE google_sub=?"
      ).bind(session.sub).first();
      if (!user) return response({ error: "Akun tidak ditemukan." }, 404, origin);
      return response({ success: true, user }, 200, origin);
    }
    if (pathname === "/auth/profile") {
      if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
      const session = await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "player");
      if (!session) return response({ error: "Login pemain diperlukan." }, 401, origin);
      if (!env.DB) return response({ error: "Database akun belum tersedia." }, 503, origin);
      try {
        const body = await request.json();
        const nickname = String(body.nickname || "").trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(nickname)) {
          return response({ error: "Nickname harus 3–16 karakter dan hanya boleh memakai huruf, angka, atau garis bawah." }, 400, origin);
        }
        const normalized = nickname.toLowerCase();
        const existing = await env.DB.prepare(
          "SELECT id FROM users WHERE nickname_norm=? AND google_sub<>?"
        ).bind(normalized, session.sub).first();
        if (existing) return response({ error: "Nickname sudah digunakan. Silakan pilih yang lain." }, 409, origin);
        await env.DB.prepare(
          "UPDATE users SET nickname=?,nickname_norm=?,updated_at=? WHERE google_sub=? AND role='player'"
        ).bind(nickname, normalized, new Date().toISOString(), session.sub).run();
        const user = await env.DB.prepare(
          "SELECT id,email,display_name AS displayName,avatar_url AS avatarUrl,nickname,role FROM users WHERE google_sub=?"
        ).bind(session.sub).first();
        return response({ success: true, user }, 200, origin);
      } catch (error) {
        return response({ error: "Profil belum berhasil disimpan." }, 500, origin);
      }
    }

    if (pathname === "/session") {
      if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
      const valid = (env.UPLOAD_KEY && await verifyAdminSession(suppliedToken, env.UPLOAD_KEY)) || Boolean(await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "admin"));
      return valid ? response({success:true,authenticated:true},200,origin)
        : response({error:"Session admin sudah berakhir. Silakan login kembali."},401,origin);
    }

    // GAME PLAY STATS API — penghitung jumlah game dimainkan (D1: DB)
    if (pathname === "/game-stats" && request.method === "GET") {
      if (!env.DB) return response({ error: "Database statistik game belum dihubungkan." }, 503, origin);
      try {
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS game_stats (game_id TEXT PRIMARY KEY, play_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ).run();
        const result = await env.DB.prepare(
          "SELECT game_id AS gameId, play_count AS playCount FROM game_stats ORDER BY play_count DESC"
        ).all();
        return response({ success: true, stats: result.results || [] }, 200, origin);
      } catch (error) {
        return response({ error: "Gagal membaca statistik permainan: " + String(error.message || error) }, 500, origin);
      }
    }

    if (pathname === "/game-play" && request.method === "POST") {
      if (!env.DB) return response({ error: "Database statistik game belum dihubungkan." }, 503, origin);
      try {
        const body = await request.json().catch(() => ({}));
        const gameId = safeSlug(body.gameId || "");
        if (!gameId) return response({ error: "gameId wajib diisi." }, 400, origin);
        await env.DB.prepare(
          "CREATE TABLE IF NOT EXISTS game_stats (game_id TEXT PRIMARY KEY, play_count INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        ).run();
        await env.DB.prepare(
          "INSERT INTO game_stats (game_id, play_count, updated_at) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(game_id) DO UPDATE SET play_count = game_stats.play_count + 1, updated_at = CURRENT_TIMESTAMP"
        ).bind(gameId).run();
        const saved = await env.DB.prepare(
          "SELECT play_count AS playCount FROM game_stats WHERE game_id = ?"
        ).bind(gameId).first();
        return response({ success: true, gameId, playCount: Number(saved?.playCount || 0) }, 200, origin);
      } catch (error) {
        return response({ error: "Gagal mencatat permainan: " + String(error.message || error) }, 500, origin);
      }
    }

    // LEADERBOARD API — memakai Cloudflare D1 (binding: DB)
    if (pathname === "/leaderboard" && request.method === "GET") {
      if (!env.DB) return response({ error: "Database leaderboard belum dihubungkan." }, 503, origin);
      const gameId = safeSlug(new URL(request.url).searchParams.get("gameId") || "");
      if (!gameId) return response({ error: "gameId wajib diisi." }, 400, origin);
      try {
        const result = await env.DB.prepare(
          "SELECT player_name AS playerName, best_score AS score, updated_at AS updatedAt FROM leaderboard WHERE game_id = ? ORDER BY best_score DESC, updated_at ASC LIMIT 100"
        ).bind(gameId).all();
        return response({ success: true, gameId, rankings: result.results || [] }, 200, origin);
      } catch (error) {
        return response({ error: "Gagal membaca papan peringkat. Pastikan tabel leaderboard sudah dibuat." }, 500, origin);
      }
    }

    if (pathname === "/leaderboard/submit") {
      if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
      if (!env.DB) return response({ error: "Database leaderboard belum dihubungkan." }, 503, origin);
      try {
        // Identitas skor wajib berasal dari sesi Google dan nickname resmi di database.
        const playerSession = await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "player");
        if (!playerSession) return response({ error: "Login pemain diperlukan untuk mengirim skor." }, 401, origin);
        const account = await env.DB.prepare(
          "SELECT id,nickname FROM users WHERE google_sub=? AND role='player'"
        ).bind(playerSession.sub).first();
        if (!account || !account.nickname) {
          return response({ error: "Nickname akun belum tersedia. Lengkapi profil pemain terlebih dahulu." }, 403, origin);
        }
        const body = await request.json();
        const gameId = safeSlug(body.gameId || "");
        const playerId = account.id;
        const playerName = String(account.nickname).trim().replace(/[<>]/g, "").slice(0, 16);
        const score = Number(body.score);
        if (!gameId || !playerId || !playerName || !Number.isSafeInteger(score) || score < 0 || score > 100000000) {
          return response({ error: "Data skor tidak valid." }, 400, origin);
        }
        await env.DB.prepare(
          "INSERT INTO leaderboard (game_id, player_id, player_name, best_score, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(game_id, player_id) DO UPDATE SET player_name = excluded.player_name, best_score = MAX(leaderboard.best_score, excluded.best_score), updated_at = CASE WHEN excluded.best_score > leaderboard.best_score THEN CURRENT_TIMESTAMP ELSE leaderboard.updated_at END"
        ).bind(gameId, playerId, playerName, score).run();
        const saved = await env.DB.prepare(
          "SELECT player_name AS playerName, best_score AS bestScore FROM leaderboard WHERE game_id = ? AND player_id = ?"
        ).bind(gameId, playerId).first();
        return response({ success: true, message: "Skor berhasil dikirim.", bestScore: saved.bestScore, playerName: saved.playerName }, 200, origin);
      } catch (error) {
        return response({ error: "Skor gagal disimpan. Pastikan tabel leaderboard sudah dibuat." }, 500, origin);
      }
    }

    if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
    const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (pathname === "/login") {
      if (!env.UPLOAD_KEY || suppliedKey !== env.UPLOAD_KEY) {
        return response({ error: "Username atau password admin salah." }, 401, origin);
      }
      const loginBody = await request.json().catch(() => ({}));
      if (String(loginBody.username || "").trim() !== "admin") {
        return response({ error: "Username admin tidak dikenal." }, 401, origin);
      }
      const token = await createAdminSession(env.UPLOAD_KEY);
      return response({success:true,message:"Login admin berhasil.",token,expiresIn:28800},200,origin);
    }


    if (pathname !== "/" && pathname !== "/upload" && pathname !== "/delete" && pathname !== "/asset") {
      return response({ error: "Endpoint tidak ditemukan." }, 404, origin);
    }
    if (!((env.UPLOAD_KEY && await verifyAdminSession(suppliedKey, env.UPLOAD_KEY)) || await verifyGoogleSession(suppliedKey, env.AUTH_SECRET, "admin"))) {
      return response({ error: "Session admin tidak valid atau sudah berakhir. Silakan login kembali." }, 401, origin);
    }
    if (!env.GITHUB_TOKEN) {
      return response({ error: "GITHUB_TOKEN belum dipasang pada Cloudflare Worker." }, 500, origin);
    }

    if (pathname === "/asset") {
      try {
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length > 5_500_000) return response({ error: "File aset terlalu besar untuk satu kali kirim (maksimal 4 MB)." }, 413, origin);
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || "").trim();
        const relativePath = String(body.path || "").replace(/\\/g, "/").trim();
        const contentBase64 = String(body.contentBase64 || "");
        if (!slug || slug !== safeSlug(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          return response({ error: "ID game tidak valid." }, 400, origin);
        }
        const parts = relativePath.split("/");
        if (!relativePath || relativePath.length > 220 || relativePath.startsWith("/") ||
            parts.some(part => !part || part === "." || part === ".." || !/^[A-Za-z0-9._ -]+$/.test(part)) ||
            /^(?:game\.json|index\.html)$/i.test(relativePath)) {
          return response({ error: "Jalur file ZIP tidak aman atau dicadangkan." }, 400, origin);
        }
        const bytes = Math.floor(contentBase64.length * 3 / 4);
        if (!contentBase64 || bytes > 4_000_000) return response({ error: "Ukuran satu file aset maksimal 4 MB." }, 413, origin);
        const basePath = `games/${slug}`;
        const existingMain = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${basePath}/index.html?ref=${BRANCH}`, {
          headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "VEXEL-GAMES-Uploader" }
        });
        if (existingMain.status === 200) return response({ error: "Game dengan ID tersebut sudah ada. Gunakan nama game yang berbeda." }, 409, origin);
        if (existingMain.status !== 404) return response({ error: "Tidak dapat memeriksa folder game di GitHub." }, 502, origin);
        const target = `${basePath}/${relativePath}`;
        const apiPath = target.split("/").map(encodeURIComponent).join("/");
        const githubUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath}?ref=${BRANCH}`;
        const githubHeaders = {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "VEXEL-GAMES-Uploader"
        };
        // Upload ZIP dapat gagal di tengah jalan. Izinkan aset sisa percobaan
        // sebelumnya diperbarui selama index.html game belum diterbitkan.
        const priorAssetResponse = await fetch(githubUrl, { headers: githubHeaders });
        let priorAsset = null;
        if (priorAssetResponse.status === 200) {
          priorAsset = await priorAssetResponse.json().catch(() => ({}));
          if (!priorAsset.sha) return response({ error: "Tidak dapat membaca versi aset yang sudah ada di GitHub." }, 502, origin);
        } else if (priorAssetResponse.status !== 404) {
          return response({ error: "Tidak dapat memeriksa aset di GitHub." }, 502, origin);
        }
        const putBody = { message: `game: ${priorAsset ? "perbarui" : "tambah"} aset ${slug}/${relativePath}`, content: contentBase64, branch: BRANCH };
        if (priorAsset) putBody.sha = priorAsset.sha;
        const result = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath}`, {
          method: "PUT",
          headers: { ...githubHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(putBody)
        });
        const data = await result.json().catch(() => ({}));
        if (!result.ok) return response({ error: data.message || "Gagal menyimpan file aset ke GitHub." }, result.status, origin);
        return response({ success: true, path: target, updated: Boolean(priorAsset) }, 200, origin);
      } catch (error) {
        return response({ error: error.message || "Gagal mengunggah aset game." }, error.status || 500, origin);
      }
    }

    if (pathname === "/delete") {
      try {
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || "").trim();
        if (!slug || slug !== safeSlug(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          return response({ error: "ID game tidak valid." }, 400, origin);
        }
        const headers = {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "VEXEL-GAMES-Uploader"
        };
        const refResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`, { headers });
        const refData = await refResponse.json().catch(() => ({}));
        if (!refResponse.ok || !refData.object?.sha) return response({ error: "Tidak dapat membaca branch GitHub." }, 502, origin);
        const commitInfoResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits/${refData.object.sha}`, { headers });
        const commitInfo = await commitInfoResponse.json().catch(() => ({}));
        if (!commitInfoResponse.ok || !commitInfo.tree?.sha) return response({ error: "Tidak dapat membaca struktur commit GitHub." }, 502, origin);
        const treeResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees/${commitInfo.tree.sha}?recursive=1`, { headers });
        const treeData = await treeResponse.json().catch(() => ({}));
        if (!treeResponse.ok || !Array.isArray(treeData.tree)) return response({ error: "Tidak dapat membaca daftar file game di GitHub." }, 502, origin);
        const prefix = `games/${slug}/`;
        const files = treeData.tree.filter(item => item.type === "blob" && item.path.startsWith(prefix));
        if (!files.some(item => item.path === prefix + "index.html")) return response({ error: "Game tidak ditemukan atau file utama tidak ada." }, 404, origin);
        if (files.length > 150) return response({ error: "Game memiliki lebih dari 150 file. Penghapusan otomatis dibatalkan." }, 413, origin);
        const deleteTree = files.map(item => ({ path: item.path, mode: "100644", type: "blob", sha: null }));
        const newTreeResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ base_tree: commitInfo.tree.sha, tree: deleteTree })
        });
        const newTree = await newTreeResponse.json().catch(() => ({}));
        if (!newTreeResponse.ok || !newTree.sha) return response({ error: newTree.message || "Gagal menyiapkan penghapusan file game." }, 502, origin);
        const commitResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ message: `game: hapus ${slug} beserta seluruh aset`, tree: newTree.sha, parents: [refData.object.sha] })
        });
        const commit = await commitResponse.json().catch(() => ({}));
        if (!commitResponse.ok || !commit.sha) return response({ error: commit.message || "Gagal membuat commit penghapusan game." }, 502, origin);
        const updateResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
          method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ sha: commit.sha, force: false })
        });
        if (!updateResponse.ok) return response({ error: "File sudah disiapkan untuk dihapus, tetapi branch GitHub belum berhasil diperbarui. Periksa GitHub sebelum mencoba lagi." }, 502, origin);
        return response({ success: true, message: `Game ${slug} dan seluruh ${files.length} file aset berhasil dihapus.`, slug, deletedFiles: files.length }, 200, origin);
      } catch (error) {
        return response({ error: error.message || "Terjadi kesalahan saat menghapus game." }, error.status || 500, origin);
      }
    }

    try {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 6_000_000) return response({ error: "Ukuran permintaan terlalu besar (maksimal 6 MB)." }, 413, origin);
      const body = await request.json();
      const name = String(body.name || "").trim().slice(0, 80);
      const rawCategories = Array.isArray(body.categories) ? body.categories : [body.category || ""];
      const categories = [...new Set(rawCategories.map(value => String(value || "").trim()).filter(Boolean))];
      const description = String(body.description || "").trim().slice(0, 240);
      const htmlBase64 = String(body.htmlBase64 || "");
      const imageBase64 = String(body.imageBase64 || "");
      const imageType = String(body.imageType || "").toLowerCase();

      if (!name || categories.length < 1 || categories.length > 3 || categories.some(category => !CATEGORIES.includes(category)) || !htmlBase64 || !imageBase64) {
        return response({ error: "Nama, 1 sampai 3 kategori yang valid, file HTML, dan thumbnail wajib diisi." }, 400, origin);
      }
      if (!["image/png", "image/jpeg", "image/webp"].includes(imageType)) {
        return response({ error: "Thumbnail harus PNG, JPG, atau WEBP." }, 400, origin);
      }
      const htmlBytes = Math.floor(htmlBase64.length * 3 / 4);
      const imageBytes = Math.floor(imageBase64.length * 3 / 4);
      if (htmlBytes > 2_500_000 || imageBytes > 1_500_000) {
        return response({ error: "Maksimal ukuran HTML 2,5 MB dan thumbnail 1,5 MB." }, 413, origin);
      }
      const html = new TextDecoder().decode(Uint8Array.from(atob(htmlBase64), c => c.charCodeAt(0)));
      if (!/<!doctype html|<html[\s>]/i.test(html)) {
        return response({ error: "File yang dipilih bukan dokumen HTML yang valid." }, 400, origin);
      }

      const slug = safeSlug(body.slug || name);
      if (!slug) return response({ error: "Nama game tidak dapat dijadikan nama folder." }, 400, origin);
      const extension = imageType === "image/png" ? "png" : imageType === "image/webp" ? "webp" : "jpg";
      const basePath = `games/${slug}`;

      // Jangan menimpa game yang sudah ada.
      const existing = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${basePath}/index.html?ref=${BRANCH}`, {
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "VEXEL-GAMES-Uploader"
        }
      });
      if (existing.status === 200) {
        return response({ error: `Folder game "${slug}" sudah ada. Gunakan nama game yang berbeda.` }, 409, origin);
      }
      if (existing.status !== 404) {
        return response({ error: "Tidak dapat memeriksa folder game di GitHub." }, 502, origin);
      }

      const thumbnailName = `thumbnail.${extension}`;
      const metadata = {
        name,
        category: categories[0],
        categories,
        description,
        image: `${basePath}/${thumbnailName}`,
        emoji: "🎮"
      };

      // index.html diunggah terakhir agar katalog hanya mendeteksi game yang lengkap.
      await githubPut(`${basePath}/game.json`, utf8Base64(JSON.stringify(metadata, null, 2)), env.GITHUB_TOKEN, `game: tambah metadata ${slug}`);
      await githubPut(`${basePath}/${thumbnailName}`, imageBase64, env.GITHUB_TOKEN, `game: tambah thumbnail ${slug}`);
      // Pasang SDK leaderboard universal secara otomatis pada setiap game baru.
      const sdkTag = '<script src="/vexel-leaderboard.js" data-game-id="' + slug + '" defer></scr' + 'ipt>';
      let publishedHtml = html;
      if (!/vexel-leaderboard\.js/.test(publishedHtml)) {
        if (/<\/body>/i.test(publishedHtml)) publishedHtml = publishedHtml.replace(/<\/body>/i, sdkTag + '</body>');
        else publishedHtml += sdkTag;
      }
      const publishedHtmlBase64 = utf8Base64(publishedHtml);
      const committed = await githubPut(`${basePath}/index.html`, publishedHtmlBase64, env.GITHUB_TOKEN, `game: terbitkan ${slug}`);

      return response({
        success: true,
        message: "Game berhasil diunggah. SDK leaderboard otomatis dipasang; kirim event vexel:gameover dari game agar skor tercatat. Katalog dan beranda akan diperbarui otomatis.",
        slug,
        url: `${ALLOWED_ORIGIN}/${basePath}/index.html`,
        commit: committed.commit && committed.commit.sha ? committed.commit.sha : null
      }, 200, origin);
    } catch (error) {
      return response({ error: error.message || "Terjadi kesalahan saat mengunggah game." }, error.status || 500, origin);
    }
  }
};
