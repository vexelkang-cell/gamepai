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
  "Lainnya": "🕹️"
};

function titleFromHtml(html, fallback) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return fallback;
  return match[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").trim() || fallback;
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
    const category = meta.category || "Lainnya";
    const thumbnailCandidates = ["thumbnail.webp", "thumbnail.png", "thumbnail.jpg", "cover.webp", "cover.png", "cover.jpg"];
    const thumbnail = thumbnailCandidates.find(file => fs.existsSync(path.join(folder, file)));

    games.push({
      name: meta.name || titleFromHtml(html, entry.name.replace(/[-_]/g, " ")),
      category,
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
