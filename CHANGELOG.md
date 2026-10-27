# Changelog

Each release is merged into `main` and tagged, and the deploy workflow then puts it into production.

## 1.0.2 (2026-10-27)

Production stays awake, and scheduled work runs in its own service.

- **Hosting:** the production API is on a paid instance that never sleeps, so the first request no longer waits for a cold start.
- **Scheduled jobs:** a cron service runs the offer expiry sweep every five minutes, the photo retention sweep once a day at 02:00, and the monthly tax certificates on the 1st.
  The production API no longer runs the sweeps itself, while staging and the Docker stack still do.
- **Real data by default:** the web app talks to the API unless a build asks for demo data, and demo builds show a banner on every screen saying nothing is saved.
- **Monthly certificates:** every donor with eligible handovers gets the previous month's certificate in one run, and their users get a notification in English, Afrikaans or isiXhosa.
  A command issues a given month by hand.
- **OpenAPI:** the API publishes its OpenAPI 3.1 document at `/api/openapi.json`, built from the shared contract, and CI fails if the committed copy drifts.
- **Code structure:** the offer and notification services are split into smaller modules, with no change in behaviour.
- **Dependencies:** the npm audit advisories are fixed.

## 1.0.1 (2026-10-06)

Documentation only.

- **README:** a link to the presentation video, a link to the AI usage report, and a note on how the clips were recorded.
- **AI usage report:** added as `docs/ai-usage.pdf`.

## 1.0.0 (2026-10-06)

The first complete release.
Every screen runs on the real API, and the app can be installed from a browser.

- **Screens:** the inbox, releasing a claim, scheduled offers, the organisation profile and tax certificates now read from the API.
- **Installable app:** a web app manifest, an offline shell, a push opt-in after the first post or claim, and a 500 KB size check on the recipient feed.
- **Accessibility:** every screen was checked with axe at three widths and at 200% zoom.
  Contrast, target sizes and focus were fixed, and the results are in `docs/accessibility`.
- **Security tests:** a test checks every route against every kind of caller, and a missing token on any write.
- **Dialogs:** the confirmation dialogs are centred on the screen.
- **Documentation:** a README with the endpoint list and hosting reasons, and a table tracing each requirement to its endpoints, screens and tests.

## 0.2.0 (2026-10-05)

Handover, dispatch and the coordinator and admin screens are on the real API, and offers now expire on their own.

- **Photos:** stored in Cloudinary when `PHOTO_STORE=cloudinary`, with small thumbnails in lists, and deleted once their retention period ends.
- **Expiry:** an overdue offer and its claim expire every five minutes while the API is awake, and an expired claim cancels its dispatched driver.
  A released claim after the deadline no longer reopens the offer.
- **Handover:** both sides confirm a collection, a short collection offers the remainder, and either side can raise a dispute for a coordinator to resolve.
- **Dispatch:** a coordinator sends one collection's details to one driver.
- **Screens on the real API:** donor home and offer detail, both handover screens, the coordinator board, verification, capacity notes and disputes, the admin reports, account management with the audit log, tax certificates with valuation rates, registration with consent, and password changes.
- **Reports:** a CSV export of the impact report, written to open correctly in Excel with South African settings.
- **Twilio:** a recipient can claim by replying to an SMS or WhatsApp message, and delivery reports update the notification.

## 0.1.0 (2026-10-05)

The first production release.
Donors post surplus food and recipients claim it over the real API, and the screens not listed here still run on demo data.

- **Accounts:** sign-in with cookie sessions and CSRF tokens, role and ownership checks on every route, and password changes.
- **Offers:** posting with up to two photos resized on the phone, an eligibility feed filtered by distance, storage and capacity, scheduled offers, and cancelling.
- **Claims:** one claim per offer, which the database enforces, plus release and a list of the organisation's claims.
  A recipient can also claim by replying `YES <reference>` by SMS or WhatsApp.
- **Notifications:** an in-app inbox for every user, with web push, SMS and WhatsApp when they are configured, and delivery reports from Twilio.
- **Organisations and users:** profiles, the verification steps a coordinator takes, capacity notes, account management and an audit log.
- **Reports and certificates:** impact and outcome reports, valuation rates, and tax certificates issued as PDF.
- **Screens on the real API:** sign-in, post an offer, the feed, offer detail, claim, and my claims.
- **Hosting:** the web app on Netlify and the API on Render's free plan, with MongoDB Atlas in Cape Town.
  Every push to `develop` updates staging, and production deploys only from `main` after CI passes.
