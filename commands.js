// commands.js
// All chat-triggered bot commands live here. Each command receives a `ctx`
// object (built in app.js) and returns nothing — it replies by calling
// ctx.reply(...) itself.

import * as hr from "./highriseClient.js";
import adminStore from "./adminStore.js";

export const PREFIX = "!";

// ---------------------------------------------------------------------------
// Emotes available to the !dance command.
//
// Emote IDs below are common, widely-referenced Highrise dance emote IDs.
// Highrise periodically adds/renames catalog items, and not every account
// or room has every emote unlocked, so if one of these doesn't play for
// your bot, swap in an ID you know your bot owns (check the bot account's
// inventory in-game, or via the SDK's inventory/webapi helpers) — you do
// not need to touch any other file, just edit this object.
// ---------------------------------------------------------------------------
export const DANCE_EMOTES = {
  tiktok: "dance-tiktok9",
  shuffle: "dance-shuffle",
  macarena: "dance-macarena",
  wave: "emote-wave",
  weird: "dance-weird",
  russian: "dance-russian",
  orangejustice: "dance-orangejustice",
};

function isValidUsername(text) {
  return typeof text === "string" && text.trim().length > 0;
}

function resolveTargetUser(ctx, nameArg) {
  if (!nameArg) return null;
  const clean = nameArg.replace(/^@/, "").toLowerCase();
  return ctx.userCache.get(clean) ?? null;
}

function parsePosition(parts) {
  // Accepts "x y z" or "x y z facing"
  if (parts.length < 3) return null;
  const [x, y, z, facing] = parts.map((p) => parseFloat(p));
  if ([x, y, z].some((n) => Number.isNaN(n))) return null;
  return facing ? { x, y, z, facing } : { x, y, z };
}

export const commands = {
  help: {
    description: "Shows this list of commands.",
    usage: "!help",
    async execute(ctx) {
      const lines = ["Available commands:"];
      for (const [name, cmd] of Object.entries(commands)) {
        if (cmd.ownerOnly && !ctx.isOwner) continue;
        if (cmd.adminOnly && !ctx.isAdmin) continue;
        lines.push(`${cmd.usage} — ${cmd.description}`);
      }
      await ctx.reply(lines.join("\n"));
    },
  },

  admins: {
    description: "Lists the bot owner and all current admins.",
    usage: "!admins",
    async execute(ctx) {
      const admins = adminStore.listAdmins();
      const lines = admins.map((a) =>
        a.isOwner ? `👑 ${a.username} (owner, ${a.id})` : `🛡️ ${a.username} (${a.id})`
      );
      await ctx.reply(["Admins:", ...lines].join("\n"));
    },
  },

  addadmin: {
    description: "Grants admin permissions to a user. Owner only.",
    usage: "!addadmin <username>",
    ownerOnly: true,
    async execute(ctx) {
      const targetName = ctx.args[0];
      if (!isValidUsername(targetName)) {
        await ctx.reply("Usage: !addadmin <username>");
        return;
      }
      const target = resolveTargetUser(ctx, targetName);
      const targetId = target ? target.id : targetName;
      const result = adminStore.addAdmin(targetId, target ? target.username : targetName, ctx.user.id);
      await ctx.reply(result.ok ? `${targetName} is now an admin.` : `Could not add admin: ${result.reason}`);
    },
  },

  removeadmin: {
    description: "Revokes admin permissions from a user. Owner only.",
    usage: "!removeadmin <username>",
    ownerOnly: true,
    async execute(ctx) {
      const targetName = ctx.args[0];
      if (!isValidUsername(targetName)) {
        await ctx.reply("Usage: !removeadmin <username>");
        return;
      }
      const target = resolveTargetUser(ctx, targetName);
      const targetId = target ? target.id : targetName;
      const result = adminStore.removeAdmin(targetId);
      await ctx.reply(result.ok ? `${targetName} is no longer an admin.` : `Could not remove admin: ${result.reason}`);
    },
  },

  dance: {
    description: "Makes the bot (or a mentioned user) perform a dance. See !dances for options.",
    usage: "!dance <name> [@username]",
    adminOnly: true,
    async execute(ctx) {
      const [danceName, mentioned] = ctx.args;
      if (!danceName || !DANCE_EMOTES[danceName]) {
        await ctx.reply(
          `Usage: !dance <name> [@username]\nAvailable dances: ${Object.keys(DANCE_EMOTES).join(", ")}`
        );
        return;
      }
      const emoteId = DANCE_EMOTES[danceName];
      let targetId;
      if (mentioned) {
        const target = resolveTargetUser(ctx, mentioned);
        if (!target) {
          await ctx.reply(`I couldn't find "${mentioned}" in this room.`);
          return;
        }
        targetId = target.id;
      }
      try {
        await hr.sendEmote(ctx.bot, emoteId, targetId);
        await ctx.reply(`Dancing: ${danceName} 💃`);
      } catch (err) {
        console.error(err);
        await ctx.reply("I couldn't play that emote — see the bot logs for details.");
      }
    },
  },

  dances: {
    description: "Lists available dance names for !dance.",
    usage: "!dances",
    async execute(ctx) {
      await ctx.reply(`Available dances: ${Object.keys(DANCE_EMOTES).join(", ")}`);
    },
  },

  tp: {
    description: "Teleports a user to given coordinates, or to you.",
    usage: "!tp <username> [x y z] — omit coordinates to teleport them to you",
    adminOnly: true,
    async execute(ctx) {
      const [targetName, ...rest] = ctx.args;
      if (!isValidUsername(targetName)) {
        await ctx.reply("Usage: !tp <username> [x y z]");
        return;
      }
      const target = resolveTargetUser(ctx, targetName);
      if (!target) {
        await ctx.reply(`I couldn't find "${targetName}" in this room.`);
        return;
      }

      let destination;
      if (rest.length >= 3) {
        destination = parsePosition(rest);
        if (!destination) {
          await ctx.reply("Coordinates must be numbers: !tp <username> <x> <y> <z>");
          return;
        }
      } else {
        const me = ctx.userCache.get(ctx.user.username.toLowerCase());
        if (!me || !me.position) {
          await ctx.reply("I don't have your current position yet — try specifying coordinates instead: !tp <username> <x> <y> <z>");
          return;
        }
        destination = me.position;
      }

      try {
        await hr.teleportUser(ctx.bot, target.id, destination);
        await ctx.reply(`Teleported ${target.username}.`);
      } catch (err) {
        console.error(err);
        await ctx.reply("I couldn't teleport that user — see the bot logs for details.");
      }
    },
  },
};

/**
 * Parses a raw chat message into { name, args } if it starts with the
 * command prefix, otherwise returns null.
 */
export function parseCommand(rawText) {
  if (!rawText || !rawText.startsWith(PREFIX)) return null;
  const parts = rawText.trim().split(/\s+/);
  const name = parts[0].slice(PREFIX.length).toLowerCase();
  const args = parts.slice(1);
  return { name, args };
}

export default { commands, parseCommand, PREFIX, DANCE_EMOTES };
