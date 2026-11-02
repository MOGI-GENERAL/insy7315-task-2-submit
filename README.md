# FEDSA

A progressive web app for Food Excess Distribution South Africa (FEDSA), a non-profit in Salt River, Cape Town.
Donors post surplus food, recipient organisations claim it, and coordinators and administrators track collections and impact.

|            | Production                                | Staging                                      |
| ---------- | ----------------------------------------- | -------------------------------------------- |
| Web app    | https://fedsa-mogi.netlify.app            | https://fedsa-staging.netlify.app            |
| API health | https://fedsa-mogi.netlify.app/api/health | https://fedsa-staging.netlify.app/api/health |

Uptime status: https://stats.uptimerobot.com/vGObooAo8B

Presentation video: https://youtu.be/xtwgI0r1emY

AI usage report: [docs/ai-usage.pdf](docs/ai-usage.pdf)

Clips of the app in use recorded using [Playwright](https://playwright.dev/) scripts.

## Repository Guide

This table points to where each part of the project can be found.

| Area                                        | Where to look                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back end: programming                       | [apps/api/src/services](apps/api/src/services) has the business rules. [apps/api/src/db/repositories](apps/api/src/db/repositories) is the Repository pattern. [apps/api/src/notifications](apps/api/src/notifications) is the Strategy pattern for notification channels. [organisation-status.ts](apps/api/src/services/organisation-status.ts) is the verification state machine.                       |
| Back end: database                          | [models](apps/api/src/db/models) and [bootstrap.ts](apps/api/src/db/bootstrap.ts), which applies the `$jsonSchema` validators and the indexes. One index is a partial unique index that stops two active claims on one offer.                                                                                                                                                                              |
| Back end: APIs                              | [packages/contract/src/routes.ts](packages/contract/src/routes.ts) lists every endpoint with its role and schemas. [apps/api/src/routes](apps/api/src/routes) and [controllers](apps/api/src/controllers) serve them, and [errors.ts](apps/api/src/errors.ts) defines the one error shape.                                                                                                                 |
| Back end: API document                      | [docs/openapi.json](docs/openapi.json) is the OpenAPI 3.1 description of every endpoint.                                                                                                                                                                                                                                                                                                                   |
| Back end: security                          | [middleware](apps/api/src/middleware) covers sessions, CSRF, role and ownership guards, rate limits and security headers. [denial-matrix.test.ts](apps/api/test/integration/denial-matrix.test.ts) checks every route against every kind of caller. [docs/security/PENETRATION-TEST.md](docs/security/PENETRATION-TEST.md) is the penetration test of staging, and the `zap` workflow reruns its ZAP scan. |
| Back end: data flow and logic               | [claim-service.ts](apps/api/src/services/claim-service.ts) is the claim lock. [expiry-service.ts](apps/api/src/services/expiry-service.ts), [handover-service.ts](apps/api/src/services/handover-service.ts) and [meals.ts](apps/api/src/services/meals.ts) cover the rest of the flow.                                                                                                                    |
| Hosting                                     | [Why this hosting](#why-this-hosting), [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md), [netlify.toml](netlify.toml) and [render.yaml](render.yaml).                                                                                                                                                                                                                                                          |
| GitHub: branching                           | `git log --graph --first-parent develop` shows feature branches merged with `--no-ff`, releases into `main`, and the tags `v0.1.0`, `v0.2.0` and `v1.0.0`. [CONTRIBUTING.md](CONTRIBUTING.md) and [CHANGELOG.md](CHANGELOG.md) describe the workflow.                                                                                                                                                      |
| GitHub: CI/CD                               | [.github/workflows](.github/workflows): `ci.yml` runs on every push, `staging.yml` deploys `develop`, and `deploy.yml` runs CI on `main` and deploys production only if it passes. [Dependabot](.github/dependabot.yml) is on.                                                                                                                                                                             |
| Front end: design and feedback              | [apps/web/src/styles/tokens.css](apps/web/src/styles/tokens.css) has the design tokens. [components/feedback](apps/web/src/components/feedback) is the shared loading, empty, error, success and confirmation kit. Its own README describes it.                                                                                                                                                            |
| Front end: accessibility and responsiveness | [docs/accessibility](docs/accessibility/README.md) records the axe results, the target sizes and the keyboard checks, with screenshots. The `accessibility` job in `ci.yml` runs axe on every screen for every role at 360 and 1280 px.                                                                                                                                                                    |
| Requirements                                | [docs/TRACEABILITY.md](docs/TRACEABILITY.md) matches every user story and non-functional requirement to its endpoints, screens and tests, with an honest status.                                                                                                                                                                                                                                           |
| Presentation                                | The video linked at the top of this file.                                                                                                                                                                                                                                                                                                                                                                  |

## Architecture

```mermaid
flowchart LR
  Browser --> Netlify["Netlify: web app, /api rewrite"]
  Netlify --> API["Render: Express API"]
  API --> Atlas[("MongoDB Atlas, Cape Town")]
  API --> Cloudinary["Cloudinary: photos"]
  API --> Push["Web push"]
  Jobs["Render cron: sweeps and certificates"] --> Atlas
  Jobs --> Cloudinary
```

| Path                | What it is                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`          | React 19, Vite and TypeScript web app                                                        |
| `apps/api`          | Express 5 and Mongoose API with the expiry and retention sweeps                              |
| `apps/jobs`         | The cron entry point: the expiry sweep, photo retention at 02:00 and certificates on the 1st |
| `packages/contract` | zod schemas for requests and responses that the web app and the API share                    |

The browser calls the API on its own origin through a Netlify `/api` rewrite.
Sessions are cookies stored in MongoDB, and every state-changing request needs a CSRF token.

## Why this hosting

- **Netlify** serves the static web app from a CDN.
  Its rewrite keeps the browser and the API on one origin, so cookies and CSRF work without cross-site settings.
- **Render** runs the production API as a plain Node service on the `0.5c-512mb` compute plan (formerly Starter), in Frankfurt.
  A paid plan never sleeps (NFR08).
  The first request answers at once.
- **A Render cron service** runs `apps/jobs` every five minutes against the production database.
  It expires overdue offers and claims, deletes handover photos past their retention period at 02:00, and issues the previous month's tax certificates on the 1st.
  These run on time when nobody is using the app, and a long job never slows a request.
- **Staging** stays on Render's free plan, which sleeps after about 15 minutes idle and has no cron jobs.
  Its API runs the sweeps on timers while it is awake, as a local API does.
- **MongoDB Atlas** stores the data in Cape Town.
  The API processes it in Frankfurt, a cross-border transfer that POPIA section 72 allows.
- **Cloudinary** stores offer and handover photos, and the database keeps only their addresses.
  Lists load small thumbnails.
- Staging and production are separate: separate databases, Render services, Netlify sites and Cloudinary folders.

## API

Every endpoint, with its role and schemas, is in [packages/contract/src/routes.ts](packages/contract/src/routes.ts).
All paths start with `/api`.

| Area            | Endpoints                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health and CSRF | `GET /health`, `GET /auth/csrf`                                                                                                                             |
| Accounts        | `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /me`, `PATCH /me`, `POST /me/password`                                                           |
| Push            | `GET /push/public-key`, `POST` and `DELETE /me/push-subscriptions`                                                                                          |
| Organisations   | `GET` and `PATCH /organisations/me`, `GET /organisations`, `GET /organisations/:id`, `POST /organisations/:id/verification`, `PUT /organisations/:id/notes` |
| Offers          | `POST` and `GET /offers`, `GET /offers/:id`, `POST /offers/:id/cancel`                                                                                      |
| Claims          | `POST /offers/:id/claim`, `GET /claims`, `POST /claims/:id/release`                                                                                         |
| Dispatch        | `POST /claims/:id/collection`, `PATCH /collections/:id`, `PUT /collections/:id/driver-link`                                                                 |
| Driver page     | `GET /driver-collections/:token`, public                                                                                                                    |
| Handover        | `POST /offers/:id/handover/donor-confirm`, `/handover/recipient-confirm`, `GET /handovers`, `POST /handovers/:id/resolution`, `GET /handovers/:id/photo`    |
| Notifications   | `GET /notifications`, `POST /notifications/:id/read`                                                                                                        |
| Reports         | `GET /reports/impact`, `/reports/outcomes`, `/reports/export`                                                                                               |
| Certificates    | `GET` and `PUT /valuation-rates`, `POST` and `GET /tax-certificates`, `GET /tax-certificates/:id/pdf`                                                       |
| Users           | `GET` and `POST /users`, `PATCH /users/:id`, `GET /audit-log`                                                                                               |
| Twilio          | `POST /webhooks/twilio/inbound`, `/webhooks/twilio/status`                                                                                                  |
| Documentation   | `GET /openapi.json`                                                                                                                                         |

Errors share one shape, which the contract package defines.

### OpenAPI document

[docs/openapi.json](docs/openapi.json) describes every endpoint as an OpenAPI 3.1 document.
The running API serves the same document at `/api/openapi.json`, for example https://fedsa-mogi.netlify.app/api/openapi.json.
It is generated from the contract, and `npm run openapi` regenerates it.
`npm run openapi:check` fails when the file is out of date.

To read it in a viewer, open https://editor.swagger.io and choose File, then Import file, then select `docs/openapi.json`.
For a static page, run `npx @redocly/cli@2.62.1 build-docs docs/openapi.json`.

## Demo accounts

Seeded on staging.
The password is Abc#1234567.

| Role          | Name                               | Email                       |
| ------------- | ---------------------------------- | --------------------------- |
| Donor         | Riaan de Villiers, Ouma's Bakery   | `riaan@oumasbakery.example` |
| Recipient     | Nosipho Dlamini, Siyakhula Shelter | `nosipho@siyakhula.example` |
| Coordinator   | Nadia Petersen                     | `nadia@fedsa.example`       |
| Administrator | Zanele Booi                        | `zanele@fedsa.example`      |

The other seeded people are in [apps/api/src/seed/scenario.ts](apps/api/src/seed/scenario.ts).

## Running it locally

Node 22 LTS (see `.nvmrc`).
Copy `apps/api/.env.example` to `apps/api/.env` and fill in `MONGODB_URI` and `SESSION_SECRET`.
Transactions need a MongoDB replica set, so use Atlas or a local replica set.
Then, from the repository root:

```sh
npm install
npm run dev -w apps/api
npm run seed -w apps/api -- --env=test
npm run dev -w apps/web
```

Each `dev` command keeps running in its own terminal.
The web app calls the API through `/api`, which the development server forwards to `localhost:3000`.
Every environment variable is listed in [docs/ENVIRONMENTS.md](docs/ENVIRONMENTS.md).

To look around without a backend, start the web app on the built-in demo data instead:

```sh
VITE_DATA=fake npm run dev -w apps/web
```

A banner on every screen says the data is for demonstration and that nothing is saved.
Reloading the page puts the demo data back as it was.

## Tests

```sh
npm run check              # lint, type check and unit tests
npm run test:integration   # API against an in-memory replica set
npm run test:contract      # every endpoint's responses against the contract
npm run test:a11y -w apps/web   # axe on every screen for every role, at 360 and 1280 px
```

CI runs all of them on every push, except the accessibility audit, which runs only when a push changes the web app or the contract.
The integration tests include the 20-way claim race, expiry running exactly once, and the dual handover.

## Languages

English, Afrikaans and isiXhosa.
The isiXhosa text has not yet been reviewed by a first-language speaker.

## Known limits

- SMS and WhatsApp delivery is built and tested but was not sent live, because the Twilio trial account refused every message.
  Web push and the in-app inbox are the live channels.
  After a driver is dispatched, the app fills in the driver's text for the coordinator to send from their own WhatsApp or email, or to copy.
  The text ends with a link to a read-only page for that collection, at `/c/<token>`, which needs no sign-in.
  The browser makes the token and the API stores only its hash.
  The link stops working when the collection is completed or cancelled, when the claim is no longer active, and 24 hours after the collection deadline, and *Share again* replaces it.
  Netlify and Render record the link's path in their own access logs.
- Not built: offline queueing of forms, PDF export of reports, a coordinator override of a claim, and a production WhatsApp sender.

## Team

Mogi Group: J. Fanner, L. Manley, X. Bruwer, N. Mukaddam and A. Hussein.
See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching workflow.
