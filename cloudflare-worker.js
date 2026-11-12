const OWNER = "vexelkang-cell";
const REPO = "gamepai";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://vexelgamepai.pages.dev";
const CATEGORIES = ["Game Score", "Edukasi", "Petualangan", "Aksi", "Puzzle", "Olahraga", "Multiplayer", "Layar IFP", "Lainnya"];

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
    await env.DB.prepare(
      "INSERT INTO users (google_sub,email,display_name,avatar_url,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,avatar_url=excluded.avatar_url,role=excluded.role,updated_at=excluded.updated_at"
    ).bind(String(google.sub), email, String(google.name || ""), String(google.picture || ""), role, now, now).run();
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

export default {
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
    if (!allowed) return response({ error: "Origin tidak diizinkan." }, 403, ALLOWED_ORIGIN);
    const pathname = new URL(request.url).pathname;
    const auth = request.headers.get("Authorization") || "";
    const suppliedToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (pathname === "/auth/google" && request.method === "GET") {
      if (!allowed) return response({ error: "Origin tidak diizinkan." }, 403, ALLOWED_ORIGIN);
      return handleGoogleStart(request, env);
    }
    if (pathname === "/auth/google/callback" && request.method === "GET") {
      return handleGoogleCallback(request, env);
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
        const body = await request.json();
        const gameId = safeSlug(body.gameId || "");
        const playerId = String(body.playerId || "").trim().slice(0, 80);
        const playerName = String(body.playerName || "").trim().replace(/[<>]/g, "").slice(0, 20);
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


    if (pathname !== "/" && pathname !== "/upload" && pathname !== "/delete") {
      return response({ error: "Endpoint tidak ditemukan." }, 404, origin);
    }
    if (!((env.UPLOAD_KEY && await verifyAdminSession(suppliedKey, env.UPLOAD_KEY)) || await verifyGoogleSession(suppliedKey, env.AUTH_SECRET, "admin"))) {
      return response({ error: "Session admin tidak valid atau sudah berakhir. Silakan login kembali." }, 401, origin);
    }
    if (!env.GITHUB_TOKEN) {
      return response({ error: "GITHUB_TOKEN belum dipasang pada Cloudflare Worker." }, 500, origin);
    }

    if (pathname === "/delete") {
      try {
        const body = await request.json().catch(() => ({}));
        const slug = String(body.slug || "").trim();
        if (!slug || slug !== safeSlug(slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
          return response({ error: "ID game tidak valid." }, 400, origin);
        }
        const basePath = `games/${slug}`;
        const listUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${basePath}?ref=${BRANCH}`;
        const listing = await fetch(listUrl, {
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "VEXEL-GAMES-Uploader"
          }
        });
        if (listing.status === 404) return response({ error: "Game tidak ditemukan di GitHub." }, 404, origin);
        const entries = await listing.json().catch(() => null);
        if (!listing.ok || !Array.isArray(entries)) {
          return response({ error: "Tidak dapat membaca folder game di GitHub." }, 502, origin);
        }
        if (!entries.length || entries.some(item => item.type !== "file" || !item.sha || item.path !== `${basePath}/${item.name}`)) {
          return response({ error: "Folder game berisi struktur yang tidak dikenal. Penghapusan dibatalkan demi keamanan." }, 409, origin);
        }
        const indexFile = entries.find(item => item.name === "index.html");
        if (!indexFile) return response({ error: "File utama game tidak ditemukan." }, 404, origin);
        const orderedFiles = [indexFile, ...entries.filter(item => item.name !== "index.html")];
        for (const file of orderedFiles) {
          await githubDelete(file.path, file.sha, env.GITHUB_TOKEN, `game: hapus ${slug} - ${file.name}`);
        }
        return response({ success: true, message: `Game ${slug} dan seluruh file di foldernya berhasil dihapus.`, slug }, 200, origin);
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
      const html = atob(htmlBase64);
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
      const committed = await githubPut(`${basePath}/index.html`, htmlBase64, env.GITHUB_TOKEN, `game: terbitkan ${slug}`);

      return response({
        success: true,
        message: "Game berhasil dikirim ke GitHub. Katalog dan beranda akan diperbarui otomatis.",
        slug,
        url: `${ALLOWED_ORIGIN}/${basePath}/index.html`,
        commit: committed.commit && committed.commit.sha ? committed.commit.sha : null
      }, 200, origin);
    } catch (error) {
      return response({ error: error.message || "Terjadi kesalahan saat mengunggah game." }, error.status || 500, origin);
    }
  }
};
