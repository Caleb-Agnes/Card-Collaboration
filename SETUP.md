# Setup

This takes about 20 minutes. You need a free Supabase account and a GitHub account.

You can try the whole app before doing any of this: with `js/config.js` left empty it runs in **demo mode** (data lives in the browser tab, any password works). See "Running it locally" at the bottom.

## 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign in and click **New project**. Any name (e.g. `collab-card`), any region near you, and a database password you keep somewhere safe (the app never uses it).
2. When it has finished creating, note two values:
   - the **Project URL**, which looks like `https://abcd1234.supabase.co`. Find it under **Data API > Overview** as the "API URL", and leave off the `/rest/v1/` at the end.
   - the **publishable** key, which starts `sb_publishable_...`. Find it under **Project Settings > API Keys**. An older `anon` key starting `eyJ...` also works. **Never** use the secret key.

   When creating the project, under **Data access**, tick "Enable Data API" and "Enable RLS on new tables automatically", and leave "Grant API access to new tables automatically" unticked.

The anon key is meant to be public. It ends up in the website, and all the protection comes from the database rules in step 2.

## 2. Create the tables and rules

1. Open **SQL Editor > New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. It should say "Success. No rows returned".

This creates the tables, the Row Level Security rules (who can change what), the private `card` storage bucket and the realtime feed. It's safe to run again later if I change the rules.

## 3. Turn off sign-ups and create the 7 accounts

1. Open **Authentication > Sign In / Providers** (older dashboards: **Authentication > Providers** or **Settings**).
   - Turn **off** "Allow new users to sign up".
   - Leave the **Email** provider on.
   - Turn **off** "Confirm email", if the option is shown.
2. Open **Authentication > Users > Add user > Create new user** and create one user per person listed in [`js/profiles.js`](js/profiles.js). Each email is the name in lower case followed by `@example.com` (for example `alex@example.com`). Choose a password for each, and tick **Auto Confirm User** each time.

   Nobody ever sees these emails: friends sign in by picking their name. The passwords are stored hashed by Supabase, and the app never sees them except when someone types one in.

   If Supabase rejects `example.com` addresses, use another domain you own or a made-up one it accepts, for example `caleb@card.test`. Then change `EMAIL_DOMAIN` in `js/config.js` and the `domain` line at the top of `supabase/seed.sql` to match.

To change a password later, open **Authentication > Users**, click the user, then **Reset password** or **Update user**.

## 4. Create the project and profiles

In **SQL Editor > New query**, paste [`supabase/seed.sql`](supabase/seed.sql) and **Run**. It links each account to its profile (name and colour) and makes Caleb the host. If it complains that users are missing, check the emails from step 3.

## 5. Connect the website and publish it

1. Edit [`js/config.js`](js/config.js) and fill in the two values from step 1:
   ```js
   export const SUPABASE_URL = 'https://abcd1234.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```
2. Create a GitHub repository (e.g. `collab-card`). It can be public; nothing secret is in the code. Push this folder to it:
   ```sh
   git remote add origin https://github.com/<you>/collab-card.git
   git push -u origin main
   ```
3. On GitHub open **Settings > Pages**, set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, and **Save**. After a minute the site is live at `https://<you>.github.io/collab-card/`.
4. Open the link, sign in as Caleb, open **Host > Canvas setup** to check the size (A5 portrait at 300 dpi is the default) and the background, then share the link with everyone.

## Before friends use it: wake the project

**Free Supabase projects pause after about a week with no activity.** A paused project makes sign-in fail with "Couldn't reach the server". If it has been quiet for a while, open your Supabase dashboard and click **Restore project** (or just open the site yourself) a few minutes before sending the link. Data is kept while paused.

Free-tier limits worth knowing (check the current numbers on Supabase's pricing page): 500 MB database, 1 GB file storage and 5 GB transfer per month. One card with 30 layers and a few versions each is well within that. Uploads are capped at 20 MB per image.

## Running it locally

ES modules don't load from `file://`, so open the folder through a local web server:

- **VS Code:** install the "Live Server" extension, right-click `index.html` and choose **Open with Live Server**.
- **Or in a terminal:** `python -m http.server 8000` in this folder, then open http://localhost:8000.

With `js/config.js` empty you get demo mode. With it filled in, the local copy talks to the real Supabase project.

## Backups

Before the final export, use **Host > Download backup**. It downloads a zip of every uploaded image (all versions) plus `project.json`, which records the positions and layer order.
