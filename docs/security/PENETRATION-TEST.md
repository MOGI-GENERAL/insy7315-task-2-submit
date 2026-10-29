# Penetration test

A penetration test of the FEDSA staging deployment on 29 October 2026, against the OWASP Top 10 (2021).
It records what was tested, how, what each check returned, and what was fixed or accepted.

## Scope

|          |                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Date     | Thursday 29 October 2026, 11:00 to 14:30 SAST                                                                                                              |
| Build    | Commit `1044b56` on `develop`, as reported by `GET /api/health`                                                                                            |
| Web app  | https://fedsa-staging.netlify.app, including its `/api` rewrite                                                                                            |
| API      | The staging API through that rewrite, and directly at https://fedsa-api-staging.onrender.com, which is reachable from the internet because Twilio calls it |
| Accounts | The seeded demo accounts of every role, and one donor account registered for the test and disabled afterwards                                              |

Out of scope: production, the services FEDSA does not run (Netlify, Render, MongoDB Atlas, Cloudinary, Twilio), denial of service and load testing.
Staging runs the same code and configuration as production, apart from the plan it runs on and its own secrets and database.

## Method

1. We read the security middleware, the endpoint contract and the integration tests first, so each check had a stated expected result.
2. An automated passive scan with the OWASP ZAP baseline, which crawls the site and reports on what it sees without sending attacks.
3. Manual checks, one scripted request at a time and no more than one every 1.5 seconds.
   Each check records the request, the response status, and the header or body line that shows the result.
   Session cookies, CSRF tokens and passwords were redacted from the evidence.
4. `npm audit` over the whole dependency tree, then over the runtime dependencies alone.
5. Fixes, a test for each that fails without it, and a retest.

## Tools

| Tool                                 | Version                            | Used for                                                                               |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------- |
| OWASP ZAP, `zap-baseline.py`         | 2.17.0 (`ghcr.io/zaproxy/zaproxy`) | Passive baseline scan                                                                  |
| `zaproxy/action-baseline`            | v0.15.0                            | The same scan from GitHub Actions, in `.github/workflows/zap.yml`                      |
| Python `urllib` scripts              | Python 3.14.3                      | Manual checks, pacing and evidence                                                     |
| curl                                 | 8.16.0                             | Spot checks                                                                            |
| securityheaders.com                  | Live service                       | Header grading                                                                         |
| npm audit                            | npm 11.6.2                         | Known vulnerabilities in dependencies                                                  |
| Netlify CLI, `netlify dev --offline` | 27.10.2                            | Serving the build locally with the `netlify.toml` headers, to retest before deployment |

## Results

| #   | OWASP 2021 | Check                                                                                                                                     | Expected                         | Result                                                                                                                                                                                    |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A01        | Another donor reads, then cancels, an offer of a different organisation                                                                   | 404                              | Pass. 404 `NOT_FOUND` for both, while the owning donor reads it with 200                                                                                                                  |
| 2   | A01        | An unrelated recipient confirms receipt of that offer                                                                                     | 404                              | Pass. 404 `NOT_FOUND`                                                                                                                                                                     |
| 3   | A01        | Another recipient releases a claim of a different organisation                                                                            | 404                              | Pass. 404 `NOT_FOUND`. A donor gets 403 `FORBIDDEN` from the role check first                                                                                                             |
| 4   | A01        | An outsider requests a handover photo                                                                                                     | 404                              | Partial. Outsiders get 404 `NOT_FOUND`, but no staging handover still has a photo, so a 404 for the owner could not be told apart. `denial-matrix.test.ts` covers this route with a photo |
| 5   | A01        | Role checks: a donor lists users and exports reports, a recipient reads the audit log and sets valuation rates, a coordinator lists users | 403                              | Pass. 403 `FORBIDDEN` for all five                                                                                                                                                        |
| 6   | A01        | Signed-out requests to protected routes                                                                                                   | 401                              | Pass. 401 `UNAUTHENTICATED`                                                                                                                                                               |
| 7   | A01        | A missing, then a wrong, CSRF token on a state-changing request                                                                           | 403                              | Pass. 403 `CSRF_INVALID` for both, with and without a session. The right token reaches the route                                                                                          |
| 8   | A03        | `{"$gt": ""}` and `{"$ne": ""}` as the login email and password                                                                           | 400                              | Pass. 400 `VALIDATION_FAILED`, "expected string, received object"                                                                                                                         |
| 9   | A03        | Operators in query strings: `status[$ne]`, `resolved[$ne]`, `action[$regex]`, `view[$ne]`                                                 | Refused or ignored               | Pass. Unknown keys are dropped, so the first three return the unfiltered list. `view[$ne]` and a repeated `view` give 400                                                                 |
| 10  | A03        | An operator object as a path ID                                                                                                           | 400                              | Pass. 400, "Must be a 24-character hex id"                                                                                                                                                |
| 11  | A04        | `role`, `organisationId`, `status` and `mustChangePassword` sent to `PATCH /api/me`                                                       | Ignored                          | Pass. 200, and `GET /api/me` still shows `donor` and the same organisation                                                                                                                |
| 12  | A04        | Registration with `user.role: administrator` and `organisation.status: verified`                                                          | Ignored                          | Pass. 201 with role `donor` and the starting status for a donor. The account cannot reach the coordinator's `all` view or the organisation list (403)                                     |
| 13  | A04        | An HTML file sent as `image/jpeg`, and an SVG with a script sent as `image/png`                                                           | Refused                          | Pass. 422 `UPLOAD_REJECTED`, "Photos must be JPEG, PNG or WebP images". The type is read from the file's bytes                                                                            |
| 14  | A04        | A 5 MB + 20 byte photo, and three photos where two are allowed                                                                            | Refused                          | Pass. 422 `UPLOAD_REJECTED`, "Each photo must be 5 MB or smaller" and "Attach at most 2 photos"                                                                                           |
| 15  | A05        | Security headers on the web app                                                                                                           | Present                          | Pass. securityheaders.com grades it A+. CSP with `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy` and `Permissions-Policy`. See F2 and F3 for the cross-origin headers        |
| 16  | A05        | Security headers on API responses                                                                                                         | Present                          | Pass. Helmet's CSP, HSTS, `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, and no `X-Powered-By`                                                                 |
| 17  | A05        | CORS from another origin, simple and preflight                                                                                            | No CORS headers                  | Pass. No `Access-Control-Allow-Origin` on either                                                                                                                                          |
| 18  | A05        | Malformed JSON, a body over 100 kB, an unsupported charset, `TRACE`                                                                       | A plain 4xx                      | Pass. 400 "The request body is not valid JSON", 400 "The request body is too large", 401 and 405. No stack trace or internal detail                                                       |
| 19  | A05        | A 500 leaks no internal detail                                                                                                            | Bare `INTERNAL` error            | Pass. No input in this test produced a 500 on staging. `app.test.ts` throws inside a route and checks the response contains no stack and no host name                                     |
| 20  | A06        | `npm audit`                                                                                                                               | No runtime findings              | Pass with an accepted risk, F4                                                                                                                                                            |
| 21  | A07        | Session ID at sign-in                                                                                                                     | Changes                          | Pass. A different session ID after sign-in. The pre-sign-in ID answers 401 on `GET /api/me`, while the new one answers 200                                                                |
| 22  | A07        | Session ID after sign-out                                                                                                                 | Unusable                         | Pass. 204, then 401 with the old ID                                                                                                                                                       |
| 23  | A07        | Session cookie flags                                                                                                                      | `HttpOnly`, `Secure`, `SameSite` | Pass. `HttpOnly; Secure; SameSite=Lax`                                                                                                                                                    |
| 24  | A07        | An unknown email and a wrong password                                                                                                     | Same response                    | Pass. Both 401 "The email or password is not correct", in 3.2 to 4.7 s either way                                                                                                         |
| 25  | A07        | Sign-in rate limit: six wrong passwords for one email                                                                                     | 429 on the sixth                 | **Fail**, F1. Through the web app all six got 401. Directly against the API the sixth got 429, but a different forged `X-Forwarded-For` header on each attempt avoided it                 |
| 26  | A07        | A disabled account signs in                                                                                                               | 401                              | Pass. 401, the same message as a wrong password                                                                                                                                           |
| 27  | A08        | A Twilio webhook with no signature, and with a forged one                                                                                 | 403                              | Pass. 403 "The request is not signed by Twilio" on both webhooks, through the web app and directly                                                                                        |
| 28  | A05        | ZAP baseline                                                                                                                              | No high or medium alerts         | Pass. No high or medium alerts. Three low alerts, F2 and F3, and informational ones, F5                                                                                                   |

## Findings

### F1. The sign-in rate limit can be avoided

- Severity: medium
- OWASP 2021: A07 Identification and Authentication Failures
- Status: fixed.
  Retest on staging after deployment

The sign-in limit allows five failed attempts per client address and email address in 15 minutes.
The API works out the client address by trusting a fixed number of proxies in front of it.
Requests through the web app pass through more proxies than that number, so the API sees a Netlify address, which changes from request to request.
Requests sent directly to the API pass through fewer, so the address comes from an `X-Forwarded-For` header the client writes itself.

Evidence:

```text
POST https://fedsa-staging.netlify.app/api/auth/login   one email, attempts 1 to 6   401 each time
POST https://fedsa-api-staging.onrender.com/api/auth/login   one email, attempts 1 to 5   401
                                                         attempt 6   429 RATE_LIMITED
POST https://fedsa-api-staging.onrender.com/api/auth/login   one email, X-Forwarded-For: 203.0.113.10 to .16
                                                         attempts 1 to 7   401 each time
```

The registration limit and the per-address part of the general request limit use the same client address, so they are affected too.
Passwords are at least 10 characters and every attempt costs a bcrypt comparison, which slows guessing but does not stop it.
The limiters also kept their counts in memory, so a deploy or a restart reset them.

Fix, in three parts:

1. **Client address.** Netlify signs every request its `/api` rewrite forwards, with a secret shared with the API (`API_PROXY_SECRET`).
   The API takes the client address from Netlify's `x-nf-client-connection-ip` header only when the signature checks out.
   Otherwise it uses the address that connected to Render, and trusts Render's proxy alone, so a forged `X-Forwarded-For` no longer counts.
   With `API_PROXY_REQUIRED=true`, the API refuses unsigned requests except the Twilio webhooks and `/api/health`.
2. **Shared counts.** The sign-in and registration limiters keep their counts in MongoDB, so a restart no longer resets them.
3. **Limits that do not depend on the address.** A new limit allows 30 failed sign-ins in 15 minutes from one address, whatever the email.
   Failures on one email from any address delay the next attempt: from the 10th failure in 24 hours it waits 1 minute, each later failure doubles the wait up to 15 minutes, and a successful sign-in clears the count.
   Unknown emails count the same way, so the delay does not reveal whether an account exists.
   Anyone who knows an email can make that account wait up to 15 minutes, which we accept in exchange for stopping unlimited guessing.

Tests in `client-address.test.ts` and `auth.test.ts` cover a forged forwarded address, a forged or expired signature, the count surviving a restart, and the delay for a known and an unknown email.
Each fails without its part of the fix.

### F2. Cross-origin opener and resource policies missing on the web app

- Severity: low
- OWASP 2021: A05 Security Misconfiguration
- Status: fixed

ZAP reported `Cross-Origin-Opener-Policy` missing on the pages and `Cross-Origin-Resource-Policy` missing on the scripts and stylesheets (rule 90004).
Without them, a page on another site that opens the app in a window keeps a handle to it, and another site can load the app's files.

Fix: `netlify.toml` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin` on every path.
The app opens no cross-origin windows and is loaded by no other site.
`apps/web/src/netlify-headers.test.ts` checks these headers and the existing ones, and fails without the fix.

Retest: served locally with `netlify dev --offline`, both headers are present, and a ZAP baseline against it no longer reports either alert.
Staging is retested once the fix is deployed from `develop`.

### F3. Cross-origin embedder policy not set

- Severity: low
- OWASP 2021: A05 Security Misconfiguration
- Status: accepted

ZAP reported `Cross-Origin-Embedder-Policy` missing (rule 90004).
The header exists to enable cross-origin isolation, which the app does not use.
Setting it to `require-corp` would block the offer photos served from Cloudinary.

### F4. Prototype pollution in a build tool dependency

- Severity: low
- OWASP 2021: A06 Vulnerable and Outdated Components
- Status: accepted

`npm audit` reports four low findings, all from one advisory in `deepmerge` 4.3.1 (GHSA-gcqx-w48m-w2h4).
It arrives through `vite-plugin-pwa` 2.0.0, then `workbox-build` and `@rollup/plugin-node-resolve`.
`vite-plugin-pwa` is a development dependency that runs only while the web app is built, on our own configuration.
None of it reaches the browser or the API, and `npm audit --omit=dev` reports 0 vulnerabilities.
The only fix npm offers downgrades `vite-plugin-pwa` to 0.2.1, which would break the service worker.
Dependabot raises the update once a fixed `deepmerge` is published.

### F5. Informational

- **API content security policy.** Helmet's default `style-src` allows `'unsafe-inline'`, and `frame-ancestors` is `'self'` on API responses.
  The API serves only JSON and certificate PDFs, never HTML, so the policy has nothing to protect there.
  Accepted.
- **Version in the health check.** `GET /api/health` reports the deployed commit, and `GET /api/openapi.json` describes every endpoint.
  The source code is public, so neither tells an attacker anything new, and the commit is what the deploy checks read.
  Accepted.
- **ZAP informational alerts.** "Suspicious comments" matched the word `user` in minified router code, which is a false positive.
  The cache alerts are about the hashed files under `/assets`, which are meant to be cached for a year.
  "Modern web application" notes that the app is rendered by JavaScript.
  No action.

## Retest

| Check               | Before                                                                   | After                                                                     |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| F2, web app headers | Both headers absent on staging                                           | Both present on the local Netlify build. `netlify-headers.test.ts` passes |
| ZAP baseline        | 3 low, 5 informational on staging                                        | 1 low (F3), 4 informational on the local Netlify build                    |
| `npm run check`     |                                                                          | Passes                                                                    |
| F1, sign-in limits  | Never triggered through the web app. Forged header got round it directly | Pending, after deployment to staging with the secret set                  |

## Running the scan again

Run the `zap` workflow from the Actions tab.
It wakes the staging API, runs the baseline against the staging web app, and uploads the HTML, JSON and Markdown reports as the `zap-baseline` artifact.
It never targets production.
