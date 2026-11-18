-- VEXEL SOCIAL schema for Cloudflare D1.
-- The Worker also creates these tables idempotently on first authenticated request.
-- Apply this file to the existing vexel-leaderboard D1 database before enabling the UI.

CREATE TABLE IF NOT EXISTS social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) <= 500),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_posts_created ON social_posts(id DESC);

CREATE TABLE IF NOT EXISTS social_likes (
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL CHECK(length(body) <= 500),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id, id);

CREATE TABLE IF NOT EXISTS social_follows (
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(follower_id, following_id),
  CHECK(follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_social_following ON social_follows(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_followers ON social_follows(following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_blocks (
  blocker_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(blocker_id, blocked_id),
  CHECK(blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS social_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);

CREATE TABLE IF NOT EXISTS social_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  target_id TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_notifications_recipient ON social_notifications(recipient_id, id DESC);
