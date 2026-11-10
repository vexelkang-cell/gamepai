-- KANG VEXEL HUB LEADERBOARD
-- Jalankan sekali di Cloudflare D1 > Console

CREATE TABLE IF NOT EXISTS leaderboard (
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  best_score INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_game_score
ON leaderboard (game_id, best_score DESC, updated_at ASC);
