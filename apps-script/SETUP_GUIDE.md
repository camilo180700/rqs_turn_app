# RQ Rotation on Apps Script: setup guide

Do everything with your **company account**. The app lives inside the company Google Workspace: the sheet sits in the company Drive, only accounts from the company domain can open it, and every RQ is stamped with the email of the person who logged it.

Estimated time: 30 to 40 minutes the first time.

**Package files**

| File | What it is |
|---|---|
| `Code.gs` | Server: reads and writes the sheet; handles turns, the team and access |
| `Migration.gs` | Brings over the RQs from the Streamlit app, with a backup |
| `Index.html` | The interface, in the SBA Hub visual style (styles + logic) |
| `Brand.html` | Font and logo for the top bar (kept separate so the brand can change without touching the interface) |
| `appsscript.json` | Manifest: Bogotá time zone, web app limited to the domain |

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
8. Go back to the sheet: it now has three new tabs, `RQs`, `State` and `Config`.

## Part 3 · Migrate the RQs

1. Reload the sheet. An **RQ Rotation** menu appears.
2. **RQ Rotation → Migrate from the Streamlit app…** → paste the URL from Part 1, step 5.
3. A **preview** shows how many RQs were found, the date range, the rotation order and whose turn it is. If it all looks right, click **Yes**.
4. When it finishes, it gives you a link to a backup copy in your Drive.
5. Check the `RQs` tab: each row has a full date, `created_by = migrated` and `source = streamlit`.

**About dates:** Streamlit saved dates like "29 oct 10:15", with no year. The migration works out the year by going from the newest row to the oldest and subtracting a year whenever the month "goes up" (e.g. Jan → Dec). If the app ran for more than 12 months straight with a month that had no RQs in between, double-check the oldest dates.

If a client from the history wasn't on the list, it's added to `Config` automatically. If something goes wrong, delete the rows in `RQs` and run it again; the old sheet is never modified.

## Part 4 · Configure and publish

1. **`Config`** tab (`key` / `value` columns):
   - `team`, `subtitle`: what shows at the top of the app.
   - `allowed_domain`: the company domain, e.g. `company.com`. Blocks any outside account.
   - `client` and `priority` rows: one per row. Clients can also be added or removed from the app with **Manage clients**.
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

---

# For other teams (template)

The whole app lives inside the sheet: copying the sheet copies the code. That's how it's shared with other teams.

**Once (you):**
1. With your sheet working: File → **Make a copy** → name it `TEMPLATE – RQ Rotation`.
2. In the copy: delete the data rows in `RQs` (keep the header), put sample names in `State` → `order` and leave `Config` with generic values.
3. Share the template as *Viewer* with the company. To hand it out, use the direct-copy link: replace the end of the URL, `/edit…`, with **`/copy`**. Anyone who opens it sees a "Make a copy" button.

**Each new team:**
1. Open the `/copy` link with their company email → **Make a copy**.
2. Edit `Config` (team name, subtitle, clients, priorities, domain) and `State` → `order` with their people separated by commas (they can also do this from the app with "Manage team").
3. Extensions → Apps Script → run `setup` once and accept the permissions.
4. Do Part 4, step 2 (deploy as a web app) and share their URL.

Each team ends up with its own sheet, data and URL. No team sees another team's data. Code improvements get pasted into each copy (or teams get the new version of the files).

---

## Code map (where to edit what)

| I want to change… | Where |
|---|---|
| Clients, priorities, name, subtitle | `Config` tab (no code) |
| Logo and font | `Brand.html` |
| Defaults for new teams | `Code.gs` → `DEFAULT_CONFIG` |
| Columns saved per RQ | `Code.gs` → `RQ_HEADERS` and `COL` |
| What happens when an RQ is taken | `Code.gs` → `takeRq` |
| Turn rules when removing/reordering people | `Code.gs` → `removeMember`, `saveOrder` |
| Who can get in | `Code.gs` → `checkAccess_` + `allowed_domain` in `Config` |
| Columns in the exported CSV | `Code.gs` → `exportCsv` |
| Colors (navy, accent, lime), spacing | `Index.html` → `<style>` block, variables in `:root` |
| Colors per priority | `Index.html` → `:root` (`--low`, `--med`, `--high`) and `PRIO_STYLE` |
| Hero text ("Up next", ROTATION watermark) | `Index.html` → `heroHtml` and `.hero::after` |
| Cards, table, insights | `Index.html` → `render`, `historyHtml`, `statsHtml` |
| Rows per page / auto-refresh | `Index.html` → `PAGE` and the `setInterval` at the end |
| Format of the old Streamlit sheet | `Migration.gs` → `readStreamlit_` |
