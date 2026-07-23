# Office HR System — Vercel deployment

This folder is a ready-to-deploy Vercel project:

- `index.html` — the app (same UI as before, but its storage now talks to a real backend
  instead of the Claude-only `window.storage` API).
- `api/kv.js` — a tiny serverless function that reads/writes Vercel KV (a free Redis-based
  database that lives inside your Vercel project — no separate account needed).
- `package.json` — declares the one dependency (`@vercel/kv`).

The PIN login still works exactly as before (default PIN is `1234`, changeable from
Settings once you're logged in) — it's just checked against the real database now, so
it's the same PIN for every visitor.

## Option A: Deploy via the Vercel website (no command line)

1. Go to https://vercel.com and sign up / log in (free, GitHub login is easiest).
2. Put these files in a GitHub repo:
   - Easiest way: go to https://github.com/new, create a repo (e.g. `office-hr-system`),
     then use the "upload files" option on the repo page and drag in `index.html`,
     `api/kv.js`, `package.json`, and `.gitignore` (keep the `api` folder structure).
3. In Vercel, click **Add New → Project**, choose the repo you just created, and click **Deploy**.
   Vercel will detect it automatically — no build settings needed.
4. Once deployed, go to your Vercel **project → Storage tab → Create Database → KV**.
   Create it and **connect it to this project** (Vercel does this with one click and
   automatically adds the required environment variables).
5. Go to **Deployments** and redeploy once (top right "..." menu → Redeploy) so the
   function picks up the new KV environment variables.
6. Your app is now live at `https://<your-project-name>.vercel.app` — share that link
   with anyone. They'll see the PIN screen; the default PIN is `1234` until you change it.

## Option B: Deploy via the Vercel CLI (if you're comfortable with a terminal)

```bash
npm install -g vercel
cd office-hr-system     # this folder
vercel login
vercel                  # first deploy — follow the prompts
vercel storage create kv       # or create the KV store from the Vercel dashboard
vercel link                    # if not already linked
vercel env pull                # pulls KV env vars locally (optional, for local testing)
vercel --prod                  # deploy to production
```

If you create the KV store from the dashboard instead of the CLI, just make sure it's
connected to this project, then run `vercel --prod` again so the new env vars apply.

## Notes

- **Change the default PIN immediately** after your first login (Settings tab) since
  anyone who finds the URL before you change it could log in with `1234`.
- All employee records, attendance, leave, and payroll data now live in Vercel KV —
  it persists across redeploys and is shared by everyone who logs in with the PIN.
- If you ever want per-editor accounts instead of one shared PIN, that's a bigger
  change (real user accounts) — let me know if you want that instead.
