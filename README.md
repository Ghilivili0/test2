# Highrise Admin Bot

A Highrise room bot with:

- Welcome messages for new users
- A persistent (file-backed) admin system, with a permanent owner
- Dance commands
- A teleport command
- `!help` and `!admins` commands
- Ready to deploy on Railway

## Files

| File | Purpose |
|---|---|
| `package.json` | Dependencies and start script |
| `app.js` | Entry point — connects to Highrise, wires up events, dispatches commands |
| `commands.js` | All chat command definitions (`!help`, `!dance`, `!tp`, etc.) |
| `adminStore.js` | Persistent JSON-backed admin storage + the hardcoded owner |
| `highriseClient.js` | Thin adapter around the Highrise SDK's outbound actions |
| `data/admins.json` | The admin list data file (auto-created if missing) |
| `.env.example` | Template for required environment variables |
| `railway.json` | Railway deploy config |

## 1. Get your bot token and room ID

1. On the Highrise website, go to **Settings > Bots** and create a bot. Copy its **API token**.
2. In the Highrise app, open the room you want the bot in, open the room info panel, and choose **Share this Room** to get the **room ID**.
3. Make sure the bot account has **designer rights** in that room (bots can only join rooms they're allowed to edit).

## 2. Install dependencies

```bash
npm install
```

This installs `highrise.sdk.dev` (a community-maintained JavaScript SDK for the Highrise Bot API — the SDK is still labeled "beta" by its author, so keep an eye on its changelog) and `dotenv`.

## 3. Configure environment variables

Copy the example file:

```bash
cp .env.example .env
```

Then edit `.env`:

```
HIGHRISE_BOT_TOKEN=your-bot-token-here
HIGHRISE_ROOM_ID=your-room-id-here
```

## 4. Run it locally

```bash
npm start
```

You should see:

```
[app] Connecting to Highrise...
[app] Bot connected. Room: <your room name>
[app] Owner (permanent admin): 18.16.89
```

## 5. Owner and admin system

- The **owner** is hardcoded in `adminStore.js` as `OWNER_ID = "18.16.89"`. The owner is always treated as an admin, can never be removed, and is the only one who can add/remove other admins.
- Admins are stored in `data/admins.json` and persist across bot restarts.
- Commands:
  - `!admins` — anyone can list current admins
  - `!addadmin <username>` — owner only
  - `!removeadmin <username>` — owner only

**Railway note:** Railway's default filesystem is ephemeral — files can be wiped on redeploy. If you want the admin list to survive redeploys, attach a [Railway Volume](https://docs.railway.com/reference/volumes) to the service and set `ADMIN_STORE_PATH` (in your Railway Variables) to a path inside that volume, e.g. `/data/admins.json`.

## 6. Commands

| Command | Who | Description |
|---|---|---|
| `!help` | everyone | Lists commands available to you |
| `!admins` | everyone | Lists the owner and all admins |
| `!addadmin <username>` | owner | Grants admin rights |
| `!removeadmin <username>` | owner | Revokes admin rights |
| `!dance <name> [@username]` | admins | Plays a dance emote, optionally on a mentioned user |
| `!dances` | everyone | Lists available dance names |
| `!tp <username> [x y z]` | admins | Teleports a user to coordinates, or to you if coordinates are omitted |

Dance names are defined in `commands.js` under `DANCE_EMOTES`. Highrise's emote catalog changes over time and not every bot account owns every emote, so if a dance doesn't play, open `commands.js` and swap in an emote ID your bot actually owns (check the bot's in-game inventory).

## 7. About the SDK adapter (`highriseClient.js`)

The Highrise JavaScript SDK ecosystem is community-built and has changed method names between versions. Rather than hardcode one exact method name for actions like "send chat message" or "teleport" and risk it silently not matching your installed version, `highriseClient.js` tries a short list of known candidate method names on the `bot` object until one works. If your installed SDK version doesn't match any candidate, you'll get a clear console error telling you which action failed — open `node_modules/highrise.sdk.dev/README.md` (or its docs, linked from the [Highrise Create forum](https://createforum.highrise.game)) for the current method name and add it to the relevant array in `highriseClient.js`. No other file needs to change.

## 8. Deploying to Railway

1. Push this project to a GitHub repository.
2. In Railway, choose **New Project > Deploy from GitHub repo** and select the repo.
3. Railway will detect `package.json` and use Nixpacks to build it automatically (`railway.json` pins the start command to `npm start`).
4. In the service's **Variables** tab, add:
   - `HIGHRISE_BOT_TOKEN`
   - `HIGHRISE_ROOM_ID`
   - (optional) `WELCOME_MESSAGE`
   - (optional) `ADMIN_STORE_PATH` if you've attached a Volume
5. Deploy. Check the **Deployments > Logs** tab for `[app] Bot connected.`

## 9. Extending

- Add new commands by adding an entry to the `commands` object in `commands.js` — `!help` picks up new commands automatically.
- Add new outbound Highrise actions by adding a new function to `highriseClient.js` following the existing `tryCandidates` pattern.
