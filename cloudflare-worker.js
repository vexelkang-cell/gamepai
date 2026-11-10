const OWNER = "vexelkang-cell";
const REPO = "gamepai";
const BRANCH = "main";
const ALLOWED_ORIGIN = "https://gamepai-7a9.pages.dev";
const CATEGORIES = ["Edukasi", "Petualangan", "Aksi", "Puzzle", "Olahraga", "Multiplayer", "Lainnya"];

function response(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin || ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
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
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
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
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }
    if (!allowed) return response({ error: "Origin tidak diizinkan." }, 403, ALLOWED_ORIGIN);
    if (request.method !== "POST") return response({ error: "Gunakan metode POST." }, 405, origin);

    const auth = request.headers.get("Authorization") || "";
    const suppliedKey = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!env.UPLOAD_KEY || suppliedKey !== env.UPLOAD_KEY) {
      return response({ error: "Kunci admin salah." }, 401, origin);
    }
    if (!env.GITHUB_TOKEN) {
      return response({ error: "GITHUB_TOKEN belum dipasang pada Cloudflare Worker." }, 500, origin);
    }

    try {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 6_000_000) return response({ error: "Ukuran permintaan terlalu besar (maksimal 6 MB)." }, 413, origin);
      const body = await request.json();
      const name = String(body.name || "").trim().slice(0, 80);
      const category = String(body.category || "");
      const description = String(body.description || "").trim().slice(0, 240);
      const htmlBase64 = String(body.htmlBase64 || "");
      const imageBase64 = String(body.imageBase64 || "");
      const imageType = String(body.imageType || "").toLowerCase();

      if (!name || !CATEGORIES.includes(category) || !htmlBase64 || !imageBase64) {
        return response({ error: "Nama, kategori, file HTML, dan thumbnail wajib diisi." }, 400, origin);
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
        category,
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
