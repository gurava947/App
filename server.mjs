import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, extname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import { Server } from "socket.io";

const port = Number(process.env.INCHAT_PORT ?? 3005);
const databasePath = resolve(process.env.INCHAT_DB_PATH ?? "data/inchat.sqlite");
const uploadsDirectory = resolve(process.env.INCHAT_UPLOAD_DIR ?? "data/uploads");
const validBubbleThemes = new Set([
  "featured-1", "featured-2", "featured-3", "featured-4",
  "nature-1", "nature-2", "nature-3", "nature-4",
  "live-1", "live-2", "live-3", "live-4",
  "minimal-1", "minimal-2", "minimal-3", "minimal-4",
  "doodle-1", "doodle-2", "doodle-3", "doodle-4",
]);
const validWallpaperThemes = new Set([
  "none",
  "featured-1", "featured-2", "featured-3", "featured-4",
  "nature-1", "nature-2", "nature-3", "nature-4",
  "live-1", "live-2", "live-3", "live-4",
  "vibrant-1", "vibrant-2", "vibrant-3", "vibrant-4",
  "gradient-1", "gradient-2", "gradient-3", "gradient-4",
  "colour-1", "colour-2", "colour-3",
]);
const defaultChatTheme = { bubble: "featured-1", wallpaper: "none" };
const legacyChatThemes = {
  default: defaultChatTheme,
  mint: { bubble: "minimal-3", wallpaper: "none" },
  sunset: { bubble: "nature-2", wallpaper: "gradient-4" },
  midnight: { bubble: "live-3", wallpaper: "live-3" },
};
mkdirSync(resolve(databasePath, ".."), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    caller_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('voice', 'video')),
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    accepted_at TEXT,
    ended_at TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS connections (
    user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
  );
  CREATE TABLE IF NOT EXISTS connection_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TEXT NOT NULL,
    handled_at TEXT,
    CHECK (sender_id != recipient_id)
  );
  CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(sender_id, recipient_id, created_at);
  CREATE INDEX IF NOT EXISTS calls_pair_idx ON calls(caller_id, recipient_id, created_at);
  CREATE INDEX IF NOT EXISTS connection_requests_recipient_idx ON connection_requests(recipient_id, status, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS one_pending_request_per_direction_idx
    ON connection_requests(sender_id, recipient_id) WHERE status = 'pending';
`);
const callColumns = new Set(database.prepare("PRAGMA table_info(calls)").all().map((column) => column.name));
if (!callColumns.has("status")) database.exec("ALTER TABLE calls ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'");
if (!callColumns.has("accepted_at")) database.exec("ALTER TABLE calls ADD COLUMN accepted_at TEXT");
if (!callColumns.has("ended_at")) database.exec("ALTER TABLE calls ADD COLUMN ended_at TEXT");
if (!callColumns.has("duration_seconds")) database.exec("ALTER TABLE calls ADD COLUMN duration_seconds INTEGER NOT NULL DEFAULT 0");
const serverRestartedAt = new Date().toISOString();
database.prepare("UPDATE calls SET status = 'missed', ended_at = COALESCE(ended_at, ?) WHERE status = 'ringing'").run(serverRestartedAt);
database.prepare("UPDATE calls SET status = 'completed', ended_at = COALESCE(ended_at, ?) WHERE status = 'active'").run(serverRestartedAt);

const messageColumns = new Set(database.prepare("PRAGMA table_info(messages)").all().map((column) => column.name));
if (!messageColumns.has("content_type")) database.exec("ALTER TABLE messages ADD COLUMN content_type TEXT NOT NULL DEFAULT 'text'");
if (!messageColumns.has("metadata_json")) database.exec("ALTER TABLE messages ADD COLUMN metadata_json TEXT");
database.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('post', 'reel')),
    body TEXT NOT NULL,
    media_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS posts_created_idx ON posts(created_at DESC);
  CREATE TABLE IF NOT EXISTS post_likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS post_comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES post_comments(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments(post_id, created_at);
  CREATE TABLE IF NOT EXISTS post_reposts (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS saved_posts (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at TEXT NOT NULL,
    handled_at TEXT,
    PRIMARY KEY (follower_id, followee_id),
    CHECK (follower_id != followee_id)
  );
  CREATE INDEX IF NOT EXISTS follows_incoming_idx ON follows(followee_id, status, created_at);
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    media_id TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stories_expiry_idx ON stories(expires_at);
  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notes_expiry_idx ON notes(expires_at);
  CREATE TABLE IF NOT EXISTS media_files (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    storage_name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS chat_preferences (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, peer_id),
    CHECK (user_id != peer_id)
  );
  CREATE TABLE IF NOT EXISTS chat_reads (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    peer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_read_message_id INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, peer_id),
    CHECK (user_id != peer_id)
  );
  CREATE TABLE IF NOT EXISTS live_location_shares (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    latitude REAL,
    longitude REAL,
    accuracy REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    CHECK (sender_id != recipient_id)
  );
  CREATE INDEX IF NOT EXISTS live_locations_pair_idx ON live_location_shares(sender_id, recipient_id, expires_at);
  CREATE TABLE IF NOT EXISTS poll_votes (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS event_rsvps (
    message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('going', 'maybe', 'declined')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
`);

const app = express();
const httpServer = createServer(app);
const lanHost = process.env.INCHAT_LAN_HOST?.trim();
if (lanHost) {
  const octets = lanHost.split(".").map(Number);
  const isPrivateIpv4 = octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && (octets[0] === 10
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168));
  if (!isPrivateIpv4) throw new Error("INCHAT_LAN_HOST must be a private IPv4 address.");
}
const allowedOrigins = new Set([
  "http://localhost:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:3002",
]);
if (lanHost) allowedOrigins.add(`http://${lanHost}:3001`);
const io = new Server(httpServer, {
  cors: { origin: [...allowedOrigins] },
});
const activeSockets = new Map();
const activeCalls = new Map();
const ringTimeoutMs = 90_000;

app.use(express.json({ limit: "1mb" }));
app.use((request, response, next) => {
  const origin = request.get("origin");
  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-User-Id, X-File-Name");
  if (request.method === "OPTIONS") return response.sendStatus(204);
  next();
});

const userById = database.prepare("SELECT id, email, name, created_at AS createdAt FROM users WHERE id = ?");
const connectionExists = database.prepare("SELECT 1 FROM connections WHERE user_a_id = ? AND user_b_id = ?");
function isConnected(firstId, secondId) {
  const [userAId, userBId] = [firstId, secondId].sort();
  return Boolean(connectionExists.get(userAId, userBId));
}
function emitConnectionChanged(userIds) {
  for (const userId of userIds) io.to(`user:${userId}`).emit("data:changed", { type: "connection" });
}
const palette = [
  ["#e2f3e8", "#159b62"],
  ["#fcece8", "#d87963"],
  ["#edf0ff", "#6975c9"],
  ["#fff3d9", "#b58a2d"],
  ["#e8eef5", "#59738d"],
];

function avatarColors(name) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}

function initials(name) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function displayTime(isoDate) {
  const date = new Date(isoDate);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function getStorageInfo() {
  const mediaCount = database.prepare("SELECT COUNT(*) AS count FROM media_files").get().count;
  const mediaBytes = database.prepare("SELECT COALESCE(SUM(byte_size), 0) AS bytes FROM media_files").get().bytes;
  return {
    databaseBytes: statSync(databasePath).size,
    mediaBytes,
    mediaFiles: mediaCount,
    users: database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    messages: database.prepare("SELECT COUNT(*) AS count FROM messages").get().count,
    calls: database.prepare("SELECT COUNT(*) AS count FROM calls").get().count,
    connections: database.prepare("SELECT COUNT(*) AS count FROM connections").get().count,
    pendingRequests: database.prepare("SELECT COUNT(*) AS count FROM connection_requests WHERE status = 'pending'").get().count,
    posts: database.prepare("SELECT COUNT(*) AS count FROM posts").get().count,
    postLikes: database.prepare("SELECT COUNT(*) AS count FROM post_likes").get().count,
    postComments: database.prepare("SELECT COUNT(*) AS count FROM post_comments").get().count,
    postReposts: database.prepare("SELECT COUNT(*) AS count FROM post_reposts").get().count,
    savedPosts: database.prepare("SELECT COUNT(*) AS count FROM saved_posts").get().count,
    stories: database.prepare("SELECT COUNT(*) AS count FROM stories").get().count,
    activeStories: database.prepare("SELECT COUNT(*) AS count FROM stories WHERE expires_at > ?").get(new Date().toISOString()).count,
    notes: database.prepare("SELECT COUNT(*) AS count FROM notes").get().count,
    activeNotes: database.prepare("SELECT COUNT(*) AS count FROM notes WHERE expires_at > ?").get(new Date().toISOString()).count,
    activeLocationShares: database.prepare("SELECT COUNT(*) AS count FROM live_location_shares WHERE revoked_at IS NULL AND expires_at > ?").get(new Date().toISOString()).count,
  };
}

function emitUserChange(userIds, type, extra = {}) {
  for (const userId of new Set(userIds.filter(Boolean))) {
    io.to(`user:${userId}`).emit("data:changed", { type, ...extra });
  }
}

function isValidUser(userId) {
  return typeof userId === "string" && Boolean(userById.get(userId));
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeChatTheme(value) {
  if (typeof value === "string") return Object.hasOwn(legacyChatThemes, value) ? legacyChatThemes[value] : null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 2) return null;
  if (!validBubbleThemes.has(value.bubble) || !validWallpaperThemes.has(value.wallpaper)) return null;
  return { bubble: value.bubble, wallpaper: value.wallpaper };
}

function storedChatTheme(value) {
  return normalizeChatTheme(value) ?? defaultChatTheme;
}

function cleanExpiredEphemeral() {
  const now = new Date().toISOString();
  const expiredStories = database.prepare("SELECT id, author_id AS authorId, media_id AS mediaId FROM stories WHERE expires_at <= ?").all(now);
  database.prepare("DELETE FROM stories WHERE expires_at <= ?").run(now);
  for (const story of expiredStories) if (story.mediaId) cleanupMediaIfUnreferenced(story.mediaId, story.authorId);
  database.prepare("DELETE FROM notes WHERE expires_at <= ?").run(now);
  database.prepare("UPDATE live_location_shares SET latitude = NULL, longitude = NULL, accuracy = NULL WHERE expires_at <= ? AND revoked_at IS NULL").run(now);
}

const ephemeralCleanupTimer = setInterval(() => {
  const now = new Date().toISOString();
  const expiredShares = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId
    FROM live_location_shares WHERE expires_at <= ? AND revoked_at IS NULL
  `).all(now);
  try {
    cleanExpiredEphemeral();
    for (const share of expiredShares) {
      io.to(`user:${share.recipientId}`).emit("location:expired", { id: share.id, senderId: share.senderId });
      emitUserChange([share.senderId, share.recipientId], "location-share", { shareId: share.id });
    }
  } catch (error) {
    console.error("Ephemeral data cleanup failed:", error);
  }
}, 60_000);
ephemeralCleanupTimer.unref();

const allowedMediaTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
  ["audio/mpeg", ".mp3"],
  ["audio/ogg", ".ogg"],
  ["audio/wav", ".wav"],
  ["application/pdf", ".pdf"],
]);
const maximumUploadBytes = 25 * 1024 * 1024;

function mediaSignatureMatches(mimeType, bytes) {
  const startsWith = (...values) => values.every((value, index) => bytes[index] === value);
  if (mimeType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (mimeType === "image/png") return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (mimeType === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mimeType === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
  if (mimeType === "video/mp4") return bytes.toString("ascii", 4, 8) === "ftyp";
  if (mimeType === "video/webm") return startsWith(0x1a, 0x45, 0xdf, 0xa3);
  if (mimeType === "audio/mpeg") return bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mimeType === "audio/ogg") return bytes.toString("ascii", 0, 4) === "OggS";
  if (mimeType === "audio/wav") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
  if (mimeType === "application/pdf") return bytes.toString("ascii", 0, 5) === "%PDF-";
  return false;
}

function removeMedia(mediaId, ownerId) {
  const media = database.prepare("SELECT storage_name FROM media_files WHERE id = ? AND owner_id = ?").get(mediaId, ownerId);
  if (!media) return false;
  try {
    unlinkSync(resolve(uploadsDirectory, media.storage_name));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  database.prepare("DELETE FROM media_files WHERE id = ? AND owner_id = ?").run(mediaId, ownerId);
  return true;
}

function mediaIsReferenced(mediaId) {
  if (database.prepare("SELECT 1 FROM posts WHERE media_id = ? UNION SELECT 1 FROM stories WHERE media_id = ?").get(mediaId, mediaId)) return true;
  return database.prepare("SELECT metadata_json FROM messages WHERE metadata_json IS NOT NULL")
    .all().some((row) => (parseJson(row.metadata_json, {}).mediaIds ?? []).includes(mediaId));
}

function cleanupMediaIfUnreferenced(mediaId, ownerId) {
  if (!mediaIsReferenced(mediaId)) removeMedia(mediaId, ownerId);
}

function publicMedia(media, viewerId = media.owner_id) {
  return {
    id: media.id,
    url: `/api/media/${encodeURIComponent(media.id)}?userId=${encodeURIComponent(viewerId)}`,
    name: media.original_name,
    mimeType: media.mime_type,
    sizeBytes: media.byte_size,
  };
}

function mediaById(mediaId, viewerId) {
  const media = database.prepare("SELECT * FROM media_files WHERE id = ?").get(mediaId);
  return media ? publicMedia(media, viewerId) : null;
}

function messagePayload(message, userId) {
  const payload = parseJson(message.payloadJson, {});
  if (message.kind === "media") {
    return {
      kind: "media",
      files: (payload.mediaIds ?? []).map((mediaId) => mediaById(mediaId, userId)).filter(Boolean),
    };
  }
  if (message.kind === "feed") {
    const postId = typeof payload.postId === "string" ? payload.postId : "";
    const post = database.prepare(`
      SELECT posts.id, posts.kind, posts.body AS caption, posts.media_id AS mediaId,
        users.name AS authorName
      FROM posts JOIN users ON users.id = posts.author_id
      WHERE posts.id = ?
    `).get(postId);
    return {
      kind: "feed",
      post: post ? {
        id: post.id,
        kind: post.kind,
        authorName: post.authorName,
        caption: post.caption,
        media: post.mediaId ? mediaById(post.mediaId, userId) : null,
      } : null,
    };
  }
  if (message.kind === "contact") return { kind: "contact", contact: payload.contact ?? null };
  if (message.kind === "location" && payload.shareId) {
    const share = database.prepare(`
      SELECT id, sender_id AS senderId, recipient_id AS recipientId, latitude, longitude, accuracy,
        expires_at AS expiresAt, revoked_at AS revokedAt
      FROM live_location_shares WHERE id = ?
    `).get(payload.shareId);
    return {
      kind: "location",
      latitude: share?.latitude ?? null,
      longitude: share?.longitude ?? null,
      accuracy: share?.accuracy ?? null,
      liveShareId: payload.shareId,
      expiresAt: share?.expiresAt ?? payload.expiresAt ?? null,
    };
  }
  if (message.kind === "location") {
    return {
      kind: "location",
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy ?? null,
    };
  }
  if (message.kind === "poll") {
    const voteCounts = database.prepare(`
      SELECT option_index AS optionIndex, COUNT(*) AS count
      FROM poll_votes WHERE message_id = ? GROUP BY option_index
    `).all(message.id);
    const selectedOption = database.prepare("SELECT option_index AS optionIndex FROM poll_votes WHERE message_id = ? AND user_id = ?")
      .get(message.id, userId)?.optionIndex ?? null;
    const options = (payload.options ?? []).map((option, index) => {
      const optionId = payload.optionIds?.[index] ?? String(index);
      return {
        id: optionId,
        text: typeof option === "string" ? option : option.text,
        votes: voteCounts.find((vote) => vote.optionIndex === index)?.count ?? 0,
        selected: selectedOption === index,
      };
    });
    return {
      kind: "poll",
      poll: {
        id: String(message.id),
        question: payload.question,
        options,
        totalVotes: voteCounts.reduce((total, vote) => total + vote.count, 0),
        expiresAt: null,
      },
    };
  }
  if (message.kind === "event") {
    const rsvpCount = database.prepare("SELECT COUNT(*) AS count FROM event_rsvps WHERE message_id = ?").get(message.id).count;
    const rawRsvp = database.prepare("SELECT status FROM event_rsvps WHERE message_id = ? AND user_id = ?")
      .get(message.id, userId)?.status;
    return {
      kind: "event",
      event: {
        id: String(message.id),
        title: payload.title,
        startsAt: payload.startsAt,
        place: payload.place ?? payload.location ?? "",
        description: payload.description ?? "",
        rsvpCount,
        myRsvp: rawRsvp === "going" ? "going" : rawRsvp === "maybe" ? "interested" : rawRsvp === "declined" ? "not_going" : null,
      },
    };
  }
  return { kind: message.kind ?? "text" };
}

function emitCallDataChanged(call) {
  for (const userId of [call.callerId, call.recipientId]) {
    io.to(`user:${userId}`).emit("data:changed", { type: "call" });
  }
}

function finishCall(callId, status) {
  const call = activeCalls.get(callId);
  if (!call) return;
  clearTimeout(call.timeout);
  const endedAt = new Date();
  const durationSeconds = call.acceptedAt ? Math.max(0, Math.floor((endedAt.getTime() - call.acceptedAt) / 1000)) : 0;
  database.prepare("UPDATE calls SET status = ?, ended_at = ?, duration_seconds = ? WHERE id = ?").run(
    status,
    endedAt.toISOString(),
    durationSeconds,
    call.databaseId,
  );
  activeCalls.delete(callId);
  const event = { callId, status, durationSeconds };
  for (const userId of [call.callerId, call.recipientId]) {
    io.to(`user:${userId}`).emit("call:ended", event);
  }
  emitCallDataChanged(call);
}

function deliverIncomingCall(call) {
  if (call.status !== "ringing" || !call.callerReady || call.incomingNotified) return;
  if (Date.now() >= call.deadlineAt) {
    finishCall(call.id, "missed");
    return;
  }
  if (!(activeSockets.get(call.recipientId)?.size ?? 0)) return;
  const caller = userById.get(call.callerId);
  if (!caller) return;
  call.incomingNotified = true;
  io.to(`user:${call.recipientId}`).emit("call:incoming", {
    callId: call.id,
    callerId: call.callerId,
    callerName: caller.name,
    kind: call.kind,
  });
}

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.post("/api/login", (request, response) => {
  const name = typeof request.body.name === "string" ? request.body.name.trim() : "";
  const email = typeof request.body.email === "string" ? request.body.email.trim().toLowerCase() : "";
  if (name.length < 1 || name.length > 60 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: "Enter a display name and valid email for this local demo account." });
  }

  const existingUser = database.prepare("SELECT id FROM users WHERE email = ?").get(email);
  const id = existingUser?.id ?? randomUUID();
  if (!existingUser) {
    database.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)").run(id, email, name, new Date().toISOString());
  }
  const user = userById.get(id);
  response.json({ user });
  io.emit("data:changed", { type: "user", userId: id });
});

app.get("/api/bootstrap", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const user = userById.get(userId);
  if (!user) return response.status(404).json({ error: "Local account not found. Please sign in again." });
  cleanExpiredEphemeral();

  const contacts = database.prepare(`
    SELECT users.id, users.email, users.name, users.created_at AS createdAt
    FROM users
    JOIN connections ON (
      (connections.user_a_id = users.id AND connections.user_b_id = ?) OR
      (connections.user_b_id = users.id AND connections.user_a_id = ?)
    )
    WHERE users.id != ?
    ORDER BY users.name COLLATE NOCASE
  `).all(userId, userId, userId);
  const allMessages = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, body, content_type AS kind,
      metadata_json AS payloadJson, created_at AS createdAt
    FROM messages
    WHERE sender_id = ? OR recipient_id = ?
    ORDER BY created_at, id
  `).all(userId, userId);
  const chats = contacts.map((contact) => {
    const [bg, fg] = avatarColors(contact.name);
    const messages = allMessages
      .filter((message) => message.senderId === contact.id || message.recipientId === contact.id)
      .map((message) => ({
        id: message.id,
        author: message.senderId === userId ? "me" : "them",
        text: message.body,
        kind: message.kind,
        payload: messagePayload(message, userId),
        time: displayTime(message.createdAt),
        createdAt: message.createdAt,
      }));
    const lastMessage = messages[messages.length - 1];
    const preference = database.prepare("SELECT theme_json AS themeJson, updated_at AS updatedAt FROM chat_preferences WHERE user_id = ? AND peer_id = ?").get(userId, contact.id);
    const readMarker = database.prepare(`
      SELECT last_read_message_id AS lastReadMessageId, updated_at AS updatedAt
      FROM chat_reads WHERE user_id = ? AND peer_id = ?
    `).get(userId, contact.id);
    const peerReadMarker = database.prepare(`
      SELECT last_read_message_id AS lastReadMessageId, updated_at AS updatedAt
      FROM chat_reads WHERE user_id = ? AND peer_id = ?
    `).get(contact.id, userId);
    const unread = readMarker
      ? database.prepare(`SELECT COUNT(*) AS count FROM messages WHERE sender_id = ? AND recipient_id = ? AND id > ?`)
        .get(contact.id, userId, readMarker.lastReadMessageId).count
      : 0;
    return {
      id: contact.id,
      name: contact.name,
      email: contact.email,
      initials: initials(contact.name),
      preview: lastMessage?.text || (lastMessage?.kind === "feed" ? "Shared a post or reel" : lastMessage ? "Shared media" : "Start a conversation"),
      time: lastMessage ? lastMessage.time : "",
      unread,
      lastReadMessageId: readMarker?.lastReadMessageId ?? 0,
      lastReadAt: readMarker?.updatedAt ?? null,
      peerLastReadMessageId: peerReadMarker?.lastReadMessageId ?? 0,
      peerLastReadAt: peerReadMarker?.updatedAt ?? null,
      theme: storedChatTheme(parseJson(preference?.themeJson)),
      bg,
      fg,
      online: (activeSockets.get(contact.id)?.size ?? 0) > 0,
      messages,
    };
  });
  const calls = database.prepare(`
    SELECT calls.id, calls.caller_id AS callerId, calls.recipient_id AS recipientId, calls.kind, calls.created_at AS createdAt,
      calls.ended_at AS endedAt, calls.status, calls.duration_seconds AS durationSeconds,
      caller.name AS callerName, recipient.name AS recipientName
    FROM calls
    JOIN users AS caller ON caller.id = calls.caller_id
    JOIN users AS recipient ON recipient.id = calls.recipient_id
    JOIN connections AS link ON (
      (link.user_a_id = calls.caller_id AND link.user_b_id = calls.recipient_id) OR
      (link.user_b_id = calls.caller_id AND link.user_a_id = calls.recipient_id)
    )
    WHERE calls.caller_id = ? OR calls.recipient_id = ?
    ORDER BY calls.created_at DESC, calls.id DESC
    LIMIT 100
  `).all(userId, userId).map((call) => {
    const contactId = call.callerId === userId ? call.recipientId : call.callerId;
    const name = call.callerId === userId ? call.recipientName : call.callerName;
    const [bg, fg] = avatarColors(name);
    return {
      id: call.id,
      contactId,
      name,
      initials: initials(name),
      bg,
      fg,
      kind: call.kind,
      direction: call.callerId === userId ? "outgoing" : "incoming",
      status: call.status,
      durationSeconds: call.durationSeconds,
      time: displayTime(call.createdAt),
      createdAt: call.createdAt,
      endedAt: call.endedAt,
    };
  });
  const incomingRequests = database.prepare(`
    SELECT requests.id, requests.sender_id AS senderId, users.name AS senderName, users.email AS senderEmail,
      requests.created_at AS createdAt
    FROM connection_requests AS requests
    JOIN users ON users.id = requests.sender_id
    WHERE requests.recipient_id = ? AND requests.status = 'pending'
    ORDER BY requests.created_at, requests.id
  `).all(userId);
  const connectedIds = new Set(database.prepare(`
    SELECT CASE WHEN user_a_id = ? THEN user_b_id ELSE user_a_id END AS contactId
    FROM connections WHERE user_a_id = ? OR user_b_id = ?
  `).all(userId, userId, userId).map((row) => row.contactId));
  const incomingIds = new Set(incomingRequests.map((request) => request.senderId));
  const outgoingIds = new Set(database.prepare(`
    SELECT recipient_id AS contactId FROM connection_requests WHERE sender_id = ? AND status = 'pending'
  `).all(userId).map((request) => request.contactId));
  const directory = database.prepare(`
    SELECT id, email, name FROM users WHERE id != ? ORDER BY name COLLATE NOCASE
  `).all(userId).map((contact) => {
    const [bg, fg] = avatarColors(contact.name);
    const status = connectedIds.has(contact.id)
      ? "connected"
      : incomingIds.has(contact.id)
        ? "incoming"
        : outgoingIds.has(contact.id)
          ? "outgoing"
          : "available";
    return {
      ...contact,
      initials: initials(contact.name),
      bg,
      fg,
      online: (activeSockets.get(contact.id)?.size ?? 0) > 0,
      status,
    };
  });
  const directoryById = new Map(directory.map((contact) => [contact.id, contact]));
  const connectionStatusFor = (authorId) => authorId === userId ? "self" : directoryById.get(authorId)?.status ?? "available";
  const feed = database.prepare(`
    SELECT posts.id, posts.author_id AS authorId, users.name AS authorName, posts.kind, posts.body,
      posts.media_id AS mediaId, posts.created_at AS createdAt,
      (SELECT COUNT(*) FROM post_likes WHERE post_id = posts.id) AS likeCount,
      (SELECT COUNT(*) FROM post_comments WHERE post_id = posts.id) AS commentCount,
      (SELECT COUNT(*) FROM post_reposts WHERE post_id = posts.id) AS repostCount,
      EXISTS(SELECT 1 FROM post_likes WHERE post_id = posts.id AND user_id = ?) AS liked,
      EXISTS(SELECT 1 FROM saved_posts WHERE post_id = posts.id AND user_id = ?) AS saved
    FROM posts JOIN users ON users.id = posts.author_id
    ORDER BY posts.created_at DESC LIMIT 50
  `).all(userId, userId).map((post) => ({
    id: post.id,
    authorId: post.authorId,
    authorName: post.authorName,
    initials: initials(post.authorName),
    connectionStatus: connectionStatusFor(post.authorId),
    kind: post.kind,
    caption: post.body,
    media: post.mediaId ? mediaById(post.mediaId, userId) : null,
    createdAt: post.createdAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    repostCount: post.repostCount,
    liked: Boolean(post.liked),
    saved: Boolean(post.saved),
    reposted: Boolean(database.prepare("SELECT 1 FROM post_reposts WHERE post_id = ? AND user_id = ?").get(post.id, userId)),
  }));
  const visibleIds = new Set([userId, ...contacts.map((contact) => contact.id)]);
  const updates = database.prepare(`
    SELECT stories.id, stories.author_id AS authorId, users.name AS authorName, stories.body,
      stories.media_id AS mediaId, stories.created_at AS createdAt, stories.expires_at AS expiresAt
    FROM stories JOIN users ON users.id = stories.author_id
    WHERE stories.expires_at > ?
    ORDER BY stories.created_at DESC LIMIT 200
  `).all(new Date().toISOString()).filter((story) => visibleIds.has(story.authorId)).map((story) => ({
    id: story.id,
    authorId: story.authorId,
    authorName: story.authorName,
    initials: initials(story.authorName),
    connectionStatus: connectionStatusFor(story.authorId),
    body: story.body,
    caption: story.body,
    media: story.mediaId ? mediaById(story.mediaId, userId) : null,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
  }));
  const notes = database.prepare(`
    SELECT notes.id, notes.author_id AS authorId, users.name AS authorName, notes.body,
      notes.created_at AS createdAt, notes.expires_at AS expiresAt
    FROM notes JOIN users ON users.id = notes.author_id
    WHERE notes.expires_at > ? ORDER BY notes.created_at DESC LIMIT 200
  `).all(new Date().toISOString()).filter((note) => visibleIds.has(note.authorId))
    .map((note) => ({
      ...note,
      text: note.body,
      initials: initials(note.authorName),
      connectionStatus: connectionStatusFor(note.authorId),
    }));
  const followRequests = database.prepare(`
    SELECT follows.follower_id AS followerId, users.name AS followerName, follows.created_at AS createdAt
    FROM follows JOIN users ON users.id = follows.follower_id
    WHERE follows.followee_id = ? AND follows.status = 'pending'
    ORDER BY follows.created_at
  `).all(userId);
  const following = database.prepare(`
    SELECT followee_id AS followeeId, status, created_at AS createdAt
    FROM follows WHERE follower_id = ? ORDER BY created_at DESC
  `).all(userId);
  const locationShares = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, latitude, longitude, accuracy,
      created_at AS createdAt, updated_at AS updatedAt, expires_at AS expiresAt
    FROM live_location_shares
    WHERE (sender_id = ? OR recipient_id = ?) AND revoked_at IS NULL AND expires_at > ?
  `).all(userId, userId, new Date().toISOString());
  const chatPreferences = database.prepare(`
    SELECT peer_id AS contactId, theme_json AS themeJson, updated_at AS updatedAt
    FROM chat_preferences WHERE user_id = ? ORDER BY updated_at DESC
  `).all(userId).map((preference) => ({
    contactId: preference.contactId,
    theme: storedChatTheme(parseJson(preference.themeJson)),
    updatedAt: preference.updatedAt,
  }));
  response.json({
    user, chats, calls, directory, incomingRequests, storage: getStorageInfo(),
    feed, updates, notes, followRequests, following, locationShares, chatPreferences,
  });
});

app.post("/api/connection-requests", (request, response) => {
  const { senderId, recipientId } = request.body;
  if (typeof senderId !== "string" || typeof recipientId !== "string" || senderId === recipientId) {
    return response.status(400).json({ error: "Choose another local account to connect with." });
  }
  if (!userById.get(senderId) || !userById.get(recipientId)) {
    return response.status(404).json({ error: "One of these local accounts no longer exists." });
  }
  if (isConnected(senderId, recipientId)) {
    return response.status(409).json({ error: "You are already connected to this account." });
  }
  const existing = database.prepare(`
    SELECT id FROM connection_requests WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
  `).get(senderId, recipientId);
  if (existing) return response.json({ id: existing.id, status: "pending" });

  const createdAt = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO connection_requests (sender_id, recipient_id, created_at) VALUES (?, ?, ?)
  `).run(senderId, recipientId, createdAt);
  emitConnectionChanged([senderId, recipientId]);
  response.status(201).json({ id: Number(result.lastInsertRowid), status: "pending" });
});

app.post("/api/follows", (request, response) => {
  const { followerId, followeeId } = request.body;
  if (!isValidUser(followerId) || !isValidUser(followeeId) || followerId === followeeId) {
    return response.status(400).json({ error: "Choose two different existing accounts." });
  }
  if (isConnected(followerId, followeeId)) {
    return response.status(409).json({ error: "These accounts are already connected." });
  }
  const existing = database.prepare(`
    SELECT id FROM connection_requests
    WHERE sender_id = ? AND recipient_id = ? AND status = 'pending'
  `).get(followerId, followeeId);
  if (existing) {
    database.prepare(`
      INSERT INTO follows (follower_id, followee_id, status, created_at)
      VALUES (?, ?, 'pending', ?)
      ON CONFLICT(follower_id, followee_id) DO UPDATE SET status = 'pending', handled_at = NULL
    `).run(followerId, followeeId, new Date().toISOString());
    emitUserChange([followerId, followeeId], "follow");
    return response.json({ requestId: existing.id, status: "pending" });
  }
  const createdAt = new Date().toISOString();
  const result = database.prepare(`
    INSERT INTO connection_requests (sender_id, recipient_id, created_at) VALUES (?, ?, ?)
  `).run(followerId, followeeId, createdAt);
  database.prepare(`
    INSERT INTO follows (follower_id, followee_id, status, created_at)
    VALUES (?, ?, 'pending', ?)
    ON CONFLICT(follower_id, followee_id) DO UPDATE SET status = 'pending', created_at = excluded.created_at, handled_at = NULL
  `).run(followerId, followeeId, createdAt);
  emitUserChange([followerId, followeeId], "follow");
  emitConnectionChanged([followerId, followeeId]);
  response.status(201).json({ requestId: Number(result.lastInsertRowid), status: "pending" });
});

app.post("/api/connection-requests/:requestId/accept", (request, response) => {
  const requestId = Number(request.params.requestId);
  const { userId } = request.body;
  if (!Number.isSafeInteger(requestId) || typeof userId !== "string") {
    return response.status(400).json({ error: "A valid request and account are required." });
  }
  const connectionRequest = database.prepare(`
    SELECT sender_id AS senderId, recipient_id AS recipientId
    FROM connection_requests WHERE id = ? AND recipient_id = ? AND status = 'pending'
  `).get(requestId, userId);
  if (!connectionRequest) return response.status(404).json({ error: "This connection request is no longer available." });

  const [userAId, userBId] = [connectionRequest.senderId, connectionRequest.recipientId].sort();
  const handledAt = new Date().toISOString();
  database.prepare("INSERT OR IGNORE INTO connections (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)")
    .run(userAId, userBId, handledAt);
  database.prepare(`
    UPDATE connection_requests SET status = 'accepted', handled_at = ?
    WHERE status = 'pending' AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
  `).run(handledAt, userAId, userBId, userBId, userAId);
  database.prepare(`
    UPDATE follows SET status = 'accepted', handled_at = ?
    WHERE follower_id = ? AND followee_id = ?
  `).run(handledAt, connectionRequest.senderId, connectionRequest.recipientId);
  emitConnectionChanged([connectionRequest.senderId, connectionRequest.recipientId]);
  response.json({ connected: true });
});

app.post("/api/connection-requests/:requestId/decline", (request, response) => {
  const requestId = Number(request.params.requestId);
  const { userId } = request.body;
  if (!Number.isSafeInteger(requestId) || typeof userId !== "string") {
    return response.status(400).json({ error: "A valid request and account are required." });
  }
  const connectionRequest = database.prepare(`
    SELECT sender_id AS senderId, recipient_id AS recipientId
    FROM connection_requests WHERE id = ? AND recipient_id = ? AND status = 'pending'
  `).get(requestId, userId);
  if (!connectionRequest) return response.status(404).json({ error: "This connection request is no longer available." });

  database.prepare("UPDATE connection_requests SET status = 'declined', handled_at = ? WHERE id = ?")
    .run(new Date().toISOString(), requestId);
  database.prepare(`
    UPDATE follows SET status = 'declined', handled_at = ?
    WHERE follower_id = ? AND followee_id = ?
  `).run(new Date().toISOString(), connectionRequest.senderId, connectionRequest.recipientId);
  emitConnectionChanged([connectionRequest.senderId, connectionRequest.recipientId]);
  response.json({ declined: true });
});

app.post("/api/media", express.raw({ type: () => true, limit: maximumUploadBytes }), (request, response) => {
  const ownerId = request.get("x-user-id");
  if (!isValidUser(ownerId)) return response.status(400).json({ error: "A valid X-User-Id header is required." });
  if (!Buffer.isBuffer(request.body) || request.body.length < 1) {
    return response.status(400).json({ error: "Upload a non-empty raw file body." });
  }
  const mimeType = (request.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const expectedExtension = allowedMediaTypes.get(mimeType);
  if (!expectedExtension) return response.status(415).json({ error: "This media type is not supported." });
  if (!mediaSignatureMatches(mimeType, request.body)) return response.status(415).json({ error: "The file signature does not match Content-Type." });
  let originalName;
  try {
    originalName = decodeURIComponent(request.get("x-file-name") ?? "");
  } catch {
    return response.status(400).json({ error: "X-File-Name must be URL encoded." });
  }
  if (
    originalName.length < 1 || originalName.length > 120 ||
    basename(originalName) !== originalName ||
    /[\\/:*?"<>|\u0000-\u001f]/.test(originalName) ||
    originalName.endsWith(".") || originalName.endsWith(" ") || originalName === "." || originalName === ".."
  ) return response.status(400).json({ error: "X-File-Name must be a plain, safe file name (1–120 characters)." });
  const extension = extname(originalName).toLowerCase();
  const jpegExtension = mimeType === "image/jpeg" && extension === ".jpeg";
  if (extension !== expectedExtension && !jpegExtension) {
    return response.status(415).json({ error: "The filename extension does not match Content-Type." });
  }
  const id = randomUUID();
  const storageName = `${id}${expectedExtension}`;
  mkdirSync(uploadsDirectory, { recursive: true });
  try {
    writeFileSync(resolve(uploadsDirectory, storageName), request.body, { flag: "wx" });
    database.prepare(`
      INSERT INTO media_files (id, owner_id, original_name, mime_type, byte_size, storage_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, ownerId, originalName, mimeType, request.body.length, storageName, new Date().toISOString());
  } catch (error) {
    try { unlinkSync(resolve(uploadsDirectory, storageName)); } catch {}
    throw error;
  }
  response.status(201).json({ media: mediaById(id) });
});

app.get("/api/media/:mediaId", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const media = database.prepare("SELECT * FROM media_files WHERE id = ?").get(request.params.mediaId);
  if (!media) return response.status(404).json({ error: "Media file not found." });
  const isPublicPostMedia = isValidUser(userId) && Boolean(database.prepare("SELECT 1 FROM posts WHERE media_id = ?").get(media.id));
  const isConnectedStoryMedia = userId && isConnected(media.owner_id, userId) &&
    Boolean(database.prepare("SELECT 1 FROM stories WHERE media_id = ? AND expires_at > ?").get(media.id, new Date().toISOString()));
  const mayRead = media.owner_id === userId ||
    (media.recipient_id === userId && isConnected(media.owner_id, userId)) ||
    isPublicPostMedia || isConnectedStoryMedia;
  if (!mayRead) return response.status(403).json({ error: "This media file is not shared with this account." });
  try {
    const bytes = readFileSync(resolve(uploadsDirectory, media.storage_name));
    response.setHeader("Content-Type", media.mime_type);
    response.setHeader("Content-Length", bytes.length);
    response.setHeader("X-Content-Type-Options", "nosniff");
    const asciiName = media.original_name.replace(/[^ -~]/g, "_").replace(/["\\]/g, "_");
    const encodedName = encodeURIComponent(media.original_name).replace(/'/g, "%27");
    response.setHeader("Content-Disposition", `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
    response.send(bytes);
  } catch (error) {
    if (error.code === "ENOENT") return response.status(404).json({ error: "Media file is unavailable on disk." });
    throw error;
  }
});

app.delete("/api/media/:mediaId", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const media = database.prepare("SELECT id FROM media_files WHERE id = ? AND owner_id = ?").get(request.params.mediaId, userId);
  if (!media) return response.status(404).json({ error: "Media file not found for this account." });
  if (mediaIsReferenced(media.id)) return response.status(409).json({ error: "This file is still attached to saved content." });
  removeMedia(media.id, userId);
  response.json({ deleted: true });
});

function notifyPost(postId, actorId, type) {
  const post = database.prepare("SELECT author_id AS authorId FROM posts WHERE id = ?").get(postId);
  if (!post) return;
  const followers = database.prepare("SELECT follower_id AS id FROM follows WHERE followee_id = ? AND status = 'accepted'").all(post.authorId);
  emitUserChange([post.authorId, actorId, ...followers.map((row) => row.id)], type, { postId });
}

app.post("/api/feed", (request, response) => {
  const { userId } = request.body;
  const kind = request.body.kind ?? "post";
  const caption = typeof request.body.caption === "string" ? request.body.caption.trim() : "";
  const mediaId = typeof request.body.mediaId === "string" ? request.body.mediaId : null;
  if (!isValidUser(userId) || !["post", "reel"].includes(kind) || (!caption && !mediaId) || caption.length > 2000) {
    return response.status(400).json({ error: "A valid account, post or reel, and caption or media are required." });
  }
  if (mediaId && !database.prepare("SELECT 1 FROM media_files WHERE id = ? AND owner_id = ?").get(mediaId, userId)) {
    return response.status(404).json({ error: "The attached media file was not found for this account." });
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  database.prepare("INSERT INTO posts (id, author_id, kind, body, media_id, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, kind, caption, mediaId, createdAt);
  emitUserChange([userId], "feed", { postId: id });
  response.status(201).json({
    post: { id, authorId: userId, authorName: userById.get(userId).name, initials: initials(userById.get(userId).name), connectionStatus: "self", kind, caption, media: mediaId ? mediaById(mediaId) : null, createdAt, likeCount: 0, commentCount: 0, repostCount: 0, liked: false, saved: false, reposted: false },
  });
});

app.post("/api/feed/:postId/like", (request, response) => {
  const { userId } = request.body;
  const post = database.prepare("SELECT id FROM posts WHERE id = ?").get(request.params.postId);
  if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
  if (!post) return response.status(404).json({ error: "Post not found." });
  database.prepare("INSERT OR IGNORE INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)")
    .run(post.id, userId, new Date().toISOString());
  notifyPost(post.id, userId, "feed:like");
  response.json({ liked: true });
});

app.delete("/api/feed/:postId/like", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
  if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(request.params.postId)) return response.status(404).json({ error: "Post not found." });
  database.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(request.params.postId, userId);
  response.json({ liked: false });
});

app.post("/api/feed/:postId/comments", (request, response) => {
  const { userId } = request.body;
  const parentId = typeof request.body.parentId === "string" ? request.body.parentId : null;
  const body = typeof request.body.body === "string"
    ? request.body.body.trim()
    : typeof request.body.text === "string" ? request.body.text.trim() : "";
  if (!isValidUser(userId) || !body || body.length > 1000) return response.status(400).json({ error: "A valid account and comment text (maximum 1,000 characters) are required." });
  if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(request.params.postId)) return response.status(404).json({ error: "Post not found." });
  if (parentId && !database.prepare("SELECT 1 FROM post_comments WHERE id = ? AND post_id = ?").get(parentId, request.params.postId)) {
    return response.status(404).json({ error: "Reply target not found on this post." });
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  database.prepare("INSERT INTO post_comments (id, post_id, author_id, parent_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, request.params.postId, userId, parentId, body, createdAt);
  notifyPost(request.params.postId, userId, "feed:comment");
  response.status(201).json({ comment: { id, postId: request.params.postId, authorId: userId, authorName: userById.get(userId).name, parentId, body, text: body, createdAt, time: displayTime(createdAt) } });
});

app.get("/api/feed/:postId/comments", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
  if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(request.params.postId)) return response.status(404).json({ error: "Post not found." });
  const comments = database.prepare(`
    SELECT comments.id, comments.author_id AS authorId, users.name AS authorName,
      comments.parent_id AS parentId, comments.body, comments.created_at AS createdAt
    FROM post_comments AS comments JOIN users ON users.id = comments.author_id
    WHERE comments.post_id = ? ORDER BY comments.created_at DESC, comments.id DESC LIMIT 500
  `).all(request.params.postId).reverse().map((comment) => ({
    ...comment,
    text: comment.body,
    time: displayTime(comment.createdAt),
  }));
  response.json({ comments });
});

for (const [action, table] of [["repost", "post_reposts"], ["save", "saved_posts"]]) {
  app.post(`/api/feed/:postId/${action}`, (request, response) => {
    const { userId } = request.body;
    if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
    if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(request.params.postId)) return response.status(404).json({ error: "Post not found." });
    database.prepare(`INSERT OR IGNORE INTO ${table} (post_id, user_id, created_at) VALUES (?, ?, ?)`)
      .run(request.params.postId, userId, new Date().toISOString());
    notifyPost(request.params.postId, userId, `feed:${action}`);
    response.json({ [action === "save" ? "saved" : "reposted"]: true });
  });
  app.delete(`/api/feed/:postId/${action}`, (request, response) => {
    const userId = typeof request.query.userId === "string" ? request.query.userId : "";
    if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
    if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(request.params.postId)) return response.status(404).json({ error: "Post not found." });
    database.prepare(`DELETE FROM ${table} WHERE post_id = ? AND user_id = ?`).run(request.params.postId, userId);
    response.json({ [action === "save" ? "saved" : "reposted"]: false });
  });
}

app.delete("/api/feed/:postId", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const post = database.prepare("SELECT media_id AS mediaId FROM posts WHERE id = ? AND author_id = ?").get(request.params.postId, userId);
  if (!post) return response.status(404).json({ error: "Post not found for this account." });
  database.prepare("DELETE FROM posts WHERE id = ?").run(request.params.postId);
  if (post.mediaId) cleanupMediaIfUnreferenced(post.mediaId, userId);
  emitUserChange([userId], "feed", { postId: request.params.postId });
  response.json({ deleted: true });
});

app.post("/api/updates", (request, response) => {
  const { userId } = request.body;
  const body = typeof request.body.body === "string"
    ? request.body.body.trim()
    : typeof request.body.caption === "string" ? request.body.caption.trim() : "";
  const mediaId = typeof request.body.mediaId === "string" ? request.body.mediaId : null;
  if (!isValidUser(userId) || (!body && !mediaId) || body.length > 1000) return response.status(400).json({ error: "A valid account and story text or media are required (text maximum 1,000 characters)." });
  if (mediaId && !database.prepare("SELECT 1 FROM media_files WHERE id = ? AND owner_id = ?").get(mediaId, userId)) return response.status(404).json({ error: "The attached media file was not found for this account." });
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  database.prepare("INSERT INTO stories (id, author_id, body, media_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, userId, body, mediaId, createdAt.toISOString(), expiresAt.toISOString());
  emitUserChange([userId], "updates", { updateId: id });
  response.status(201).json({ update: { id, authorId: userId, authorName: userById.get(userId).name, initials: initials(userById.get(userId).name), connectionStatus: "self", body, caption: body, media: mediaId ? mediaById(mediaId) : null, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() } });
});

app.delete("/api/updates/:id", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const story = database.prepare("SELECT media_id AS mediaId FROM stories WHERE id = ? AND author_id = ?").get(request.params.id, userId);
  if (!story) return response.status(404).json({ error: "Story not found for this account." });
  database.prepare("DELETE FROM stories WHERE id = ?").run(request.params.id);
  if (story.mediaId) cleanupMediaIfUnreferenced(story.mediaId, userId);
  emitUserChange([userId], "updates", { updateId: request.params.id });
  response.json({ deleted: true });
});

app.post("/api/notes", (request, response) => {
  const { userId } = request.body;
  const body = typeof request.body.body === "string"
    ? request.body.body.trim()
    : typeof request.body.text === "string" ? request.body.text.trim() : "";
  if (!isValidUser(userId) || !body || body.length > 200) return response.status(400).json({ error: "A valid account and note text (maximum 200 characters) are required." });
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  database.prepare("INSERT INTO notes (id, author_id, body, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, userId, body, createdAt.toISOString(), expiresAt.toISOString());
  emitUserChange([userId], "notes", { noteId: id });
  response.status(201).json({ note: { id, authorId: userId, authorName: userById.get(userId).name, initials: initials(userById.get(userId).name), connectionStatus: "self", body, text: body, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() } });
});

app.delete("/api/notes/:id", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const result = database.prepare("DELETE FROM notes WHERE id = ? AND author_id = ?").run(request.params.id, userId);
  if (!Number(result.changes)) return response.status(404).json({ error: "Note not found for this account." });
  emitUserChange([userId], "notes", { noteId: request.params.id });
  response.json({ deleted: true });
});

app.post("/api/location-shares", (request, response) => {
  const senderId = request.body.senderId ?? request.body.userId;
  const { recipientId, consent } = request.body;
  const durationMinutes = request.body.durationMinutes ?? request.body.expiresInMinutes ?? 15;
  const coords = request.body.coords && typeof request.body.coords === "object" ? request.body.coords : request.body;
  const latitude = coords.latitude ?? coords.lat;
  const longitude = coords.longitude ?? coords.lng;
  const accuracy = coords.accuracy;
  const hasCoordinates = latitude !== undefined || longitude !== undefined;
  if (!isValidUser(senderId) || !isValidUser(recipientId) || senderId === recipientId || consent !== true) {
    return response.status(400).json({ error: "Valid senderId and recipientId accounts plus explicit consent: true are required." });
  }
  if (!isConnected(senderId, recipientId)) return response.status(403).json({ error: "Live location can only be shared with an accepted connection." });
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 15) {
    return response.status(400).json({ error: "expiresInMinutes must be an integer from 1 to 15." });
  }
  if (hasCoordinates && (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000))
  )) return response.status(400).json({ error: "Coordinates must be valid latitude/longitude values and optional accuracy between 0 and 10,000m." });
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + durationMinutes * 60 * 1000).toISOString();
  database.prepare(`
    INSERT INTO live_location_shares
      (id, sender_id, recipient_id, latitude, longitude, accuracy, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, senderId, recipientId, hasCoordinates ? latitude : null, hasCoordinates ? longitude : null,
    hasCoordinates ? (accuracy ?? null) : null, createdAt.toISOString(), hasCoordinates ? createdAt.toISOString() : null, expiresAt);
  const previousMessage = database.prepare(`
    SELECT COALESCE(MAX(id), 0) AS id FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  `).get(senderId, recipientId, recipientId, senderId).id;
  database.prepare("INSERT OR IGNORE INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)")
    .run(recipientId, senderId, previousMessage, createdAt.toISOString());
  const messageResult = database.prepare(`
    INSERT INTO messages (sender_id, recipient_id, body, created_at, content_type, metadata_json)
    VALUES (?, ?, ?, ?, 'location', ?)
  `).run(senderId, recipientId, "Live location shared", createdAt.toISOString(), JSON.stringify({ shareId: id, expiresAt }));
  const messageId = Number(messageResult.lastInsertRowid);
  database.prepare(`
    INSERT INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
  `).run(senderId, recipientId, messageId, createdAt.toISOString());
  emitUserChange([senderId, recipientId], "message", { messageId, senderId, recipientId, body: "Live location shared", kind: "location" });
  io.to(`user:${recipientId}`).emit("location:shared", { id, senderId, expiresAt });
  emitUserChange([senderId, recipientId], "location-share", { shareId: id });
  response.status(201).json({ share: { id, senderId, recipientId, latitude: hasCoordinates ? latitude : null, longitude: hasCoordinates ? longitude : null, accuracy: hasCoordinates ? (accuracy ?? null) : null, createdAt: createdAt.toISOString(), updatedAt: hasCoordinates ? createdAt.toISOString() : null, expiresAt } });
});

function patchLocationShare(request, response) {
  const { userId } = request.body;
  const coords = request.body.coords && typeof request.body.coords === "object" ? request.body.coords : request.body;
  const latitude = coords.latitude ?? coords.lat;
  const longitude = coords.longitude ?? coords.lng;
  const accuracy = coords.accuracy;
  const share = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, expires_at AS expiresAt, revoked_at AS revokedAt
    FROM live_location_shares WHERE id = ?
  `).get(request.params.id);
  if (!isValidUser(userId) || !share || share.senderId !== userId) return response.status(404).json({ error: "Active location share not found for this account." });
  if (share.revokedAt || Date.parse(share.expiresAt) <= Date.now()) {
    database.prepare("UPDATE live_location_shares SET latitude = NULL, longitude = NULL, accuracy = NULL WHERE id = ?").run(share.id);
    return response.status(410).json({ error: "This location share has expired or been revoked." });
  }
  if (!isConnected(share.senderId, share.recipientId)) return response.status(403).json({ error: "The recipient is no longer an accepted connection." });
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
    (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10000))) {
    return response.status(400).json({ error: "Coordinates must be valid latitude/longitude values and optional accuracy between 0 and 10,000m." });
  }
  const updatedAt = new Date().toISOString();
  database.prepare("UPDATE live_location_shares SET latitude = ?, longitude = ?, accuracy = ?, updated_at = ? WHERE id = ?")
    .run(latitude, longitude, accuracy ?? null, updatedAt, share.id);
  const event = { id: share.id, senderId: share.senderId, latitude, longitude, accuracy: accuracy ?? null, updatedAt, expiresAt: share.expiresAt };
  io.to(`user:${share.recipientId}`).emit("location:update", event);
  emitUserChange([share.senderId], "location-share", { shareId: share.id });
  response.json({ share: event });
}

app.patch("/api/location-shares/:id", patchLocationShare);
app.patch("/api/location-shares", (request, response) => {
  if (typeof request.body.shareId !== "string") return response.status(400).json({ error: "shareId is required." });
  request.params.id = request.body.shareId;
  return patchLocationShare(request, response);
});

function revokeLocationShare(request, response) {
  const userId = request.body?.userId ?? request.query.userId;
  const share = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, revoked_at AS revokedAt
    FROM live_location_shares WHERE id = ?
  `).get(request.params.id);
  if (!isValidUser(userId) || !share || ![share.senderId, share.recipientId].includes(userId)) {
    return response.status(404).json({ error: "Location share not found for this account." });
  }
  if (!share.revokedAt) {
    database.prepare(`
      UPDATE live_location_shares SET revoked_at = ?, latitude = NULL, longitude = NULL, accuracy = NULL WHERE id = ?
    `).run(new Date().toISOString(), share.id);
  }
  io.to(`user:${share.recipientId}`).emit("location:revoked", { id: share.id, senderId: share.senderId });
  emitUserChange([share.senderId, share.recipientId], "location-share", { shareId: share.id });
  response.json({ revoked: true, id: share.id });
}

app.delete("/api/location-shares/:id", revokeLocationShare);
app.delete("/api/location-shares", (request, response) => {
  if (typeof request.body.shareId !== "string") return response.status(400).json({ error: "shareId is required." });
  request.params.id = request.body.shareId;
  return revokeLocationShare(request, response);
});

app.post("/api/messages", (request, response) => {
  const { senderId, recipientId } = request.body;
  const kind = request.body.kind ?? "text";
  const body = typeof request.body.body === "string" ? request.body.body.trim() : "";
  let payload = request.body.payload && typeof request.body.payload === "object" && !Array.isArray(request.body.payload)
    ? { ...request.body.payload }
    : {};
  if (Array.isArray(request.body.mediaIds)) payload.mediaIds = request.body.mediaIds;
  if (!isValidUser(senderId) || !isValidUser(recipientId) || senderId === recipientId) {
    return response.status(400).json({ error: "Valid, different senderId and recipientId accounts are required." });
  }
  if (!isConnected(senderId, recipientId)) {
    return response.status(403).json({ error: "Accept this account's connection request before messaging." });
  }
  if (!["text", "media", "contact", "poll", "event", "location", "feed"].includes(kind)) {
    return response.status(400).json({ error: "kind must be text, media, contact, poll, event, location, or feed." });
  }
  if (kind === "text" && (!body || body.length > 2000)) return response.status(400).json({ error: "Text messages must contain 1–2,000 characters." });
  if (kind !== "text" && body.length > 2000) return response.status(400).json({ error: "Message text must be at most 2,000 characters." });

  if (kind === "media") {
    const mediaIds = payload.mediaIds;
    if (!Array.isArray(mediaIds) || mediaIds.length < 1 || mediaIds.length > 10 || mediaIds.some((id) => typeof id !== "string")) {
      return response.status(400).json({ error: "Media messages require 1–10 uploaded mediaIds." });
    }
    const files = mediaIds.map((id) => database.prepare("SELECT id FROM media_files WHERE id = ? AND owner_id = ? AND recipient_id IS NULL").get(id, senderId));
    if (files.some((file) => !file)) return response.status(404).json({ error: "Every mediaId must be an unshared upload owned by senderId." });
    payload = { mediaIds: [...new Set(mediaIds)] };
    if (payload.mediaIds.length !== mediaIds.length) return response.status(400).json({ error: "Duplicate mediaIds are not allowed." });
  } else if (kind === "feed") {
    const postId = typeof payload.postId === "string" ? payload.postId : "";
    if (!database.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) {
      return response.status(404).json({ error: "The post or reel you are sharing is no longer available." });
    }
    payload = { postId };
  } else if (kind === "contact") {
    const contactId = payload.contactId;
    const contact = isValidUser(contactId) && isConnected(senderId, contactId) && isConnected(recipientId, contactId)
      ? userById.get(contactId)
      : null;
    if (!contact) return response.status(403).json({ error: "Contact cards can only share a contact already connected to both chat participants." });
    payload = { contact: { id: contact.id, name: contact.name, email: contact.email } };
  } else if (kind === "poll") {
    const question = typeof payload.question === "string" ? payload.question.trim() : body;
    const options = payload.options;
    if (!question || question.length > 300 || !Array.isArray(options) || options.length < 2 || options.length > 8 ||
      options.some((option) => typeof option !== "string" || !option.trim() || option.trim().length > 100)) {
      return response.status(400).json({ error: "Polls require a question (max 300 characters) and 2–8 options (max 100 characters each)." });
    }
    payload = { question, options: options.map((option) => option.trim()) };
    payload.optionIds = options.map((_option, index) => String(index));
  } else if (kind === "event") {
    const title = typeof payload.title === "string" ? payload.title.trim() : body;
    const startsAt = typeof payload.startsAt === "string" && Number.isFinite(Date.parse(payload.startsAt)) ? new Date(payload.startsAt).toISOString() : "";
    const place = typeof payload.place === "string" ? payload.place.trim() : typeof payload.location === "string" ? payload.location.trim() : "";
    const description = typeof payload.description === "string" ? payload.description.trim() : "";
    if (!title || title.length > 200 || !startsAt || place.length > 200 || description.length > 1000) {
      return response.status(400).json({ error: "Events require a title (max 200 characters), valid startsAt, place (max 200), and description (max 1,000); no map provider is used." });
    }
    payload = { title, startsAt, place, description };
  } else if (kind === "location") {
    if (payload.shareId !== undefined || payload.liveShareId !== undefined) {
      return response.status(400).json({ error: "Use /api/location-shares for live location; message location payloads are one-time only." });
    }
    if (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90 ||
      !Number.isFinite(payload.longitude) || payload.longitude < -180 || payload.longitude > 180 ||
      (payload.accuracy !== undefined && (!Number.isFinite(payload.accuracy) || payload.accuracy < 0 || payload.accuracy > 10000))) {
      return response.status(400).json({ error: "One-time location messages require valid latitude/longitude and optional accuracy from 0 to 10,000m." });
    }
    payload = {
      latitude: payload.latitude,
      longitude: payload.longitude,
      ...(payload.accuracy === undefined ? {} : { accuracy: payload.accuracy }),
    };
  }

  const createdAt = new Date().toISOString();
  const previousMessage = database.prepare(`
    SELECT COALESCE(MAX(id), 0) AS id FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  `).get(senderId, recipientId, recipientId, senderId).id;
  database.prepare(`
    INSERT OR IGNORE INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
  `).run(recipientId, senderId, previousMessage, createdAt);
  const result = database.prepare(`
    INSERT INTO messages (sender_id, recipient_id, body, created_at, content_type, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(senderId, recipientId, body || "", createdAt, kind, Object.keys(payload).length ? JSON.stringify(payload) : null);
  const id = Number(result.lastInsertRowid);
  database.prepare(`
    INSERT INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
  `).run(senderId, recipientId, id, createdAt);
  if (kind === "media") {
    for (const mediaId of payload.mediaIds) database.prepare("UPDATE media_files SET recipient_id = ? WHERE id = ? AND owner_id = ?")
      .run(recipientId, mediaId, senderId);
  }
  const message = { id, kind, payloadJson: JSON.stringify(payload) };
  emitUserChange([senderId, recipientId], "message", { messageId: id, senderId, recipientId, body, kind });
  response.status(201).json({ id, createdAt, kind, payload: messagePayload(message, senderId) });
});

app.delete("/api/messages/:messageId", (request, response) => {
  const userId = typeof request.query.userId === "string" ? request.query.userId : "";
  const messageId = Number(request.params.messageId);
  if (!Number.isSafeInteger(messageId) || !isValidUser(userId)) return response.status(400).json({ error: "A valid messageId and userId are required." });
  const message = database.prepare(`
    SELECT sender_id AS senderId, recipient_id AS recipientId, content_type AS kind, metadata_json AS payloadJson
    FROM messages WHERE id = ? AND sender_id = ?
  `).get(messageId, userId);
  if (!message) return response.status(404).json({ error: "Message not found for this account." });
  const messagePayloadJson = parseJson(message.payloadJson, {});
  const mediaIds = messagePayloadJson.mediaIds ?? [];
  database.prepare("DELETE FROM messages WHERE id = ?").run(messageId);
  if (message.kind === "location" && messagePayloadJson.shareId) {
    database.prepare(`
      UPDATE live_location_shares SET revoked_at = ?, latitude = NULL, longitude = NULL, accuracy = NULL
      WHERE id = ? AND revoked_at IS NULL
    `).run(new Date().toISOString(), messagePayloadJson.shareId);
    io.to(`user:${message.recipientId}`).emit("location:revoked", { id: messagePayloadJson.shareId, senderId: message.senderId });
  }
  for (const mediaId of mediaIds) cleanupMediaIfUnreferenced(mediaId, userId);
  emitUserChange([message.senderId, message.recipientId], "message", { messageId });
  response.json({ deleted: true });
});

app.post("/api/polls/:id/votes", (request, response) => {
  const { userId } = request.body;
  let optionIndex = request.body.optionIndex;
  if (optionIndex === undefined && request.body.optionId !== undefined) {
    const optionId = String(request.body.optionId);
    const pollPayload = database.prepare("SELECT metadata_json AS payloadJson FROM messages WHERE id = ? AND content_type = 'poll'")
      .get(Number(request.params.id));
    const optionIds = parseJson(pollPayload?.payloadJson, {}).optionIds;
    optionIndex = Array.isArray(optionIds) ? optionIds.indexOf(optionId) : Number(optionId);
  }
  const message = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId, metadata_json AS payloadJson
    FROM messages WHERE id = ? AND content_type = 'poll'
  `).get(Number(request.params.id));
  if (!isValidUser(userId) || !Number.isSafeInteger(optionIndex)) return response.status(400).json({ error: "A valid userId and integer optionIndex are required." });
  if (!message || ![message.senderId, message.recipientId].includes(userId)) return response.status(404).json({ error: "Poll not found in this account's chats." });
  const poll = parseJson(message.payloadJson, {});
  if (optionIndex < 0 || optionIndex >= poll.options.length) return response.status(400).json({ error: "optionIndex is outside the poll options." });
  database.prepare(`
    INSERT INTO poll_votes (message_id, user_id, option_index, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(message_id, user_id) DO UPDATE SET option_index = excluded.option_index, created_at = excluded.created_at
  `).run(message.id, userId, optionIndex, new Date().toISOString());
  emitUserChange([message.senderId, message.recipientId], "poll", { messageId: message.id });
  response.json({ messageId: message.id, optionIndex, optionId: String(optionIndex) });
});

app.post("/api/events/:id/rsvp", (request, response) => {
  const userId = request.body.userId;
  const responseChoice = request.body.response ?? request.body.status;
  const status = ({
    yes: "going",
    going: "going",
    interested: "maybe",
    maybe: "maybe",
    no: "declined",
    not_going: "declined",
    declined: "declined",
  })[responseChoice];
  const message = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId
    FROM messages WHERE id = ? AND content_type = 'event'
  `).get(Number(request.params.id));
  if (!isValidUser(userId) || !["going", "maybe", "declined"].includes(status)) return response.status(400).json({ error: "A valid userId and status (going, maybe, declined) are required." });
  if (!message || ![message.senderId, message.recipientId].includes(userId)) return response.status(404).json({ error: "Event not found in this account's chats." });
  database.prepare(`
    INSERT INTO event_rsvps (message_id, user_id, status, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(message_id, user_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
  `).run(message.id, userId, status, new Date().toISOString());
  emitUserChange([message.senderId, message.recipientId], "event", { messageId: message.id });
  const normalizedResponse = status === "going" ? "going" : status === "maybe" ? "interested" : "not_going";
  response.json({ messageId: message.id, status, response: normalizedResponse });
});

app.post("/api/chats/:contactId/read", (request, response) => {
  const { userId } = request.body;
  const peerId = request.params.contactId;
  if (!isValidUser(userId) || !isValidUser(peerId) || userId === peerId) return response.status(400).json({ error: "A valid account and contactId are required." });
  if (!isConnected(userId, peerId)) return response.status(403).json({ error: "Chat markers require an accepted connection." });
  const lastMessageId = database.prepare(`
    SELECT COALESCE(MAX(id), 0) AS id FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  `).get(userId, peerId, peerId, userId).id;
  const updatedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
  `).run(userId, peerId, lastMessageId, updatedAt);
  emitUserChange([userId, peerId], "read", { contactId: peerId });
  response.json({ contactId: peerId, lastReadMessageId: lastMessageId, updatedAt });
});

app.post("/api/messages/read-all", (request, response) => {
  const { userId } = request.body;
  if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
  const incoming = database.prepare(`
    SELECT sender_id AS peerId, MAX(id) AS lastReadMessageId
    FROM messages WHERE recipient_id = ? GROUP BY sender_id
  `).all(userId);
  const updatedAt = new Date().toISOString();
  for (const row of incoming) {
    database.prepare(`
      INSERT INTO chat_reads (user_id, peer_id, last_read_message_id, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, peer_id) DO UPDATE SET last_read_message_id = excluded.last_read_message_id, updated_at = excluded.updated_at
    `).run(userId, row.peerId, row.lastReadMessageId, updatedAt);
    emitUserChange([userId, row.peerId], "read", { contactId: row.peerId, lastReadMessageId: row.lastReadMessageId });
  }
  response.json({ markedRead: incoming.length, updatedAt });
});

app.put("/api/chats/:contactId/preferences", (request, response) => {
  const { userId, theme } = request.body;
  const peerId = request.params.contactId;
  if (!isValidUser(userId) || !isValidUser(peerId) || userId === peerId || !isConnected(userId, peerId)) {
    return response.status(403).json({ error: "Chat preferences require a valid accepted connection." });
  }
  const normalizedTheme = normalizeChatTheme(theme);
  if (!normalizedTheme) return response.status(400).json({ error: "theme must contain a supported bubble and wallpaper selection." });
  const updatedAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO chat_preferences (user_id, peer_id, theme_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, peer_id) DO UPDATE SET theme_json = excluded.theme_json, updated_at = excluded.updated_at
  `).run(userId, peerId, JSON.stringify(normalizedTheme), updatedAt);
  emitUserChange([userId], "chat-preferences", { contactId: peerId });
  response.json({ contactId: peerId, theme: normalizedTheme, updatedAt });
});

app.delete("/api/chats/:contactId", (request, response) => {
  const userId = request.body?.userId ?? request.query.userId;
  const peerId = request.params.contactId;
  if (!isValidUser(userId) || !isValidUser(peerId) || userId === peerId) {
    return response.status(400).json({ error: "A valid userId and different contactId are required." });
  }
  if (!isConnected(userId, peerId)) return response.status(403).json({ error: "Chat deletion requires an accepted connection." });
  const persistedActiveCall = database.prepare(`
    SELECT 1 FROM calls
    WHERE ((caller_id = ? AND recipient_id = ?) OR (caller_id = ? AND recipient_id = ?))
      AND status IN ('ringing', 'active')
  `).get(userId, peerId, peerId, userId);
  if (persistedActiveCall || [...activeCalls.values()].some((call) => [call.callerId, call.recipientId].includes(userId)
    && [call.callerId, call.recipientId].includes(peerId))) {
    return response.status(409).json({ error: "End the active call before deleting this conversation." });
  }
  const messages = database.prepare(`
    SELECT content_type AS kind, metadata_json AS payloadJson FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
  `).all(userId, peerId, peerId, userId);
  const mediaIds = [...new Set(messages.flatMap((message) => parseJson(message.payloadJson, {}).mediaIds ?? []))];
  const shareRows = database.prepare(`
    SELECT id, sender_id AS senderId, recipient_id AS recipientId FROM live_location_shares
    WHERE ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))
      AND revoked_at IS NULL
  `).all(userId, peerId, peerId, userId);
  const [userAId, userBId] = [userId, peerId].sort();
  let deletedMessages = 0;
  let deletedCalls = 0;
  const revokedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    deletedMessages = Number(database.prepare(`
      DELETE FROM messages
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    `).run(userId, peerId, peerId, userId).changes);
    deletedCalls = Number(database.prepare(`
      DELETE FROM calls
      WHERE (caller_id = ? AND recipient_id = ?) OR (caller_id = ? AND recipient_id = ?)
    `).run(userId, peerId, peerId, userId).changes);
    database.prepare("DELETE FROM chat_reads WHERE (user_id = ? AND peer_id = ?) OR (user_id = ? AND peer_id = ?)")
      .run(userId, peerId, peerId, userId);
    database.prepare("DELETE FROM chat_preferences WHERE (user_id = ? AND peer_id = ?) OR (user_id = ? AND peer_id = ?)")
      .run(userId, peerId, peerId, userId);
    database.prepare("DELETE FROM connection_requests WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)")
      .run(userId, peerId, peerId, userId);
    database.prepare("DELETE FROM connections WHERE user_a_id = ? AND user_b_id = ?").run(userAId, userBId);
    database.prepare(`
      UPDATE live_location_shares SET revoked_at = ?, latitude = NULL, longitude = NULL, accuracy = NULL
      WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    `).run(revokedAt, userId, peerId, peerId, userId);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  for (const share of shareRows) io.to(`user:${share.recipientId}`).emit("location:revoked", { id: share.id, senderId: share.senderId });
  for (const mediaId of mediaIds) {
    const owner = database.prepare("SELECT owner_id AS ownerId FROM media_files WHERE id = ?").get(mediaId);
    if (owner) cleanupMediaIfUnreferenced(mediaId, owner.ownerId);
  }
  emitConnectionChanged([userId, peerId]);
  response.json({ deleted: true, deletedMessages, deletedCalls, contactId: peerId });
});

app.delete("/api/calls", (request, response) => {
  const userId = request.body?.userId ?? request.query.userId;
  if (!isValidUser(userId)) return response.status(400).json({ error: "A valid userId is required." });
  const calls = database.prepare(`
    SELECT caller_id AS callerId, recipient_id AS recipientId
    FROM calls
    WHERE (caller_id = ? OR recipient_id = ?) AND status NOT IN ('ringing', 'active')
  `).all(userId, userId);
  const removed = database.prepare(`
    DELETE FROM calls
    WHERE (caller_id = ? OR recipient_id = ?) AND status NOT IN ('ringing', 'active')
  `).run(userId, userId);
  if (removed.changes > 0) emitUserChange(calls.flatMap((call) => [call.callerId, call.recipientId]), "call-deleted");
  response.json({ deletedCalls: Number(removed.changes) });
});

app.delete("/api/calls/:callId", (request, response) => {
  const userId = request.body?.userId ?? request.query.userId;
  const callId = Number(request.params.callId);
  if (!Number.isSafeInteger(callId) || callId < 1 || !isValidUser(userId)) {
    return response.status(400).json({ error: "A valid callId and userId are required." });
  }
  const call = database.prepare(`
    SELECT caller_id AS callerId, recipient_id AS recipientId, status
    FROM calls WHERE id = ?
  `).get(callId);
  if (!call || ![call.callerId, call.recipientId].includes(userId)) {
    return response.status(404).json({ error: "Call history entry not found for this account." });
  }
  if (call.status === "ringing" || call.status === "active") {
    return response.status(409).json({ error: "An active call cannot be deleted from call history." });
  }
  const removed = database.prepare("DELETE FROM calls WHERE id = ?").run(callId);
  if (removed.changes > 0) emitUserChange([call.callerId, call.recipientId], "call-deleted", { callId });
  response.json({ deleted: removed.changes > 0 });
});

app.get("/api/storage", (_request, response) => response.json(getStorageInfo()));

app.delete("/api/storage", (_request, response) => {
  for (const call of [...activeCalls.values()]) finishCall(call.id, "failed");
  const messagePayloads = database.prepare("SELECT content_type AS kind, metadata_json AS payloadJson FROM messages WHERE metadata_json IS NOT NULL").all();
  const mediaIds = messagePayloads.flatMap((message) => parseJson(message.payloadJson, {}).mediaIds ?? []);
  const locationShareIds = messagePayloads
    .filter((message) => message.kind === "location")
    .map((message) => parseJson(message.payloadJson, {}).shareId)
    .filter(Boolean);
  database.exec("DELETE FROM messages; DELETE FROM chat_reads; DELETE FROM calls; DELETE FROM sqlite_sequence WHERE name IN ('messages', 'calls'); VACUUM;");
  for (const shareId of locationShareIds) {
    const share = database.prepare("SELECT sender_id AS senderId, recipient_id AS recipientId FROM live_location_shares WHERE id = ?").get(shareId);
    database.prepare("UPDATE live_location_shares SET revoked_at = ?, latitude = NULL, longitude = NULL, accuracy = NULL WHERE id = ? AND revoked_at IS NULL")
      .run(new Date().toISOString(), shareId);
    if (share) io.to(`user:${share.recipientId}`).emit("location:revoked", { id: shareId, senderId: share.senderId });
  }
  for (const mediaId of mediaIds) {
    const owner = database.prepare("SELECT owner_id AS ownerId FROM media_files WHERE id = ?").get(mediaId);
    if (owner) cleanupMediaIfUnreferenced(mediaId, owner.ownerId);
  }
  io.emit("data:changed", { type: "storage" });
  response.json({ cleared: true, storage: getStorageInfo() });
});

io.on("connection", (socket) => {
  const userId = typeof socket.handshake.query.userId === "string" ? socket.handshake.query.userId : "";
  if (!userById.get(userId)) {
    socket.disconnect(true);
    return;
  }

  const sockets = activeSockets.get(userId) ?? new Set();
  sockets.add(socket.id);
  activeSockets.set(userId, sockets);
  socket.data.userId = userId;
  socket.join(`user:${userId}`);
  io.emit("presence:changed");
  for (const call of activeCalls.values()) {
    if (call.recipientId === userId) deliverIncomingCall(call);
  }

  socket.on("chat:typing", (payload) => {
    const recipientId = typeof payload?.recipientId === "string" ? payload.recipientId : "";
    if (typeof payload?.typing !== "boolean" || !recipientId || recipientId === userId
      || !userById.get(recipientId) || !isConnected(userId, recipientId)) return;
    socket.to(`user:${recipientId}`).emit("chat:typing", {
      senderId: userId,
      recipientId,
      typing: payload.typing,
    });
  });

  socket.on("call:start", (payload, acknowledge) => {
    const recipientId = typeof payload?.recipientId === "string" ? payload.recipientId : "";
    const kind = payload?.kind;
    if (!["voice", "video"].includes(kind) || !recipientId || recipientId === userId || !userById.get(recipientId)) {
      acknowledge?.({ error: "Choose a valid connected account and call type." });
      return;
    }
    if (!isConnected(userId, recipientId)) {
      acknowledge?.({ error: "Accept this account's connection request before calling." });
      return;
    }
    const busy = [...activeCalls.values()].some((call) =>
      [call.callerId, call.recipientId].includes(userId) || [call.callerId, call.recipientId].includes(recipientId));
    if (busy) {
      acknowledge?.({ error: "One of these accounts is already on a call." });
      return;
    }

    const createdAt = new Date().toISOString();
    const insert = database.prepare(`
      INSERT INTO calls (caller_id, recipient_id, kind, created_at, status)
      VALUES (?, ?, ?, ?, 'ringing')
    `).run(userId, recipientId, kind, createdAt);
    const call = {
      id: String(insert.lastInsertRowid),
      databaseId: Number(insert.lastInsertRowid),
      callerId: userId,
      recipientId,
      kind,
      status: "ringing",
      acceptedAt: null,
      callerReady: false,
      incomingNotified: false,
      deadlineAt: Date.now() + ringTimeoutMs,
      timeout: null,
    };
    call.timeout = setTimeout(() => finishCall(call.id, "missed"), ringTimeoutMs);
    activeCalls.set(call.id, call);
    acknowledge?.({ callId: call.id, createdAt, kind, status: "ringing" });
    emitCallDataChanged(call);
  });

  socket.on("call:ready", (payload, acknowledge) => {
    const call = activeCalls.get(String(payload?.callId ?? ""));
    if (!call || call.callerId !== userId || call.status !== "ringing") {
      acknowledge?.({ error: "This call is no longer available." });
      return;
    }
    call.callerReady = true;
    deliverIncomingCall(call);
    acknowledge?.({ ready: true });
  });

  socket.on("call:accept", (payload, acknowledge) => {
    const call = activeCalls.get(String(payload?.callId ?? ""));
    if (!call || call.recipientId !== userId || call.status !== "ringing") {
      acknowledge?.({ error: "This call is no longer available." });
      return;
    }
    call.status = "active";
    call.acceptedAt = Date.now();
    clearTimeout(call.timeout);
    database.prepare("UPDATE calls SET status = 'active', accepted_at = ? WHERE id = ?").run(
      new Date(call.acceptedAt).toISOString(),
      call.databaseId,
    );
    io.to(`user:${call.callerId}`).emit("call:accepted", { callId: call.id });
    acknowledge?.({ accepted: true });
    emitCallDataChanged(call);
  });

  socket.on("call:decline", (payload) => {
    const call = activeCalls.get(String(payload?.callId ?? ""));
    if (call?.recipientId === userId && call.status === "ringing") finishCall(call.id, "missed");
  });

  socket.on("call:end", (payload) => {
    const call = activeCalls.get(String(payload?.callId ?? ""));
    if (!call || ![call.callerId, call.recipientId].includes(userId)) return;
    const requestedStatus = payload?.status;
    const status = requestedStatus === "failed" ? "failed" : call.status === "ringing" ? "missed" : "completed";
    finishCall(call.id, status);
  });

  socket.on("call:signal", (payload, acknowledge) => {
    const call = activeCalls.get(String(payload?.callId ?? ""));
    const toUserId = typeof payload?.toUserId === "string" ? payload.toUserId : "";
    if (!call || call.status !== "active" || ![call.callerId, call.recipientId].includes(userId)) {
      acknowledge?.({ error: "This call is no longer active." });
      return;
    }
    const expectedRecipient = userId === call.callerId ? call.recipientId : call.callerId;
    if (toUserId !== expectedRecipient || (!payload?.description && !payload?.candidate)) {
      acknowledge?.({ error: "Invalid call signal." });
      return;
    }
    io.to(`user:${toUserId}`).emit("call:signal", {
      callId: call.id,
      fromUserId: userId,
      description: payload.description,
      candidate: payload.candidate,
    });
    acknowledge?.({ delivered: true });
  });

  socket.on("disconnect", () => {
    const userSockets = activeSockets.get(userId);
    userSockets?.delete(socket.id);
    if (userSockets?.size === 0) {
      activeSockets.delete(userId);
      for (const call of [...activeCalls.values()]) {
        if (call.recipientId === userId && call.status === "ringing") {
          call.incomingNotified = false;
          continue;
        }
        if (call.callerId === userId && call.status === "ringing") {
          finishCall(call.id, "missed");
          continue;
        }
        if ([call.callerId, call.recipientId].includes(userId)) finishCall(call.id, "completed");
      }
    }
    io.emit("presence:changed");
  });
});

app.use((error, request, response, _next) => {
  console.error("Local API error:", error);
  if (!response.headersSent) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    const message = status === 413
      ? request.path === "/api/media" ? "Media uploads are limited to 25 MB." : "The request exceeds the server body limit."
      : status === 400
        ? "The request body is invalid."
        : "The local API could not complete the request.";
    response.status(status).json({ error: message });
  }
});

const listenHost = lanHost || "127.0.0.1";
httpServer.listen(port, listenHost, () => {
  console.log(`INChat local API listening at http://${listenHost}:${port}`);
  console.log(`SQLite database: ${databasePath}`);
});
