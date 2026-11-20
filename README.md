# VYBE STUDIO

A static HTML/CSS/JavaScript marketing campaign builder. The original seven-tab interface is preserved.

## Integrations

- Gemini API through a Netlify Function (the Gemini key stays server-side).
- Supabase Auth and PostgreSQL with row-level security.
- Private Supabase Storage for uploaded product images.
- Local browser cache with one-time migration of existing local campaigns after sign-in.

## 1. Create and configure Supabase

1. Create a free project at https://supabase.com.
2. Open **SQL Editor**, paste and run `supabase/schema.sql`.
3. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key).
4. Put those public values in `config.js`:

```js
window.VYBE_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

The publishable/anon key is intended for browser use. The database and storage policies restrict each signed-in user to their own records. Never use a service-role key in frontend code.

For personal testing, email confirmation can remain enabled. A new account may need to click the confirmation email before signing in. Add your Netlify site URL to Supabase Auth → URL Configuration → Redirect URLs if you customize confirmation redirects.

## 2. Configure Netlify environment variables

In **Netlify → Site configuration → Environment variables**, add:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | API key from https://aistudio.google.com/apikey |
| `GEMINI_MODEL` | Optional; defaults to `gemini-3.8-flash` |
| `SUPABASE_URL` | Same Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Same Supabase publishable key |
| `SUPABASE_ANON_KEY` | Optional legacy anon-key fallback |

Do not add `GEMINI_API_KEY` to `config.js`, HTML, JavaScript, or GitHub. Do not use the Supabase service-role key. The Netlify Function validates the user's Supabase access token before sending a prompt to Gemini.

## 3. Deploy

1. Connect this GitHub repository to Netlify (or use the existing Netlify site).
2. Set the environment variables above.
3. Run the SQL script and update `config.js` with your Supabase public settings.
4. Deploy the branch or merge the integration branch into your production branch.
5. Open the site, create an account, and sign in.

No frontend build command is required. `netlify.toml` publishes the repository root and deploys `netlify/functions`.

## 4. App features

- **Builder:** creates a complete campaign using Gemini.
- **Marketing Analysis:** 4Ps, segmentation, SWOT, funnel, Ansoff and KPIs.
- **Strategy:** execution strategy and Gantt timeline.
- **Image Studio:** image prompts, captions and hashtags.
- **Action Plan:** task checklist, browser notifications and calendar export.
- **Dashboard:** CSV performance metrics, charts and Gemini recommendations.
- **History:** open, reuse, delete and analyze previous campaigns.
- **Cloud projects:** email sign-in, Supabase save/load/delete and private product-image storage.

Existing local browser campaigns are migrated to the signed-in user's Supabase account during the first cloud sync. Local data is kept in this browser as a cache.

## 5. Free-tier notes

Google AI Studio and Supabase provide free-tier options, subject to current quotas, region, and eligibility. Netlify Functions are also subject to your Netlify plan limits. Check provider dashboards for current limits. Gemini may return rate-limit errors (HTTP 429); the app displays the provider error.

## Security checklist

- Keep Gemini API key in Netlify environment variables only.
- Use Supabase publishable/anon key in the browser; never expose service-role keys.
- Keep the Supabase RLS policies enabled.
- If a secret was ever committed to a public repository, revoke and rotate it.
