# UKCR Tracker

A progress-tracker website for Cloudflare Pages: public pages, an admin editor (`#admin`),
a contact form, an on/off switch, and optional Discord slash commands.
No visitor tracking: no visit logs, no IP/location/device logging, no analytics.

## Folder layout (must stay exactly like this)

```
index.html
README.md
functions/
  _middleware.js        site on/off + maintenance page
  api/
    contact.js          contact form -> Discord
    data.js             saves/loads the site content
    discord.js          Discord slash-command endpoint
    health.js           setup check
    register.js         registers the Discord slash commands
    site.js             on/off switch
    upload.js           admin image upload
    uptime.js           UptimeRobot uptime numbers
    img/[id].js         serves uploaded images
```

`functions/` must be at the top level of the repo, and `img/[id].js` keeps its square brackets.

## Deploy

1. Upload everything to your GitHub repo (keep the `functions` folder structure).
2. Cloudflare Pages: Build command = empty, Build output directory = `/` (or empty). Framework = None.
3. Settings > Bindings: add a **KV namespace** binding named exactly `TRACKER`.
4. Settings > Variables and Secrets (Production): add the values below.
5. Redeploy, then open `/api/health`. It should say `ok`.

## Variables / secrets

| Name | Needed? | What it is |
|---|---|---|
| `ADMIN_PASSWORD` | Required | Password for the Edit/admin page |
| `DISCORD_CONTACT_WEBHOOK` | For contact form | Discord webhook that receives contact messages |
| `DISCORD_WEBHOOK` | Optional (recommended) | Admin alerts (login, edits, on/off) plus automatic JSON backups. Use a PRIVATE channel. Visitors are never logged |
| `DISCORD_PUBLIC_KEY` | For slash commands | Discord app > General Information > Public Key |
| `DISCORD_ADMIN_IDS` | For slash commands | Comma-separated Discord user IDs allowed to use commands |
| `DISCORD_APP_ID` | For registering commands | Discord Application ID |
| `DISCORD_BOT_TOKEN` | For registering commands | Discord bot token |
| `DISCORD_GUILD_ID` | Optional | Your server ID (commands appear instantly) |
| `UPTIMEROBOT_KEY` | Optional | UptimeRobot READ-ONLY API key |
| `UPTIMEROBOT_MONITOR_ID` | Optional | Which monitor to show |

## Discord slash commands (optional)

1. Discord Developer Portal > your app > set **Interactions Endpoint URL** to `https://YOUR-SITE.pages.dev/api/discord`.
2. Open `https://YOUR-SITE.pages.dev/api/discord` in a browser to check the setup.
3. Log in to the admin page and press the register-commands button (or POST to `/api/register` with the `x-admin-password` header).
4. Commands: `/site on|off|status`, `/weeks`, `/week`, `/progress`, `/archive`, `/addweek`.

## Privacy note

The only use of an IP address is a salted, one-way hash used as a short-lived key (15 minutes for admin
login attempts, 60 seconds for the contact form) to block password guessing and spam. The real IP is never stored, shown or sent anywhere.

## Your content is safe across updates

Everything you type in the admin panel (weeks, tasks, About text, settings) is stored in Cloudflare KV
(`TRACKER`), **not** in the site files, so uploading new files does not erase it.

- The last 10 previous versions are kept automatically each time you press Save & publish.
  Admin panel > Dashboard > Backup & restore > "Show saved versions" > Restore, then Save & publish.
- If the site can't load your saved content, it shows a red warning bar and **blocks saving**, so
  placeholder text can never overwrite your real data.
- Still use "Download backup" before big changes.

## Troubleshooting

**`/api/data` or `/api/health` shows 404**: Cloudflare isn't running the backend. Check on GitHub that there is a
folder called `functions` at the top of the repo (next to `index.html`) containing `_middleware.js` and an `api`
folder. Files sitting loose in the repo root (e.g. a lone `data.js`) do nothing. Fix the structure, commit, wait for the deploy.

**`/api/health` says PROBLEM: the TRACKER KV binding is missing**: add the KV binding named `TRACKER` (Settings > Bindings), then redeploy.

**Red warning bar in the admin panel**: your saved data is NOT deleted; the site just can't reach it. Fix the
binding/functions problem above, reload, and the bar disappears.

## Features added in this version

- **Progress chart** on the Home page (one point per day; built on the server, appears after 2+ days of saves).
- **Task due dates** (admin > Weeks > date box next to each task): shows "Due" / "Overdue" on the week page and an alert on the dashboard.
- **Search** box on Home and All Weeks (weeks, tasks, notes).
- **Copy as text** and **Print** buttons on each week page; "Copy text" also in the admin week editor.
- **Auto-backup to Discord** after saves (at most every 5 minutes) and a "Send backup to Discord" button (Controls tab). Needs `DISCORD_WEBHOOK`.
- **Saved versions** (last 10) and a red warning bar + save block if the saved content can't be loaded.
- Dashboard shows "last published" time, a tab-title dot (●) while you have unsaved changes, and extra System checks
  (Backend functions, Saved content).
- Friendlier empty states (no weeks, no tasks, no notes, no About text, no images).
