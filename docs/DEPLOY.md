# Deploying FeeDesk (Netlify + Neon)

About 30 minutes, all free tiers. Netlify builds the app from GitHub on every push to
`scaffold-app`; Neon is the hosted Postgres database. Nothing here needs AI credits.

You will save three values in Netlify. **Never commit them or paste them in chat.**

| Value | What it is |
|---|---|
| `DATABASE_URL` | Neon's connection string (step 1) |
| `BETTER_AUTH_SECRET` | A random secret that signs logins (step 2). Keep it forever; changing it signs everyone out |
| `AUTH_BOOTSTRAP_ADMINS` | Your email address. Sign-up is invite-only, so only this address can create an account |

---

## 1. Create the database (Neon)

1. Go to **neon.tech** → **Sign up** (GitHub sign-in is fine).
2. **Create project**: name `feedesk`, Postgres version as suggested, region **AWS Europe (Frankfurt)**
   (closest to Accra of the free regions).
3. On the project dashboard click **Connect**. Leave **Connection pooling** ON and copy the connection
   string. It looks like
   `postgresql://neondb_owner:…@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   Keep it in a password manager or a private note. This is `DATABASE_URL`.

## 2. Make the login secret

In a terminal on your laptop:

```bash
openssl rand -hex 32
```

Copy the 64-character result. This is `BETTER_AUTH_SECRET`. Save it with the database URL.

## 3. Create the site (Netlify)

1. Go to **app.netlify.com** → sign up / log in **with GitHub**.
2. **Add new project** → **Import an existing project** → **GitHub** → allow access to
   **Ikwame91/FeeDesk**.
3. **Branch to deploy:** `scaffold-app`. Leave the build settings as they are (they come from
   `netlify.toml`).
4. **Site name:** something like `feedesk-adenta` (it becomes `feedesk-adenta.netlify.app`).
5. Click **Add environment variables** (before deploying) and add:
   - `DATABASE_URL` = the Neon string from step 1 (mark it **secret**)
   - `BETTER_AUTH_SECRET` = the value from step 2 (mark it **secret**)
   - `AUTH_BOOTSTRAP_ADMINS` = your email address
6. Click **Deploy**. The first build takes about 5–10 minutes.
7. When it finishes, open **Deploys → the latest deploy → Deploy log** and search for
   `Applied migration "feedesk-photo-capture"`. That line means the database tables were created.

If the build fails, copy the last ~30 lines of the deploy log and send them to Claude.

## 4. Load the demo school into the hosted database

From your laptop, in the FeeDesk folder (stop `pnpm dev` first):

```bash
unset DATABASE_URL
```

```bash
DATABASE_URL='paste-the-neon-string-here' AGENT_USER_EMAIL='you@example.com' pnpm demo:load
```

It should print `Demo data loaded: 45 students, 113 receipts, 103 MoMo lines, 7 bank lines`.
Run the same command again any time you want to reset the live demo before a recording.

## 5. Sign in and connect the AI

1. Open your site (`https://<site-name>.netlify.app`). The first visit after a quiet spell can take
   ~10 seconds while Neon wakes up.
2. **Show full sign in options** → **Sign up** with the email you put in `AUTH_BOOTSTRAP_ADMINS` and a
   password. (Any other email is refused: sign-up is invite-only.)
3. Open **New chat** → **Connect AI** → **Use Builder.io** (or **Custom keys** with a Gemini key).
   The live site has its own connection; connecting on your laptop doesn't carry over.
4. Check the **School** page shows Adenta Hills Academy, then run the demo as rehearsed.

## Updating the live site

Every `git push` to `scaffold-app` rebuilds and redeploys automatically, including any new database
migrations. To reset the demo data, repeat step 4.

## If something goes wrong

| Symptom | Fix |
|---|---|
| Build log: `Unsupported engine` / Node version | `netlify.toml` pins Node 22; make sure the deploy used the latest commit |
| Build log: database connection error | Re-copy `DATABASE_URL` from Neon's **Connect** panel (pooled), save, **Retry deploy** |
| "Sign up is not available" / invitation required | `AUTH_BOOTSTRAP_ADMINS` must be exactly the email you sign up with; fix it, then **Retry deploy** |
| `pnpm demo:load` says "can't use this database setting" | The command must start with `DATABASE_URL='postgresql://…'` on the same line |
| First page is very slow | Neon's free tier sleeps when idle; the next requests are fast |
