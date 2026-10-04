# Environments

Which setting exists in which environment. Values are never written here: they live in the Render and Netlify dashboards and in the GitHub repository settings, and locally in an ignored `.env` copied from `.env.example`.

## Services

| | Production | Staging | Local |
|---|---|---|---|
| Web | Netlify, deployed by `deploy.yml` from `main` | Netlify branch deploy of `develop` | `npm run dev -w apps/web` (Vite proxies `/api` to port 3000) |
| API | Render `fedsa-api` (Free), deployed by hook from `deploy.yml` | Render `fedsa-api-staging` (Free), auto-deploys from `develop` | `npm run dev -w apps/api` |
| Jobs | Run by the API every 5 minutes while it is awake | Same as production | Same as production |
| Database | Atlas production project | Atlas staging project | Atlas staging or a local `mongod` |
| Photos | Cloudinary folder `fedsa/production` | Cloudinary folder `fedsa/staging` | `PHOTO_STORE=local` |

Both Render services are on the free plan.
A free service sleeps after about 15 minutes without requests, and the first request after that takes up to a minute while it starts.
Open the site a minute before a demo.
An always-on deployment would put `fedsa-api` on Render's Starter plan and the jobs in a Render cron service.

The browser only talks to the Netlify origin. Netlify rewrites `/api/*` to the Render service for its context, so the session cookie is first-party. Twilio webhooks go to Render directly and are signature-checked.

## API and jobs

✓ set, optional only when the feature is wanted, – not needed, *planned* not used by the code yet.

| Variable | Production | Staging | Local | Notes |
|---|---|---|---|---|
| `NODE_ENV` | ✓ `production` | ✓ `production` | `development` | Anything but `development` makes the session cookie `Secure` |
| `MONGODB_URI` | ✓ | ✓ | ✓ | One database user per environment |
| `SESSION_SECRET` | ✓ | ✓ | ✓ | A long random string, different in every environment |
| `PORT` | set by Render | set by Render | default `3000` | |
| `RENDER_GIT_COMMIT` | set by Render | set by Render | – | Reported as `version` by `/api/health` |
| `PHOTO_STORE` | *planned* `cloudinary` | *planned* `cloudinary` | *planned* `local` | |
| `CLOUDINARY_URL` | *planned* | *planned* | – | |
| `NOTIFY_CHANNELS` | ✓ `push,sms` | ✓ `push,sms` | `console` | Channels besides the in-app inbox. A listed channel with a missing setting stays off |
| `NOTIFY_MIRROR` | optional | optional | optional | `false` stops copying offer notifications to WhatsApp or SMS. On when empty |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | ✓ | ✓ | optional | The webhooks refuse every request without the auth token |
| `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` | ✓ | ✓ | optional | E.164, for example a Twilio trial number |
| `PUBLIC_API_URL` | ✓ | ✓ | – | The Render origin, with no trailing slash. Twilio signs webhook requests against it and sends delivery reports to it |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | ✓ | ✓ | optional | A separate key pair per environment |
| `MATCH_RADIUS_KM` | optional | optional | optional | Defaults to 15 |
| `SEED_PASSWORD` | – | for one seed run | ✓ | Password for every seeded demo account. Only `npm run seed` reads it |
| `SEED_CONFIRM_HOST` | – | for one seed run | – | The database host the seed may write to, as its refusal prints it. Set it on the command line, not in a file |

## Twilio

Twilio calls Render directly, not Netlify.
In the Twilio console, set the incoming-message webhook of the SMS number and of the WhatsApp sandbox to `<PUBLIC_API_URL>/api/webhooks/twilio/inbound`.
The API adds the delivery-report callback to each message it sends.
A free Render service that is asleep takes up to a minute to answer, which is longer than Twilio waits, so a reply sent while the API sleeps is lost.

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
| `PRODUCTION_URL` | variable | `deploy.yml`, the Netlify production URL |
| `PRODUCTION_API_ORIGIN` | variable | `deploy.yml`, the Render production URL |
| `VITE_DATA` | variable | `deploy.yml` |

CI needs no database credentials. Integration tests start their own in-memory replica set.
