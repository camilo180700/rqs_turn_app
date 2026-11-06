# RQ Rotation on Apps Script: setup guide

Do everything with your **company account**. The app lives inside the company Google Workspace: the sheet sits in the company Drive, only accounts from the company domain can open it, and every RQ is stamped with the email of the person who logged it.

Estimated time: 30 to 40 minutes the first time.

**Package files**

| File | What it is |
|---|---|
| `Code.gs` | Server: reads and writes the sheet; handles teams, turns and access |
| `Migration.gs` | Brings over the RQs from the Streamlit app, with a backup |
| `Index.html` | The interface, in the SBA Hub visual style (styles + logic) |
| `Brand.html` | Font and logo for the top bar (kept separate so the brand can change without touching the interface) |
| `appsscript.json` | Manifest: Bogotá time zone, web app limited to the domain |

---

## Upgrading to the multi-team version (already running app)

The app now holds every team (each with its senior manager, manager, rotation, clients and history) in **one sheet and one URL**.

1. Make a copy of the sheet first (File → Make a copy) as a backup.
2. In Apps Script, replace `Code.gs`, `Migration.gs` and `Index.html` with the new ones. `Brand.html` and `appsscript.json` don't change.
3. Run **`setup`** once. It creates the **`Teams`** tab with your current team (same order, same turn, same clients) and adds a `team` column to `RQs`, filling it in for every existing RQ. Nothing is deleted; the old `State` tab and the `client` rows in `Config` are simply no longer used.
4. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. Same URL, so any link or embed keeps working.
5. Open the app → your team → **✎ Team details** to give it its real name, senior manager and manager. Renaming moves its RQs to the new name.
6. Create the other teams with **＋ New team** (name, senior manager, manager, people in turn order, clients).

**`Teams` tab:** `team | senior_manager | manager | members | turn_index | clients | updated_by | updated_at`. `members` is comma-separated in turn order; `clients` is separated by `;`. It can be edited by hand, but the app is safer.

**How it looks:** the home page is **All teams**, grouped by senior manager, with filters by senior manager and manager and a search that also finds people. Each card shows who's up next. Clicking a team opens its own rotation, history and insights. The team picker at the top switches teams, and the app remembers the last team you opened. A direct link to a team: `<URL>?team=Team%20name`.

---

## Part 1 · Get the RQs out of Streamlit (backup)

The Streamlit app doesn't store anything on its own server. Everything is in a Google Sheet with two tabs, `historial` and `estado`. First, find that sheet.

1. Go to <https://share.streamlit.io> with the account that published the app.
2. On the app, open **⋮ → Settings → Secrets** and copy the value of `spreadsheet = "..."`. That is the sheet URL.
3. Open that URL with your **personal** account (the sheet's owner).
4. **Fixed backup:** File → Download → **Microsoft Excel (.xlsx)**. Keep that file: it's an exact snapshot of every RQ taken so far.
5. Bring the data into the company Drive (pick one):
   - **A (recommended):** with the company account, go to Google Drive → New → File upload → upload the `.xlsx`. Open it and choose File → **Save as Google Sheets**. Copy the URL of that new sheet.
   - **B:** share the original sheet with your company email as *Viewer*. This only works if the company allows opening files from outside accounts.

> Do this right after the last RQ taken in Streamlit, and ask the team not to log anything while you migrate (about 10 minutes).

## Part 2 · Create the app in the company account

1. With the company account: Google Drive → New → **Google Sheets**. Name it, for example, `RQ Rotation – <team>`.
2. In the sheet: **Extensions → Apps Script**. The editor opens. Rename the project at the top left (e.g. `RQ Rotation`).
3. In the existing `Code.gs` file, delete everything and paste the contents of **`Code.gs`**.
4. **+ → Script** → name it `Migration` → paste **`Migration.gs`**.
5. **+ → HTML** → name it exactly `Index` → paste **`Index.html`**. Repeat with another HTML file named exactly `Brand` → paste **`Brand.html`**.
6. ⚙️ **Project Settings** → turn on *Show "appsscript.json" manifest file in editor*. Back in the editor, open `appsscript.json` and replace it with the one from the package.
7. Save (Ctrl+S). In the function picker at the top, choose **`setup`** → **Run**. Accept the permissions it asks for (sheet, Drive for the backup, your email).
8. Go back to the sheet: it now has three new tabs, `Teams`, `RQs` and `Config`.

## Part 3 · Migrate the RQs

1. Reload the sheet. An **RQ Rotation** menu appears.
2. **RQ Rotation → Migrate from the Streamlit app…** → paste the URL from Part 1, step 5.
3. A **preview** shows how many RQs were found, the date range, the rotation order and whose turn it is. If it all looks right, click **Yes**.
4. When it finishes, it gives you a link to a backup copy in your Drive.
5. Check the `RQs` tab: each row has a full date, `created_by = migrated` and `source = streamlit`.

**About dates:** Streamlit saved dates like "29 oct 10:15", with no year. The migration works out the year by going from the newest row to the oldest and subtracting a year whenever the month "goes up" (e.g. Jan → Dec). If the app ran for more than 12 months straight with a month that had no RQs in between, double-check the oldest dates.

The RQs go to the first team in `Teams`. If a client from the history wasn't on that team's list, it's added automatically. If something goes wrong, delete the rows in `RQs` and run it again; the old sheet is never modified.

## Part 4 · Configure and publish

1. **`Config`** tab (`key` / `value` columns):
   - `title`, `subtitle`: what shows at the top of the app.
   - `allowed_domain`: the company domain, e.g. `company.com`. Blocks any outside account.
   - `priority` rows: one per row, shared by every team.
   - Teams, people and clients are managed from the app (**＋ New team**, **Manage people**, **Manage clients**, **Team details**) and stored in the `Teams` tab.
2. In the Apps Script editor: **Deploy → New deployment** → type **Web app**.
   - Description: `v1`
   - Execute as: **Me** (your company email)
   - Who has access: **Anyone within <your domain>**
3. **Deploy** → copy the **Web app URL**. That's the new app; share it with the team.
4. The team does **not** need access to the sheet: the app writes with your permissions. Only give edit access to the sheet to whoever will maintain it.

## Part 5 · Shut down Streamlit

1. Once the team is using the new URL: on share.streamlit.io → the app → **⋮ → Delete** (or at least remove the *Secrets* so it can't write to the old sheet anymore).
2. Keep the `.xlsx` backup in the company Drive next to the new sheet.

## Future code changes

Edit in the editor → Save → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same. (To test without publishing: *Deploy → Test deployments*.)

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "This app is only for @… accounts" | You're signed in with another account. Open the URL in a Chrome profile signed in with the company email. |
| The "Anyone within <domain>" option doesn't appear | The Workspace admin restricts web apps. Ask IT to allow Apps Script for your user. |
| "Could not read the date …" when migrating | Someone edited a `time` cell by hand in the old sheet. Fix it using the `05 oct 14:30` format and run it again. |
| The migration says "RQs were already migrated" | It already ran once. Delete those rows in `RQs` to run it again. |
| I changed `Config` and nothing changed | Config is cached for 1 minute. Wait and click ↻ Refresh. |
| "Could not find the team …" | Someone renamed or deleted that team. The app goes back to All teams; pick it again. |

---

# For other teams (template)

The whole app lives inside the sheet: copying the sheet copies the code. That's how it's shared with other teams.

**Once (you):**
1. With your sheet working: File → **Make a copy** → name it `TEMPLATE – RQ Rotation`.
2. In the copy: delete the data rows in `RQs` (keep the header), leave one sample team in `Teams` and generic values in `Config`.
3. Share the template as *Viewer* with the company. To hand it out, use the direct-copy link: replace the end of the URL, `/edit…`, with **`/copy`**. Anyone who opens it sees a "Make a copy" button.

**Each new team:**
1. Open the `/copy` link with their company email → **Make a copy**.
2. Edit `Config` (title, subtitle, priorities, domain) and set up their teams from the app (**＋ New team**).
3. Extensions → Apps Script → run `setup` once and accept the permissions.
4. Do Part 4, step 2 (deploy as a web app) and share their URL.

Each copy ends up with its own sheet, data and URL. Inside one copy, every team is visible to everyone who can open the app. Code improvements get pasted into each copy (or teams get the new version of the files).

---

## Code map (where to edit what)

| I want to change… | Where |
|---|---|
| Priorities, title, subtitle | `Config` tab (no code) |
| Teams, people, clients per team | The app, or the `Teams` tab |
| Columns of the Teams tab | `Code.gs` → `TEAM_HEADERS`, `TCOL`, `readTeams_`, `teamRow_` |
| Upgrade from the single-team sheet | `Code.gs` → `setup_` |
| Team summaries for the All teams page | `Code.gs` → `buildState_` |
| Logo and font | `Brand.html` |
| Defaults for a brand-new sheet | `Code.gs` → `DEFAULT_CONFIG` |
| Columns saved per RQ | `Code.gs` → `RQ_HEADERS` and `COL` |
| What happens when an RQ is taken | `Code.gs` → `takeRq` |
| Turn rules when removing/reordering people | `Code.gs` → `removeMember`, `saveOrder` |
| Who can get in | `Code.gs` → `checkAccess_` + `allowed_domain` in `Config` |
| Columns in the exported CSV | `Code.gs` → `exportCsv` |
| Colors (navy, accent, lime), spacing | `Index.html` → `<style>` block, variables in `:root` |
| Colors per priority | `Index.html` → `:root` (`--low`, `--med`, `--high`) and `PRIO_STYLE` |
| Hero text ("Up next", ROTATION watermark) | `Index.html` → `heroHtml` and `.hero::after` |
| All teams page (cards, filters, grouping) | `Index.html` → `overviewHeroHtml`, `overviewHtml`, `teamCardHtml` |
| New team / team details modals | `Index.html` → `openNewTeam`, `openTeamInfo` and the `m-newteam`, `m-teaminfo` blocks |
| Cards, table, insights of one team | `Index.html` → `render`, `historyHtml`, `statsHtml` |
| Rows per page / auto-refresh | `Index.html` → `PAGE` and the `setInterval` at the end |
| Format of the old Streamlit sheet | `Migration.gs` → `readStreamlit_` |
