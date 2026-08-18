<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/96e70910-d71a-484b-9773-6a60a3b37aa8

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `GEMINI_API_KEY` — only needed if you use AI rewrite/translate.
   - `ADMIN_RECOVERY_KEY` — a secret you choose, used to reset the admin password if you get locked out.
   - `DATA_DIR` — optional, defaults to `./data`.
3. Run the app:
   `npm run dev`
4. On first load you'll be asked to create the admin account (username + password). This is stored server-side (hashed), not in the browser — every API route requires a valid login.

## Authentication

Login is enforced on the server: `/api/auth/*` handles setup/login/logout, and every other `/api/*` route requires a valid session token. There's no email/SMS integration, so if you forget the admin password, use the "فراموشی رمز عبور" screen with the `ADMIN_RECOVERY_KEY` you set in your environment.

## Deploying to Render

`render.yaml` is set up for Render's Blueprint deploys. Two things to do in the Render dashboard after the first deploy:
1. Set `ADMIN_RECOVERY_KEY` (marked `sync: false`, so Render won't auto-fill it) to a long random value.
2. If you want your connections/logs/admin account to survive redeploys, the free plan's filesystem is ephemeral — you'll need a paid plan with the persistent disk defined in `render.yaml` (mounted at `/var/data`, matching `DATA_DIR`).
