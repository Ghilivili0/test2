// adminStore.js
// Persistent admin storage backed by a JSON file on disk.
//
// IMPORTANT (Railway): Railway's default filesystem is ephemeral — a redeploy
// or restart can wipe local files. If you need admins to survive redeploys,
// attach a Railway "Volume" to this service and point ADMIN_STORE_PATH (see
// .env.example) at a file inside that volume's mount path, e.g.
//   ADMIN_STORE_PATH=/data/admins.json
// If you don't attach a volume, the store still works fine between bot
// restarts that don't wipe the container, it just isn't guaranteed to
// survive a fresh deploy.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The permanent owner. The owner is always an admin, cannot be removed,
// and is the only one allowed to add/remove other admins.
export const OWNER_ID = "18.16.89";

const DEFAULT_STORE_PATH = path.join(__dirname, "data", "admins.json");
const STORE_PATH = process.env.ADMIN_STORE_PATH
  ? path.resolve(process.env.ADMIN_STORE_PATH)
  : DEFAULT_STORE_PATH;

function ensureStoreFile() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial = { admins: [] };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function readStore() {
  ensureStoreFile();
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.admins)) {
      return { admins: [] };
    }
    return parsed;
  } catch (err) {
    console.error(`[adminStore] Failed to read store, resetting. Reason: ${err.message}`);
    return { admins: [] };
  }
}

function writeStore(store) {
  ensureStoreFile();
  // Write atomically: write to a temp file then rename, to avoid corrupting
  // the store if the process is killed mid-write.
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), "utf-8");
  fs.renameSync(tmpPath, STORE_PATH);
}

/**
 * Returns true if the given id is the hardcoded owner.
 */
export function isOwner(id) {
  return String(id) === OWNER_ID;
}

/**
 * Returns true if the given id is the owner OR a stored admin.
 */
export function isAdmin(id) {
  if (isOwner(id)) return true;
  const store = readStore();
  return store.admins.some((a) => a.id === String(id));
}

/**
 * Returns the full admin list, including a synthetic entry for the owner.
 */
export function listAdmins() {
  const store = readStore();
  const owner = {
    id: OWNER_ID,
    username: "Owner",
    addedBy: "system",
    addedAt: null,
    isOwner: true,
  };
  return [owner, ...store.admins];
}

/**
 * Adds a new admin. Returns { ok, reason? }.
 */
export function addAdmin(id, username, addedBy) {
  id = String(id);
  if (isOwner(id)) {
    return { ok: false, reason: "That user is already the owner." };
  }
  const store = readStore();
  if (store.admins.some((a) => a.id === id)) {
    return { ok: false, reason: "That user is already an admin." };
  }
  store.admins.push({
    id,
    username: username ?? id,
    addedBy: String(addedBy),
    addedAt: new Date().toISOString(),
  });
  writeStore(store);
  return { ok: true };
}

/**
 * Removes an admin by id or username. Owner can never be removed.
 * Returns { ok, reason? }.
 */
export function removeAdmin(idOrUsername) {
  if (isOwner(idOrUsername)) {
    return { ok: false, reason: "The owner cannot be removed." };
  }
  const store = readStore();
  const before = store.admins.length;
  store.admins = store.admins.filter(
    (a) =>
      a.id !== String(idOrUsername) &&
      a.username.toLowerCase() !== String(idOrUsername).toLowerCase()
  );
  if (store.admins.length === before) {
    return { ok: false, reason: "That user was not found in the admin list." };
  }
  writeStore(store);
  return { ok: true };
}

export default {
  OWNER_ID,
  isOwner,
  isAdmin,
  listAdmins,
  addAdmin,
  removeAdmin,
};
