# Environments

Which setting exists in which environment. Values are never written here: they live in the Render and Netlify dashboards and in the GitHub repository settings, and locally in an ignored `.env` copied from `.env.example`.

## Services

| | Production | Staging | Local |
|---|---|---|---|
| Web | Netlify, deployed by `deploy.yml` from `main` | Netlify branch deploy of `develop` | `npm run dev -w apps/web` (Vite proxies `/api` to port 3000) |
| API | Render `fedsa-api` (Starter, always on), deployed by hook from `deploy.yml` | Render `fedsa-api-staging` (Free), auto-deploys from `develop` | `npm run dev -w apps/api` |
| Jobs | Render cron `fedsa-jobs`, every 5 minutes | none | `npm run start -w apps/jobs` |
| Database | Atlas production project | Atlas staging project | Atlas staging or a local `mongod` |
| Photos | Cloudinary folder `fedsa/production` | Cloudinary folder `fedsa/staging` | `PHOTO_STORE=local` |

The browser only talks to the Netlify origin. Netlify rewrites `/api/*` to the Render service for its context, so the session cookie is first-party. Twilio webhooks go to Render directly and are signature-checked.

## API and jobs

✓ set, – not needed, *planned* not used by the code yet.

| Variable | Production | Staging | Local | Notes |
|---|---|---|---|---|
| `NODE_ENV` | ✓ `production` | ✓ `production` | `development` | Anything but `development` makes the session cookie `Secure` |
| `MONGODB_URI` | ✓ | ✓ | ✓ | One database user per environment |
| `SESSION_SECRET` | ✓ | ✓ | ✓ | A long random string, different in every environment |
| `PORT` | set by Render | set by Render | default `3000` | |
| `RENDER_GIT_COMMIT` | set by Render | set by Render | – | Reported as `version` by `/api/health` |
| `PHOTO_STORE` | *planned* `cloudinary` | *planned* `cloudinary` | *planned* `local` | |
| `CLOUDINARY_URL` | *planned* | *planned* | – | |
| `NOTIFY_CHANNELS` | *planned* `push,sms` | *planned* `push,sms` | *planned* `console` | |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | *planned* | *planned* | – | |
| `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | *planned* | *planned* | – | |
| `PUBLIC_API_URL` | *planned* | *planned* | – | The Render URL Twilio signs webhook requests against |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | *planned* | *planned* | *planned* | A separate key pair per environment |
| `MATCH_RADIUS_KM` | *planned* | *planned* | *planned* | Defaults to 15 |

## Web (Netlify build)

| Variable | Production | Staging | Local | Notes |
|---|---|---|---|---|
| `API_ORIGIN` | GitHub variable `PRODUCTION_API_ORIGIN` | Netlify, `develop` branch context | – | Written into `_redirects` as the `/api` rewrite |
| `VITE_DATA` | GitHub variable `VITE_DATA` | Netlify, `develop` branch context | `fake` | `fake` or `http` |

## GitHub

| Name | Kind | Used by |
|---|---|---|
| `NETLIFY_AUTH_TOKEN` | secret | `deploy.yml` |
| `NETLIFY_SITE_ID` | secret | `deploy.yml` |
| `RENDER_API_HOOK` | secret | `deploy.yml` |
| `RENDER_JOBS_HOOK` | secret | `deploy.yml` |
| `PRODUCTION_URL` | variable | `deploy.yml`, the Netlify production URL |
| `PRODUCTION_API_ORIGIN` | variable | `deploy.yml`, the Render production URL |
| `VITE_DATA` | variable | `deploy.yml` |

CI needs no database credentials. Integration tests start their own in-memory replica set.
