import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const gamesRoot = path.join(root, "games");
const output = path.join(root, "games.json");

const categoryEmoji = {
  "Edukasi": "📚",
  "PAI": "🕌",
  "Petualangan": "🗺️",
  "Aksi": "🥊",
  "Puzzle": "🧩",
  "Olahraga": "⚽",
  "Multiplayer": "🎮",
  "Layar IFP": "🖥️",
  "Lainnya": "🕹️"
};

function titleFromHtml(html, fallback) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return fallback;
  return match[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").trim() || fallback;
}

function inferCategory(folderName, title) {
  const value = (folderName + " " + title).toLowerCase();
  if (/pai|islam|quran|alquran|agama|wudhu|shalat|salat/.test(value)) return "Edukasi";
  if (/fighter|fight|battle|tank|war|perang|aksi/.test(value)) return "Aksi";
  if (/adventure|petualang|quest|world|mario/.test(value)) return "Petualangan";
  if (/puzzle|teka|susun|memory/.test(value)) return "Puzzle";
  if (/sport|bola|basket|football|soccer/.test(value)) return "Olahraga";
  if (/2p|duel|multiplayer|versus|\bpvp\b/.test(value)) return "Multiplayer";
  return "Lainnya";
}

function readMetadata(folder) {
  const metadataPath = path.join(folder, "game.json");
  if (!fs.existsSync(metadataPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch (error) {
    console.warn("Metadata tidak valid:", metadataPath, error.message);
    return {};
  }
}

const games = [];
if (fs.existsSync(gamesRoot)) {
  for (const entry of fs.readdirSync(gamesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = path.join(gamesRoot, entry.name);
    const htmlPath = path.join(folder, "index.html");
    if (!fs.existsSync(htmlPath)) continue;

    const html = fs.readFileSync(htmlPath, "utf8");
    const meta = readMetadata(folder);
    const title = meta.name || titleFromHtml(html, entry.name.replace(/[-_]/g, " "));
    const categories = Array.isArray(meta.categories) && meta.categories.length
      ? [...new Set(meta.categories.filter(category => typeof category === "string" && category.trim()))]
      : [meta.category || inferCategory(entry.name, title)];
    const category = categories[0] || inferCategory(entry.name, title);
    const thumbnailCandidates = ["thumbnail.webp", "thumbnail.png", "thumbnail.jpg", "cover.webp", "cover.png", "cover.jpg"];
    const thumbnail = thumbnailCandidates.find(file => fs.existsSync(path.join(folder, file)));

    games.push({
      name: title,
      category,
      categories,
      description: meta.description || "Game seru untuk dimainkan langsung di browser.",
      image: thumbnail ? `games/${entry.name}/${thumbnail}` : "",
      emoji: meta.emoji || categoryEmoji[category] || "🎮",
      url: `games/${entry.name}/index.html`
    });
  }
}

games.sort((a, b) => a.name.localeCompare(b.name, "id"));
fs.writeFileSync(output, JSON.stringify(games, null, 2) + "\n");
console.log(`Katalog VEXEL GAMES dibuat: ${games.length} game.`);
