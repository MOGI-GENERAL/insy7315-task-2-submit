# Accessibility and responsive checks

The web app targets WCAG 2.2 AA (NFR05) on phones from 360 px wide up to desktop.
This page records how every screen was checked on 5 October 2026, what the checks found, and what was fixed.

## How the screens were checked

All 30 screens were opened signed in as each role, on the built-in demo data (`VITE_DATA=fake`).

- **Widths.** Each screen was checked at 360, 768 and 1280 px, and at 640 px, which is a 1280 px window at 200% zoom.
- **Automated rules.** axe-core 4 ran the WCAG 2.0, 2.1 and 2.2 A and AA rules at 360 and 1280 px.
- **Sideways scrolling.** A screen fails if the page scrolls sideways at any width.
- **Target size.** Every link, button and form control was measured against 48 × 48 px, the size the app commits to.
  WCAG 2.2 asks for 24 px.
- **Focus.** Tab moved through every screen at 1280 px, 488 stops in all, and each stop was checked for a visible focus indicator.
- **Keyboard only.** Claiming an offer from the feed, confirming a handover as the donor and then as the recipient, and posting an offer were each done with the keyboard alone.
  The confirmation dialog keeps focus inside it until it closes.

## Results

| Check | Result |
|---|---|
| axe violations rated serious or critical | None on any screen |
| Sideways scrolling at 360, 768 and 1280 px and at 200% zoom | None |
| Targets smaller than 48 × 48 px | None. The photo picker's file input is hidden, and its visible label is the target |
| Visible focus at every tab stop | Yes. Date fields show the ring on the field, and chart bars take a dark outline |
| Keyboard-only claim, handover and posting | All complete without a mouse |
| Toasts read out by screen readers | Yes, through a polite live region |
| Languages | Every signed-in screen has the English, Afrikaans and isiXhosa picker in its header |

## Fixed in this pass

| Problem | Before | After |
|---|---|---|
| Warning and alert figures on the report and board tiles used the brand amber and red as text | 3.4:1 against white | Darker text colours, 6.0:1 and 6.5:1 |
| Notes on the coordinator board's to-do tiles were faded to 85% | 3.7:1 and 4.0:1 | Full strength, 4.9:1 and 5.2:1 |
| Disabled accounts were faded to 55% | As low as 2.4:1 | A dashed card on a darker background, at full strength. The status badge still says the account is disabled |
| Header controls (organisation link, language picker, notifications, account, sign out) at 360 px | 24 to 36 px | 48 px. Below 400 px the organisation name is hidden from view and still names the link for screen readers |
| Text links on sign-in and registration, and the headings of collapsible sections | Under 48 px tall | 48 px tall |

## Not covered by this pass

- A screen reader on a phone.
  Claiming an offer with TalkBack on Android needs a real device and was not part of this pass.
- Contrast inside photographs, which no automated rule can judge.

## Screenshots

| Screen | Phone (360 px) | Tablet (768 px) | Desktop (1280 px) |
|---|---|---|---|
| Recipient: offers | ![Offers on a phone](screenshots/recipient-feed-360.png) | ![Offers on a tablet](screenshots/recipient-feed-768.png) | ![Offers on a desktop](screenshots/recipient-feed-1280.png) |

| Screen | Screenshot |
|---|---|
| Recipient: offers in isiXhosa | ![Offers in isiXhosa on a phone](screenshots/recipient-feed-isixhosa-360.png) |
| Recipient: claim, with keyboard focus on the confirm button | ![Keyboard focus on the claim button](screenshots/claim-keyboard-focus-360.png) |
| Recipient: claim | ![Claim confirmation on a phone](screenshots/claim-confirm-360.png) |
| Donor: post an offer | ![Posting an offer on a phone](screenshots/post-offer-360.png) |
| Registration | ![Registration on a phone](screenshots/register-360.png) |
| Coordinator: operations board | ![The operations board on a desktop](screenshots/coordinator-board-1280.png) |
| Administrator: kilograms and meals report | ![The kilograms report on a desktop](screenshots/admin-report-1280.png) |
