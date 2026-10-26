# Put Free way online with Render (simple steps)

You need: a GitHub account that can see the Free way repo, a Google account,
and your Postgres/Supabase connection string. About 20 minutes.

## 1. Sign up
1. Go to https://render.com and click **Get Started**.
2. Choose **Sign up with GitHub** and allow Render to see the Free way repo.

## 2. Create the web service
1. In Render click **New +** then **Blueprint**.
2. Pick the Free way repo. Render reads `render.yaml` and shows one service, **free-way**.
3. Render will ask for the values below. Paste each one, then click **Apply**.
   (No secret is stored in the repo - you type them here only.)

| Name | What to paste |
|---|---|
| `DATABASE_URL` | Your Supabase/Postgres connection string. In Supabase click **Connect** and copy the **Session pooler** URI (host ends in `pooler.supabase.com`). Do **not** use the "Direct connection" one - Render cannot reach it. |
| `FREECODE_TOKEN` | A long random password you make up (30+ characters). **Required** - if empty, the server makes one and prints it in the logs. |
| `FC_GOOGLE_CLIENT_ID` | From step 3 below (ends in `.apps.googleusercontent.com`). |
| `FC_GOOGLE_ORIGIN` | Your Render address, e.g. `https://free-way.onrender.com` (no slash at the end). |
| `FC_GOOGLE_OWNER_SUB` | Leave empty at first unless you were given it. |
| `FC_GOOGLE_MULTI_USER` | `1` to let other Google users sign in, empty for owner only. |
| `ADMIN_EMAILS` | Your Gmail address (comma-separated for more). |
| `FW_ADMIN_TOKEN_SHA256` | Optional. Leave empty if unsure. |
| `OPENROUTER_API_KEY`, `NVIDIA_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_KEY` | Paste the model keys you have; leave the rest empty. |

The first build takes about 5-10 minutes. When it says **Live**, open the address at the top.

## 3. Create the Google sign-in client
1. Go to https://console.cloud.google.com, create (or pick) a project.
2. **APIs & Services > OAuth consent screen**: choose **External**, fill app name "Free way" and your email, save.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID**, type **Web application**.
4. **Authorized JavaScript origins**: `https://free-way.onrender.com` (your exact Render address).
5. **Authorized redirect URIs**: add the same address, `https://free-way.onrender.com`
   (Free way uses the Google sign-in button, so no special callback path is needed).
6. Click **Create**, copy the **Client ID**, and paste it into `FC_GOOGLE_CLIENT_ID` in Render
   (Render > free-way > Environment > Save; it redeploys by itself).

## 4. What to expect
- **Cold start:** on the free plan the site sleeps after ~15 minutes with no visitors.
  The next visit takes 30-60 seconds to wake up. That is normal.
- **Files are temporary:** the server disk is wiped on every restart/deploy. Accounts and
  data saved in Postgres stay; files kept only on the server do not.
- **Memory:** the free plan has 512 MB. Very large jobs may restart the service.
- **Sandbox:** the Docker sandbox is not available on Render; Settings will say
  "unavailable on hosted".
- **Health check:** Render checks `/api/health` to know the app is up.
- **Check the database is really used:** open `https://<your-address>/api/health`. It must say
  `"storage":"postgres"`. If it says `"local"`, the `DATABASE_URL` is wrong or unreachable and
  everything will be lost on the next restart - fix the value in Render > Environment.

If something fails, open Render > free-way > **Logs** and send a screenshot (never send
the Environment page - it has your keys).
