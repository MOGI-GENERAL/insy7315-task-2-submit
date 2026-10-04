# Changelog

Each release is merged into `main` and tagged, and the deploy workflow then puts it into production.

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
