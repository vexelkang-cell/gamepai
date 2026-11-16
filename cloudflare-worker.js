const OWNER = "vexelkang-cell";
const REPO = "gamepai";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://vexelgamepai.pages.dev";
const CATEGORIES = ["Game Score", "Edukasi", "Petualangan", "Aksi", "Strategy", "Puzzle", "Olahraga", "Multiplayer", "Layar IFP", "Lainnya"];

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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const stateData = await readSignedToken(state, env.AUTH_SECRET);
  if (!code || !stateData || !stateData.nonce || cookies.vx_oauth_state !== state) {
    return Response.redirect(FRONTEND_AUTH_REDIRECT + "/?auth_error=invalid_state", 302);
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.AUTH_SECRET || !env.DB) {
    return Response.redirect(FRONTEND_AUTH_REDIRECT + "/?auth_error=oauth_not_configured", 302);
  }
  const redirectUri = new URL("/auth/google/callback", request.url).toString();
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
      headers: { Authorization: "Bearer " + tokenData.access_token }
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
        "Set-Cookie": "vx_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/auth/google/callback; Max-Age=0",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer"
      }
    });
  } catch (error) {
    const message = encodeURIComponent(String(error.message || "Login Google gagal.").slice(0, 160));
    return Response.redirect(FRONTEND_AUTH_REDIRECT + "/?auth_error=" + message, 302);
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

export default {
  async scheduled(controller, env, ctx) {
    if (!env.DB) return;
    const now = new Date().toISOString();
    await env.DB.prepare("DELETE FROM quiz_room_players WHERE room_code IN (SELECT code FROM quiz_rooms WHERE expires_at <= ?)").bind(now).run();
    await env.DB.prepare("DELETE FROM quiz_rooms WHERE expires_at <= ?").bind(now).run();
    const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.prepare("DELETE FROM quiz_assignment_attempts WHERE assignment_id IN (SELECT id FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?)").bind(archiveCutoff).run();
    await env.DB.prepare("DELETE FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?").bind(archiveCutoff).run();
  },
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = origin === ALLOWED_ORIGIN;
    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    const pathname = new URL(request.url).pathname;
    if (!allowed && pathname !== "/auth/google/callback" && pathname !== "/auth/google") return response({ error: "Origin tidak diizinkan." }, 403, ALLOWED_ORIGIN);
    const auth = request.headers.get("Authorization") || "";
    const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (pathname === "/auth/google" && request.method === "GET") {
      return handleGoogleStart(request, env);
    }
    if (pathname === "/auth/google/callback" && request.method === "GET") {
      return handleGoogleCallback(request, env);
    }


    // VEXEL QUIZ Durable Object WebSocket endpoint (one object per numeric room code).
    if (pathname === "/quiz/connect" && request.method === "GET") {
      const code = String(new URL(request.url).searchParams.get("code") || "").replace(/[^0-9]/g, "").slice(0, 6);
      if (!/^\\d{6}$/.test(code)) return response({ error: "Kode room tidak valid." }, 400, origin);
      if (!env.QUIZ_ROOM) return response({ error: "Durable Object QUIZ_ROOM belum terpasang." }, 503, origin);
      const id = env.QUIZ_ROOM.idFromName(code);
      return env.QUIZ_ROOM.get(id).fetch("https://quiz-room/connect", request);
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
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN owner_sub TEXT").run();
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN start_at TEXT").run(); } catch (_) {} } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_assignments (id TEXT PRIMARY KEY, title TEXT NOT NULL, pack_title TEXT NOT NULL, questions_json TEXT NOT NULL, class_level TEXT NOT NULL, subject TEXT NOT NULL, duration_minutes INTEGER NOT NULL, start_at TEXT NOT NULL, due_at TEXT, owner_key TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'published')").run();
        try { await env.DB.prepare("ALTER TABLE quiz_assignments ADD COLUMN creator_nickname TEXT").run(); } catch (_) {}
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS quiz_assignment_attempts (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, student_name TEXT NOT NULL, started_at TEXT NOT NULL, ends_at TEXT NOT NULL, submitted_at TEXT, answers_json TEXT, score INTEGER, status TEXT NOT NULL DEFAULT 'in_progress')").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_assignment_attempts ON quiz_assignment_attempts(assignment_id,started_at)").run();
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN started_at TEXT").run(); } catch (_) {}
        try { await env.DB.prepare("ALTER TABLE quiz_rooms ADD COLUMN ends_at TEXT").run(); } catch (_) {}

        if (pathname === "/quiz/assignments" && request.method === "GET") {
          const now=new Date().toISOString();
          const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          await env.DB.prepare("DELETE FROM quiz_assignment_attempts WHERE assignment_id IN (SELECT id FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?)").bind(archiveCutoff).run();
          await env.DB.prepare("DELETE FROM quiz_assignments WHERE due_at IS NOT NULL AND due_at <= ?").bind(archiveCutoff).run();
          const studentName=String(new URL(request.url).searchParams.get("studentName")||"").trim().replace(/[<>]/g,"").slice(0,40);
          const sql="SELECT id,title,pack_title AS packTitle,class_level AS classLevel,subject,duration_minutes AS durationMinutes,start_at AS startAt,due_at AS dueAt,created_at AS createdAt,COALESCE(NULLIF(creator_nickname,''),'Guru') AS creatorNickname,(SELECT COUNT(*) FROM quiz_assignment_attempts a WHERE a.assignment_id=quiz_assignments.id AND a.status='submitted') AS submittedCount FROM quiz_assignments WHERE status='published' AND start_at<=? AND (due_at IS NULL OR due_at>?) AND (?='' OR NOT EXISTS (SELECT 1 FROM quiz_assignment_attempts done WHERE done.assignment_id=quiz_assignments.id AND lower(done.student_name)=lower(?) AND done.status='submitted')) ORDER BY created_at DESC LIMIT 100";
          const rows=await env.DB.prepare(sql).bind(now,now,studentName,studentName).all();
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
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\\s+/i,"");
          const session=await verifyGoogleSession(token,env.AUTH_SECRET);
          if(!session||!["player","admin"].includes(session.role))return response({error:"Silakan login ke VEXEL GAMES terlebih dahulu untuk membuat tugas."},401,origin);
          const account=await env.DB.prepare("SELECT nickname FROM users WHERE google_sub=? AND role IN ('player','admin')").bind(session.sub).first();
          const creatorNickname=String(account?.nickname||"").trim().slice(0,16);
          if(!creatorNickname)return response({error:"Nickname akun belum diatur. Atur nickname di profil sebelum membuat tugas."},400,origin);
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
          const rows=await env.DB.prepare("SELECT id,title,author,class_level AS classLevel,subject,created_at AS createdAt FROM quiz_question_bank ORDER BY updated_at DESC LIMIT 100").all();
          return response({success:true,packs:rows.results||[]},200,origin);
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
          if(!title||!classLevel||!subject||questions.length!==5)return response({error:"Nama paket, kelas, mata pelajaran, dan tepat 5 soal wajib diisi."},400,origin);
          for(let i=0;i<5;i++){const q=questions[i];if(!q||typeof q.question!=="string"||!q.question.trim()||q.question.length>500||!Array.isArray(q.options)||q.options.length!==4||q.options.some(v=>typeof v!=="string"||!v.trim()||v.length>180)||!Number.isInteger(q.correct)||q.correct<0||q.correct>3)return response({error:"Format soal nomor "+(i+1)+" tidak valid."},400,origin);}
          const now=new Date().toISOString(),id="qb_"+randomString(12),author=account.nickname||account.displayName||session.email;
          await env.DB.prepare("INSERT INTO quiz_question_bank(id,title,questions_json,author,created_at,updated_at,class_level,subject) VALUES(?,?,?,?,?,?,?,?)").bind(id,title,JSON.stringify(questions),author,now,now,classLevel,subject).run();
          return response({success:true,id,message:"Paket soal berhasil disimpan ke Bank Soal."},201,origin);
        }

        if (pathname === "/quiz/rooms" && request.method === "GET") {
          const now=new Date().toISOString(), activeSince=new Date(Date.now()-45000).toISOString();
          const found = await env.DB.prepare("SELECT r.code,r.room_name AS roomName,r.host_name AS hostName,r.status,r.created_at AS createdAt,(SELECT COUNT(*) FROM quiz_room_players p WHERE p.room_code=r.code) AS playerCount FROM quiz_rooms r JOIN quiz_room_players h ON h.room_code=r.code AND h.role='host' WHERE r.status='waiting' AND (r.start_at IS NULL OR r.start_at<=?) AND r.expires_at>? AND h.last_seen>=? ORDER BY r.created_at DESC LIMIT 40").bind(now,now,activeSince).all();
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
          const hostName=String(body.hostName||"").trim().replace(/[<>]/g,"").slice(0,20);
          const roomName=String(body.roomName||"").trim().replace(/[<>]/g,"").slice(0,36)||"Kuis VEXEL";
          const packId=String(body.packId||"").trim().slice(0,80);
          const classLevel=String(body.classLevel||"").trim().slice(0,20);
          const subject=String(body.subject||"").trim().replace(/[<>]/g,"").slice(0,80);
          const durationMinutes=Number(body.durationMinutes);
          if(!hostName) return response({error:"Nama host wajib diisi."},400,origin);
          if(!packId||!classLevel||!subject||!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>240) return response({error:"Paket soal, kelas, mata pelajaran, dan durasi kuis wajib diatur."},400,origin);
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
              await env.DB.prepare("INSERT INTO quiz_rooms(code,room_name,host_name,host_token,status,created_at,updated_at,expires_at,pack_id,class_level,subject,duration_minutes,owner_sub,start_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(code,roomName,hostName,hostToken,"waiting",now,now,expiry,packId,classLevel,subject,durationMinutes,ownerSub,startAt).run();
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
          const playerName=String(body.playerName||"").trim().replace(/[<>]/g,"").replace(/\s+/g," ").slice(0,60);
          if(!code||playerName.length<3) return response({error:"Kode room dan nama lengkap (minimal 3 karakter) wajib diisi."},400,origin);
          const room=await env.DB.prepare("SELECT code,status,expires_at,start_at AS startAt FROM quiz_rooms WHERE code=?").bind(code).first();
          if(!room||room.expires_at<=new Date().toISOString()) return response({error:"Room tidak ditemukan atau sudah kedaluwarsa."},404,origin);
          if(room.status!=="waiting") return response({error:"Room sudah dimulai dan dikunci. Peserta terlambat tidak bisa bergabung."},409,origin);
          if(room.startAt&&room.startAt>new Date().toISOString()) return response({error:"Tugas belum dimulai. Silakan bergabung sesuai jadwal yang ditentukan guru."},409,origin);
          const duplicate=await env.DB.prepare("SELECT id FROM quiz_room_players WHERE room_code=? AND lower(player_name)=lower(?)").bind(code,playerName).first();
          if(duplicate) return response({error:"Nama tersebut sudah digunakan di room ini."},409,origin);
          const token=randomString(24),now=new Date().toISOString();
          const inserted=await env.DB.prepare("INSERT INTO quiz_room_players(id,room_code,player_name,role,session_token,joined_at,last_seen) SELECT ?,?,?, 'player',?,?,? WHERE (SELECT COUNT(*) FROM quiz_room_players WHERE room_code=?)<6 AND (SELECT status FROM quiz_rooms WHERE code=?)='waiting'").bind("qp_"+randomString(12),code,playerName,token,now,now,code,code).run();
          if(!inserted.meta?.changes) return response({error:"Room sudah penuh atau baru saja dimulai."},409,origin);
          await env.DB.prepare("UPDATE quiz_rooms SET updated_at=? WHERE code=?").bind(now,code).run();
          await notifyQuizRoom(env, code, "joined");
          return response({success:true,code,token,role:"player",playerName},201,origin);
        }
        if (pathname === "/quiz/room" && request.method === "GET") {
          const code=String(new URL(request.url).searchParams.get("code")||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
          const nowIso=new Date().toISOString();
          await env.DB.prepare("UPDATE quiz_rooms SET status='completed',updated_at=? WHERE code=? AND status='started' AND ends_at IS NOT NULL AND ends_at<=?").bind(nowIso,code,nowIso).run();
          const room=await env.DB.prepare("SELECT code,room_name AS roomName,host_name AS hostName,status,created_at AS createdAt,expires_at AS expiresAt,pack_id AS packId,class_level AS classLevel,subject,duration_minutes AS durationMinutes,start_at AS scheduledAt,started_at AS startedAt,ends_at AS endsAt FROM quiz_rooms WHERE code=?").bind(code).first();
          if(!room) return response({error:"Room tidak ditemukan."},404,origin);
          const pack=room.packId?await env.DB.prepare("SELECT questions_json FROM quiz_question_bank WHERE id=?").bind(room.packId).first():null;
          const questions=room.status==="waiting"?[]:JSON.parse(pack?.questions_json||"[]").map(q=>({question:q.question,options:q.options}));
          const people=await env.DB.prepare("SELECT player_name AS name,role,joined_at AS joinedAt,score,submitted_at AS submittedAt FROM quiz_room_players WHERE room_code=? ORDER BY CASE role WHEN 'host' THEN 0 ELSE 1 END,joined_at").bind(code).all();
          return response({success:true,room,questions,players:people.results||[]},200,origin);
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
          const member=await env.DB.prepare("SELECT p.id,p.role,p.submitted_at AS submittedAt,r.status,r.ends_at AS endsAt,r.pack_id AS packId FROM quiz_room_players p JOIN quiz_rooms r ON r.code=p.room_code WHERE p.room_code=? AND p.session_token=?").bind(code,token).first();
          if(!member||member.role!=="player")return response({error:"Sesi peserta tidak valid."},403,origin);
          if(member.submittedAt)return response({error:"Jawaban sudah dikumpulkan."},409,origin);
          if(!["started","completed"].includes(member.status)||!member.endsAt)return response({error:"Kuis belum dimulai."},409,origin);
          if(Date.now()>new Date(member.endsAt).getTime()+60000)return response({error:"Waktu pengumpulan kuis telah berakhir."},409,origin);
          const pack=await env.DB.prepare("SELECT questions_json FROM quiz_question_bank WHERE id=?").bind(member.packId).first();
          const questions=JSON.parse(pack?.questions_json||"[]"),answers=Array.isArray(body.answers)?body.answers:[];
          const normalized=questions.map((q,i)=>Number.isInteger(Number(answers[i]))&&Number(answers[i])>=0&&Number(answers[i])<q.options.length?Number(answers[i]):-1);
          const correct=questions.reduce((n,q,i)=>n+(normalized[i]===Number(q.correct)?1:0),0);
          const score=questions.length?Math.round(correct/questions.length*100):0,now=new Date().toISOString();
          await env.DB.prepare("UPDATE quiz_room_players SET answers_json=?,score=?,submitted_at=?,last_seen=? WHERE id=? AND submitted_at IS NULL").bind(JSON.stringify(normalized),score,now,now,member.id).run();
          await notifyQuizRoom(env,code,"answer_submitted");
          return response({success:true,score,correct,total:questions.length,submittedAt:now},200,origin);
        }
        if (pathname === "/quiz/start" && request.method === "POST") {
          const body=await request.json().catch(()=>({}));
          const code=String(body.code||"").toUpperCase().slice(0,6);
          const token=String(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
          const host=await env.DB.prepare("SELECT p.id,r.start_at AS startAt,r.duration_minutes AS durationMinutes FROM quiz_room_players p JOIN quiz_rooms r ON r.code=p.room_code WHERE p.room_code=? AND p.session_token=? AND p.role='host'").bind(code,token).first();
          if(!host) return response({error:"Hanya host room yang boleh memulai."},403,origin);
          if(host.startAt&&host.startAt>new Date().toISOString()) return response({error:"Kuis belum waktunya dimulai. Tunggu sampai jadwal mulai."},409,origin);
          const startedAt=new Date(),startedIso=startedAt.toISOString(),endsAt=new Date(startedAt.getTime()+Number(host.durationMinutes||10)*60000).toISOString();
          const result=await env.DB.prepare("UPDATE quiz_rooms SET status='started',started_at=?,ends_at=?,updated_at=? WHERE code=? AND status='waiting'").bind(startedIso,endsAt,startedIso,code).run();
          if(!result.meta?.changes) return response({error:"Room sudah dimulai atau tidak tersedia."},409,origin);
          await notifyQuizRoom(env, code, "started");
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
    if (pathname.startsWith("/social/") || pathname.startsWith("/dm/")) {
      const playerSession = await verifyGoogleSession(suppliedToken, env.AUTH_SECRET, "player");
      if (!playerSession) return response({ error: "Login pemain diperlukan untuk menggunakan Sosial dan DM." }, 401, origin);
      if (!env.DB) return response({ error: "Database pemain belum tersedia." }, 503, origin);
      try {
        const account = await env.DB.prepare(
          "SELECT id,nickname,avatar_url AS avatarUrl FROM users WHERE google_sub=? AND role='player'"
        ).bind(playerSession.sub).first();
        if (!account || !account.nickname) return response({ error: "Lengkapi nickname profil terlebih dahulu." }, 403, origin);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS player_presence (user_id TEXT PRIMARY KEY, last_seen TEXT NOT NULL, activity TEXT NOT NULL DEFAULT 'online')").run();
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS direct_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(sender_id,recipient_id,id)").run();
        await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_dm_recipient ON direct_messages(recipient_id,read_at,id)").run();

        if (pathname === "/social/heartbeat") {
          if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);
          await env.DB.prepare("INSERT INTO player_presence (user_id,last_seen,activity) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET last_seen=excluded.last_seen,activity=excluded.activity")
            .bind(account.id, new Date().toISOString(), "online").run();
          return response({ success: true }, 200, origin);
        }
        if (pathname === "/social/online" && request.method === "GET") {
          const result = await env.DB.prepare(
            "SELECT u.id,u.nickname,u.avatar_url AS avatarUrl,p.last_seen AS lastSeen FROM player_presence p JOIN users u ON u.id=p.user_id WHERE u.role='player' AND u.nickname IS NOT NULL AND u.id<>? AND p.last_seen>=? ORDER BY p.last_seen DESC LIMIT 100"
          ).bind(account.id, new Date(Date.now()-90000).toISOString()).all();
          return response({ success: true, players: result.results || [] }, 200, origin);
        }
        if (pathname === "/dm/inbox" && request.method === "GET") {
          const result = await env.DB.prepare(
            "SELECT u.id AS userId,u.nickname,u.avatar_url AS avatarUrl,m.body AS lastMessage,m.created_at AS lastMessageAt,m.sender_id AS lastSenderId,(SELECT COUNT(*) FROM direct_messages unread WHERE unread.sender_id=u.id AND unread.recipient_id=? AND unread.read_at IS NULL) AS unreadCount FROM direct_messages m JOIN users u ON u.id=CASE WHEN m.sender_id=? THEN m.recipient_id ELSE m.sender_id END WHERE (m.sender_id=? OR m.recipient_id=?) AND m.id IN (SELECT MAX(id) FROM direct_messages WHERE sender_id=? OR recipient_id=? GROUP BY CASE WHEN sender_id=? THEN recipient_id ELSE sender_id END) ORDER BY m.id DESC LIMIT 100"
          ).bind(account.id,account.id,account.id,account.id,account.id,account.id,account.id).all();
          return response({ success: true, conversations: result.results || [] }, 200, origin);
        }
        if (pathname === "/dm/messages" && request.method === "GET") {
          const otherId = String(new URL(request.url).searchParams.get("with") || "").slice(0,64);
          if (!otherId || otherId === account.id) return response({ error: "Penerima pesan tidak valid." }, 400, origin);
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
        const result = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${apiPath}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${env.GITHUB_TOKEN}`, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "VEXEL-GAMES-Uploader", "Content-Type": "application/json" },
          body: JSON.stringify({ message: `game: tambah aset ${slug}/${relativePath}`, content: contentBase64, branch: BRANCH })
        });
        const data = await result.json().catch(() => ({}));
        if (!result.ok) return response({ error: data.message || "Gagal menyimpan file aset ke GitHub." }, result.status, origin);
        return response({ success: true, path: target }, 200, origin);
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
