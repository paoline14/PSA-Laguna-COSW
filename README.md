# Office HR System — Vercel deployment

This folder is a ready-to-deploy Vercel project:

- `index.html` — the app UI.
- `api/kv.js` — general-purpose read/write for app data (employees, attendance, leave,
  payroll, departments, announcements, chat). Requires a signed-in session for every
  request, and enforces server-side that only an **admin** account can write to
  `employees-data`, `payroll-data`, `departments-data`, and `announcements-data` — a
  non-admin browser can no longer write these no matter what it sends. Employees can
  only write their own attendance and their own (pending) leave requests, and can never
  set a leave to Approved/Rejected. Reads are filtered too: an employee's browser never
  receives other people's salary, attendance, or leave data over the network.
- `api/login.js`, `api/signup.js`, `api/change-password.js`, `api/logout.js` — real
  account handling. Passwords are hashed with bcrypt before being stored and are never
  compared or read in the browser. Successful login sets a signed, HttpOnly session
  cookie; every other endpoint checks that cookie server-side to know who's calling and
  what role they have.
- `api/_auth.js` — shared helper for signing/verifying the session cookie.
- `package.json` — declares `@vercel/kv` and `bcryptjs`.

**Accounts, not a shared PIN.** Each person signs up with their own username and
password. The first account ever created is the only one that can self-select "Admin"
at signup — every signup after that is forced to "Employee" server-side, even if the
form is tampered with. If you need a second admin later, that has to be done by editing
the stored user record directly (e.g. from the Vercel KV dashboard) rather than through
signup, since there's no in-app "promote to admin" feature yet.

## Option A: Deploy via the Vercel website (no command line)

1. Go to https://vercel.com and sign up / log in (free, GitHub login is easiest).
2. Put these files in a GitHub repo, **keeping the folder structure**:
   - `index.html`
   - `package.json`
   - `api/kv.js`
   - `api/_auth.js`
   - `api/login.js`
   - `api/signup.js`
   - `api/logout.js`
   - `api/change-password.js`
   - Easiest way: go to https://github.com/new, create a repo (e.g. `office-hr-system`),
     then use the "upload files" option and drag the whole folder in so `api/` stays a
     subfolder rather than getting flattened.
3. In Vercel, click **Add New → Project**, choose the repo you just created, and click **Deploy**.
   Vercel will detect it automatically — no build settings needed.
4. Once deployed, go to your Vercel **project → Storage tab → Create Database → KV**.
   Create it and **connect it to this project** (Vercel does this with one click and
   automatically adds the required KV environment variables).
5. Go to **project → Settings → Environment Variables** and add one more:
   - `SESSION_SECRET` — any long random string (e.g. generate one with
     `openssl rand -hex 32` in a terminal, or just mash the keyboard for 40+ characters).
     This is what signs the login session cookie — without it, login will fail with a
     clear error rather than falling back to something insecure.
6. Go to **Deployments** and redeploy (top right "..." menu → Redeploy) so the function
   picks up the new environment variables.
7. Your app is now live at `https://<your-project-name>.vercel.app`. Sign up your own
   account first and choose **Admin** — you get one shot at this, since every signup
   after the first is forced to Employee automatically. Then share the link so
   employees can create their own Employee accounts.

## Option B: Deploy via the Vercel CLI (if you're comfortable with a terminal)

```bash
npm install -g vercel
cd office-hr-system     # this folder
vercel login
vercel                  # first deploy — follow the prompts
vercel storage create kv       # or create the KV store from the Vercel dashboard
vercel env add SESSION_SECRET  # paste a long random string when prompted
vercel link                    # if not already linked
vercel env pull                # pulls KV + SESSION_SECRET env vars locally (optional)
vercel --prod                  # deploy to production
```

If you create the KV store from the dashboard instead of the CLI, just make sure it's
connected to this project, then run `vercel --prod` again so the new env vars apply.

## Notes

- **Sign up your own account first and pick Admin.** Only the first account created
  can become admin; every account after that is forced to Employee server-side, so
  don't lose access to that first login.
- Passwords are hashed with bcrypt before they're ever written to storage — even you,
  looking directly in the Vercel KV dashboard, will only see a hash, not the password.
- Sessions are an HttpOnly cookie signed with `SESSION_SECRET` and expire after 8 hours,
  so people need to sign back in periodically rather than staying logged in forever.
- Employees can only write their own attendance and their own pending leave requests;
  only an admin session can write employee records, payroll, departments, or
  announcements, or approve/reject a leave request — and this is enforced in
  `api/kv.js` on the server, not just hidden in the UI.
- There's no in-app "promote to admin" or "list all accounts" screen yet. If you need a
  second admin, you'd currently do it by hand in the Vercel KV dashboard (find the
  `users-data` key, add `"role": "admin"` to that user's entry).
