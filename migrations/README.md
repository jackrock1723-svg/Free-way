# Free way storage and sign-in

## Storage backends
- **Local (default).** No setup. Accounts, logins, ownership, usage, ad events and the error log are kept in `accounts.sqlite` inside the data folder. Everything else keeps using local files as before.
- **Postgres / Supabase.** Set the `DATABASE_URL` environment variable to the Postgres connection string (Supabase: Project settings > Database > Connection string, URI form). Requires a Postgres driver (`psycopg` 3 or `psycopg2`) in the Python runtime. If the variable is set but the driver is missing or the database is unreachable, Free way falls back to local storage and shows a warning in the admin health panel. The connection string is never logged, printed or returned by any API; keep it out of chat and source control.
- Apply `001_free_way_init.sql` once in the Supabase SQL editor (Free way also creates the tables if they are missing). RLS is enabled with no policies, so the public anon key cannot read these tables.

## Sign-in
| Variable | Meaning |
|---|---|
| `FC_GOOGLE_AUTH=on` | Turn on Google sign-in (off by default). |
| `FC_GOOGLE_CLIENT_ID` | OAuth client id ending in `.apps.googleusercontent.com`. |
| `FC_GOOGLE_ORIGIN` | Exact https origin of the site, for example the live link. |
| `FC_GOOGLE_MULTI_USER=on` | Let any Google account with a verified email sign in. Each user only sees their own projects and agents. |
| `FC_GOOGLE_OWNER_SUB` | Required only in owner-only mode (multi-user off). |
| `ADMIN_EMAILS` | Comma-separated emails that get the admin panel when signed in. |

Every sign-in attempt is recorded in `login_events` (email, name, time, IP, user agent, success). Disabled users cannot sign in.

## Admin access token
`python -m freecode.admin_token --data <data folder> --out <file>` creates a random admin token, stores only its SHA-256 hash in `<data>/admin/token.sha256`, and writes the token to `<file>`. Nothing is printed. Open `/#admin` and paste the token, or sign in with an email listed in `ADMIN_EMAILS`.
