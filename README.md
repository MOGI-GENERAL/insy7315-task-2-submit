# FEDSA Prototype

FEDSA PWA prototype

## Run

1. Clone the repository
1. Change directory into the repository
1. Run `npm install` 
1. Run `npm run dev`
1. Access the website at its local address
1. Preferrably switch to mobile view in the browser debug menu
1. Navigate the application as desired

## Screens

### General
- **Login** - Role-based sign-in that lands each user on their role's home screen.
- **Notifications** - Shared notification feed available to any signed-in role.

### Donor
- **Donor Home** - Donor's dashboard for their posted food offers.
- **Post Offer** - Form to create a new food donation offer.
- **Offer Posted** - Confirmation screen shown after successfully posting an offer.
- **Donor Offer Detail** - Detail view of a single offer from the donor's side.
- **Donor Handover** - Handover flow for a donor completing a claimed pickup.
- **Donor Certificates** - Donor's list of earned donation certificates.

### Recipient
- **Offer Feed** - Browsable feed of available food offers for recipients.
- **Offer Detail** - Detail view of a single offer from the recipient's side.
- **Claim Confirm** - Confirmation step for claiming an offer.
- **My Claims** - Recipient's list of active and past claims.
- **Release Claim** - Flow to release a claim the recipient can no longer fulfill.
- **Scheduled Offers** - Recipient's view of upcoming scheduled pickups.
- **Recipient Handover** - Handover flow for a recipient collecting a claimed offer.
- **Recipient Profile** - Recipient's account/organisation profile settings.

### Coordinator
- **Dashboard** - Coordinator's overview of ongoing activity.
- **Dispatch** - Screen for coordinating pickup/delivery dispatch.
- **Verify Organisations** - Review and approval queue for new organisations.
- **Capacity Notes** - Organisation capacity notes managed by the coordinator.
- **Resolve Disputes** - Queue for resolving disputes between donors and recipients.

### Admin
- **Reports Home** - Landing page for admin reporting tools.
- **Kg/Meals Report** - Report on kilograms of food and meals distributed.
- **Claimed/Expired Report** - Report breaking down claimed vs. expired offers.
- **Export Report** - Data export tool for reports.
- **Admin Certificates** - Admin view of all issued donation certificates.
- **Manage Accounts** - User/account management for administrators.

## Translation

i18n translations are machine translated and are not checked. For demonstration purposes only.