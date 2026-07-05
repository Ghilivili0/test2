// highriseClient.js
//
// The Highrise JavaScript SDK ecosystem is community-built, still in beta,
// and its exact method names have shifted between versions (see the
// project's README/changelog). To keep this bot working even if you're on a
// slightly different SDK version than the one this was written against,
// every outbound action (send chat, whisper, emote, teleport, get users) is
// resolved by trying a short list of known method-name candidates on the
// `bot` object, in order, until one exists and succeeds.
//
// If NONE of the candidates match your installed SDK version, this throws a
// clear error telling you exactly what to fix. In that case, open the
// installed package's README (node_modules/highrise.sdk.dev/README.md) or
// its docs, find the correct method name, and add it to the relevant
// candidates array below — the rest of the bot (commands.js, app.js) never
// needs to change.

function getByPath(obj, dottedPath) {
  return dottedPath.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function getParentAndFn(obj, dottedPath) {
  const parts = dottedPath.split(".");
  const fnName = parts.pop();
  const parent = parts.length ? getByPath(obj, parts.join(".")) : obj;
  const fn = parent ? parent[fnName] : undefined;
  return { parent, fn };
}

async function tryCandidates(bot, candidates, args, label) {
  const errors = [];
  for (const candidatePath of candidates) {
    const { parent, fn } = getParentAndFn(bot, candidatePath);
    if (typeof fn === "function") {
      try {
        return await fn.apply(parent, args);
      } catch (err) {
        errors.push(`${candidatePath} -> ${err.message}`);
      }
    }
  }
  throw new Error(
    `[highriseClient] Could not perform "${label}". None of these methods ` +
      `exist (or all failed) on the installed SDK: ${candidates.join(", ")}. ` +
      `Check node_modules/highrise.sdk.dev for the correct method name and ` +
      `add it to the candidates list in highriseClient.js.` +
      (errors.length ? ` Attempts: ${errors.join(" | ")}` : "")
  );
}

/**
 * Sends a public chat message to the room.
 */
export async function sendMessage(bot, text) {
  return tryCandidates(
    bot,
    ["message.send", "chat", "sendMessage", "messages.send", "sendChat"],
    [text],
    "send chat message"
  );
}

/**
 * Sends a whisper/direct message to a specific user in the room.
 */
export async function sendWhisper(bot, userId, text) {
  return tryCandidates(
    bot,
    ["message.sendWhisper", "sendWhisper", "whisper", "messages.sendWhisper"],
    [userId, text],
    "send whisper"
  );
}

/**
 * Plays an emote. If userId is omitted, plays it on the bot itself.
 */
export async function sendEmote(bot, emoteId, userId) {
  return tryCandidates(
    bot,
    ["emote.send", "sendEmote", "player.emote", "emotes.send"],
    userId ? [emoteId, userId] : [emoteId],
    "send emote"
  );
}

/**
 * Teleports a user to a position { x, y, z, facing? } within the current room.
 */
export async function teleportUser(bot, userId, position) {
  return tryCandidates(
    bot,
    ["teleport", "player.teleport", "moveUser", "moderate.teleport"],
    [userId, position],
    "teleport user"
  );
}

/**
 * Returns the list of users currently in the room, if the SDK supports it.
 * Falls back to an internally tracked room-user cache if not.
 */
export async function getRoomUsers(bot) {
  return tryCandidates(
    bot,
    ["room.getUsers", "getRoomUsers", "users.list", "room.users"],
    [],
    "get room users"
  );
}

export default {
  sendMessage,
  sendWhisper,
  sendEmote,
  teleportUser,
  getRoomUsers,
};
