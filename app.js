// app.js
// Entry point. Connects to Highrise, wires up events, and dispatches
// chat commands defined in commands.js.

import "dotenv/config";
import { Highrise, Events } from "highrise.sdk.dev";
import * as hr from "./highriseClient.js";
import adminStore from "./adminStore.js";
import { commands, parseCommand } from "./commands.js";

const BOT_TOKEN = process.env.HIGHRISE_BOT_TOKEN;
const ROOM_ID = process.env.HIGHRISE_ROOM_ID;
const WELCOME_MESSAGE =
  process.env.WELCOME_MESSAGE ?? "Welcome to the room, {username}! Type !help to see what I can do.";

if (!BOT_TOKEN || !ROOM_ID) {
  console.error(
    "Missing HIGHRISE_BOT_TOKEN or HIGHRISE_ROOM_ID environment variables.\n" +
      "Create a .env file (see .env.example) or set these in your Railway project's Variables tab."
  );
  process.exit(1);
}

// In-memory cache of users currently known to be in the room, keyed by
// lowercase username, so commands can resolve "@username" -> user id.
// This is rebuilt as join/leave/chat events come in, since relying on the
// SDK's cache/getRoomUsers support varies by version.
const userCache = new Map();

function cacheUser(user, position) {
  if (!user || !user.username) return;
  const existing = userCache.get(user.username.toLowerCase()) ?? {};
  userCache.set(user.username.toLowerCase(), {
    id: user.id,
    username: user.username,
    position: position ?? existing.position,
  });
}

const bot = new Highrise({
  Events: [
    Events.Joins,
    Events.Leaves,
    Events.Messages,
    Events.Movements,
    Events.Error,
  ],
  Cache: true,
});

bot.on("ready", (session) => {
  console.log(`[app] Bot connected. Room: ${session?.room_info?.room_name ?? ROOM_ID}`);
  console.log(`[app] Owner (permanent admin): ${adminStore.OWNER_ID}`);
});

bot.on("error", (err) => {
  console.error("[app] Bot error event:", err);
});

bot.on("playerJoin", async (user, position) => {
  cacheUser(user, position);
  console.log(`[app] ${user.username} (${user.id}) joined the room.`);
  try {
    const text = WELCOME_MESSAGE.replace("{username}", user.username);
    await hr.sendMessage(bot, text);
  } catch (err) {
    console.error("[app] Failed to send welcome message:", err.message);
  }
});

bot.on("playerLeave", (user) => {
  if (user?.username) {
    userCache.delete(user.username.toLowerCase());
  }
  console.log(`[app] ${user?.username ?? user?.id} left the room.`);
});

// Best-effort: if the SDK emits movement/position updates, keep the cache
// fresh so "!tp <user>" (no coordinates) can teleport them to your position.
bot.on("playerMove", (user, position) => {
  cacheUser(user, position);
});

bot.on("chatCreate", async (user, message) => {
  if (!user || user.id === undefined) return;
  cacheUser(user);

  const parsed = parseCommand(message);
  if (!parsed) return;

  const command = commands[parsed.name];
  if (!command) return;

  const isOwner = adminStore.isOwner(user.id);
  const isAdmin = adminStore.isAdmin(user.id);

  if (command.ownerOnly && !isOwner) {
    await safeReply(bot, "Only the bot owner can use that command.");
    return;
  }
  if (command.adminOnly && !isAdmin) {
    await safeReply(bot, "Only admins can use that command.");
    return;
  }

  const ctx = {
    bot,
    user,
    args: parsed.args,
    isOwner,
    isAdmin,
    userCache,
    reply: (text) => safeReply(bot, text),
  };

  try {
    await command.execute(ctx);
  } catch (err) {
    console.error(`[app] Command "${parsed.name}" threw:`, err);
    await safeReply(bot, "Something went wrong running that command — check the bot logs.");
  }
});

async function safeReply(botInstance, text) {
  try {
    await hr.sendMessage(botInstance, text);
  } catch (err) {
    console.error("[app] Failed to send chat message:", err.message);
  }
}

async function main() {
  console.log("[app] Connecting to Highrise...");
  await bot.login(BOT_TOKEN, ROOM_ID);
}

main().catch((err) => {
  console.error("[app] Fatal startup error:", err);
  process.exit(1);
});

process.on("unhandledRejection", (err) => {
  console.error("[app] Unhandled rejection:", err);
});
process.on("uncaughtException", (err) => {
  console.error("[app] Uncaught exception:", err);
});
