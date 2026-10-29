# Environments

Which setting exists in which environment.
Values are never written here: they live in the Render and Netlify dashboards and in the GitHub repository settings, and locally in an ignored `.env` copied from `.env.example`.

## Services

| | Production | Staging | Local |
|---|---|---|---|
| Web | Netlify `fedsa-mogi`, deployed by `deploy.yml` from `main` | Netlify `fedsa-staging`, deployed by `staging.yml` from `develop` | `npm run dev -w apps/web` (Vite proxies `/api` to port 3000) |
| API | Render `fedsa-api` (`0.5c-512mb`), deployed by hook from `deploy.yml` | Render `fedsa-api-staging` (Free), auto-deploys from `develop` | `npm run dev -w apps/api` |
| Jobs | Render cron `fedsa-jobs` (`0.5c-512mb`) every 5 minutes, deployed by Render from `main` once every check on the commit passes | Run by the API every 5 minutes while it is awake | Run by the API, or once with `npm run start -w apps/jobs` after a build |
| Database | Atlas `fedsa-production`, Cape Town | Atlas `fedsa-staging`, Cape Town | A local `mongod`, or the in-memory one the tests start |
| Photos | Cloudinary folder `fedsa/production` | Cloudinary folder `fedsa/staging` | `PHOTO_STORE=local` |

| | Production | Staging |
|---|---|---|
| Web | https://fedsa-mogi.netlify.app | https://fedsa-staging.netlify.app |
| API | https://fedsa-api.onrender.com | https://fedsa-api-staging.onrender.com |

The production API and the cron service are on Render's `0.5c-512mb` compute plan, formerly called Starter, and the API never sleeps.
The cron service starts, runs the expiry sweep, runs the photo retention sweep during the 02:00 hour and the previous month's certificates on the 1st (both South African time), and exits.
A run where any of these fails exits non-zero, and Render marks it failed.
Staging is on the free plan, which sleeps after about 15 minutes without requests, and the first request after that takes up to a minute while it starts.
Atlas accepts connections only from Render's Frankfurt outbound ranges, plus a developer's own IP for a limited time when one has to seed.

The browser only talks to the Netlify origin.
Netlify rewrites `/api/*` to the Render service for its context, so the session cookie is first-party.
Netlify signs each request it forwards, and the API takes the client's address from Netlify only on a signed request.
Rate limits count by that address.
Twilio webhooks go to Render directly and are signature-checked.

## API and jobs

✓ set, optional only when the feature is wanted, – not needed, *planned* not used by the code yet.
The cron service needs the same database, photo, notification and Twilio settings as the production API, and none of the session, webhook or seed ones.

| Variable | Production | Staging | Local | Notes |
|---|---|---|---|---|
| `NODE_ENV` | ✓ `production` | ✓ `production` | `development` | Anything but `development` makes the session cookie `Secure` |
| `MONGODB_URI` | ✓ | ✓ | ✓ | One database user per environment |
| `SESSION_SECRET` | ✓ | ✓ | ✓ | A long random string, different in every environment |
| `API_PROXY_SECRET` | ✓ | ✓ | – | Netlify signs every request it forwards to `/api` with this, and the API then counts each request by Netlify's client address. The same value as on the Netlify site, different in every environment |
| `API_PROXY_REQUIRED` | ✓ `true` | ✓ `true` | – | `true` refuses requests Netlify did not sign, except Twilio's webhooks and `/api/health`. Set it only once the secret is in place on both sides |
| `PORT` | set by Render | set by Render | default `3000` | |
| `RENDER_GIT_COMMIT` | set by Render | set by Render | – | Reported as `version` by `/api/health` |
| `API_SWEEPS` | `false`, from `render.yaml` | – | – | `false` stops the API running the expiry and retention sweeps, which the cron service runs instead. On when empty |
| `PHOTO_STORE` | ✓ `cloudinary` | ✓ `cloudinary` | `local` | `local` when empty |
| `CLOUDINARY_URL` | ✓ | ✓ | optional | `cloudinary://KEY:SECRET@CLOUD_NAME`. Needed when `PHOTO_STORE=cloudinary` |
| `CLOUDINARY_FOLDER` | ✓ `fedsa/production` | ✓ `fedsa/staging` | – | Defaults to `fedsa` |
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
Production never sleeps.
A sleeping staging API takes up to a minute to answer, which is longer than Twilio waits, and a reply sent to staging while it sleeps is lost.

## Web (built in GitHub Actions)

The Netlify free plan cannot build from a private organisation repository, so neither site is connected to the repository.
The workflows build the web app and upload it with the Netlify CLI.

| Variable | Production | Staging | Local | Notes |
|---|---|---|---|---|
| `API_ORIGIN` | GitHub variable `PRODUCTION_API_ORIGIN` | GitHub variable `STAGING_API_ORIGIN` | – | Written into `netlify.toml` at build time as the signed `/api` rewrite |
| `API_PROXY_SECRET` | Netlify site variable, Runtime scope | Netlify site variable, Runtime scope | – | The same value as the API's `API_PROXY_SECRET` for that environment. Netlify reads it when it proxies, not at build time |
| `VITE_DATA` | unset | unset | `http` | The API unless set to `fake`, which runs on built-in demo data and shows a banner on every screen |

## GitHub

| Name | Kind | Used by |
|---|---|---|
| `NETLIFY_AUTH_TOKEN` | secret | `deploy.yml`, `staging.yml` |
| `NETLIFY_SITE_ID` | secret | `deploy.yml`, the production site |
| `NETLIFY_STAGING_SITE_ID` | secret | `staging.yml`, the staging site |
| `RENDER_API_HOOK` | secret | `deploy.yml`, the production API |
| `PRODUCTION_URL` | variable | `deploy.yml`, the Netlify production URL |
| `PRODUCTION_API_ORIGIN` | variable | `deploy.yml`, the Render production URL |
| `STAGING_URL` | variable | `staging.yml`, the Netlify staging URL |
| `STAGING_API_ORIGIN` | variable | `staging.yml`, the Render staging URL |

CI needs no database credentials.
Integration tests start their own in-memory replica set.
