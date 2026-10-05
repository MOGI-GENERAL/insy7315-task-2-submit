/* ROUTE TABLE — CLIENT-SIDE ROLE GUARDS (NOT A SUBSTITUTE FOR SERVER AUTH) */

import { Route, Routes } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ComponentType, ReactElement } from 'react';
import type { Role } from '@fedsa/contract';

import { CHANGE_PASSWORD_PATH } from './auth/context';
import { Landing, RequireRole, SignedOutOnly } from './auth/guards';
import { AppShell } from './components/AppShell';
import { Loading } from './components/feedback';

import { Login } from './routes/Login';
import { PENDING_PATH, PRIVACY_PATH, REGISTER_PATH } from './routes/account/paths';

/** each role's screens come from one module and download as one chunk */
function lazyScreen<M>(load: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await load())[name] as ComponentType }));
}

const common = () => import('./routes/screens');
const Notifications = lazyScreen(common, 'Notifications');
const ChangePassword = lazyScreen(common, 'ChangePassword');
const PendingVerification = lazyScreen(common, 'PendingVerification');
const PrivacyNotice = lazyScreen(common, 'PrivacyNotice');
const Register = lazyScreen(common, 'Register');

const donor = () => import('./routes/donor/screens');
const DonorHome = lazyScreen(donor, 'DonorHome');
const PostOffer = lazyScreen(donor, 'PostOffer');
const OfferPosted = lazyScreen(donor, 'OfferPosted');
const DonorOfferDetail = lazyScreen(donor, 'DonorOfferDetail');
const DonorHandover = lazyScreen(donor, 'DonorHandover');
const DonorCertificates = lazyScreen(donor, 'DonorCertificates');

const recipient = () => import('./routes/recipient/screens');
const OfferFeed = lazyScreen(recipient, 'OfferFeed');
const OfferDetail = lazyScreen(recipient, 'OfferDetail');
const ClaimConfirm = lazyScreen(recipient, 'ClaimConfirm');
const MyClaims = lazyScreen(recipient, 'MyClaims');
const ReleaseClaim = lazyScreen(recipient, 'ReleaseClaim');
const ScheduledOffers = lazyScreen(recipient, 'ScheduledOffers');
const RecipientHandover = lazyScreen(recipient, 'RecipientHandover');
const RecipientProfile = lazyScreen(recipient, 'RecipientProfile');

const coordinator = () => import('./routes/coordinator/screens');
const Dashboard = lazyScreen(coordinator, 'Dashboard');
const Dispatch = lazyScreen(coordinator, 'Dispatch');
const VerifyOrganisations = lazyScreen(coordinator, 'VerifyOrganisations');
const CapacityNotes = lazyScreen(coordinator, 'CapacityNotes');
const ResolveDisputes = lazyScreen(coordinator, 'ResolveDisputes');

const admin = () => import('./routes/admin/screens');
const ReportsHome = lazyScreen(admin, 'ReportsHome');
const KgMealReport = lazyScreen(admin, 'KgMealReport');
const ClaimedExpired = lazyScreen(admin, 'ClaimedExpired');
const ExportReport = lazyScreen(admin, 'ExportReport');
const AdminCertificates = lazyScreen(admin, 'AdminCertificates');
const ManageAccounts = lazyScreen(admin, 'ManageAccounts');

function Guard({ allow, children }: { allow: Role; children: ReactElement }) {
  return (
    <RequireRole allow={allow}>
      <AppShell>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </AppShell>
    </RequireRole>
  );
}

function AnyRole({ children }: { children: ReactElement }) {
  return (
    <RequireRole>
      <AppShell>
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </AppShell>
    </RequireRole>
  );
}

/** for the signed-out screens, which have no shell around them */
function Lazy({ children }: { children: ReactElement }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <SignedOutOnly>
            <Login />
          </SignedOutOnly>
        }
      />
      {/* not behind SignedOutOnly, which would send a new recipient past the waiting screen */}
      <Route path={REGISTER_PATH} element={<Lazy><Register /></Lazy>} />
      <Route path={PRIVACY_PATH} element={<Lazy><PrivacyNotice /></Lazy>} />
      <Route
        path={CHANGE_PASSWORD_PATH}
        element={
          <AnyRole>
            <ChangePassword />
          </AnyRole>
        }
      />

      <Route
        path="/notifications"
        element={
          <AnyRole>
            <Notifications />
          </AnyRole>
        }
      />

      {/* DONOR */}
      <Route path="/donor" element={<Guard allow="donor"><DonorHome /></Guard>} />
      <Route path="/donor/post" element={<Guard allow="donor"><PostOffer /></Guard>} />
      <Route path="/donor/posted" element={<Guard allow="donor"><OfferPosted /></Guard>} />
      <Route path="/donor/offers/:offerId" element={<Guard allow="donor"><DonorOfferDetail /></Guard>} />
      <Route path="/donor/offers/:offerId/handover" element={<Guard allow="donor"><DonorHandover /></Guard>} />
      <Route path="/donor/certificates" element={<Guard allow="donor"><DonorCertificates /></Guard>} />

      {/* RECIPIENT */}
      <Route path="/recipient" element={<Guard allow="recipient"><OfferFeed /></Guard>} />
      <Route path="/recipient/offers/:offerId" element={<Guard allow="recipient"><OfferDetail /></Guard>} />
      <Route path="/recipient/offers/:offerId/claim" element={<Guard allow="recipient"><ClaimConfirm /></Guard>} />
      <Route path="/recipient/claims" element={<Guard allow="recipient"><MyClaims /></Guard>} />
      <Route path="/recipient/claims/:claimId/release" element={<Guard allow="recipient"><ReleaseClaim /></Guard>} />
      <Route path="/recipient/scheduled" element={<Guard allow="recipient"><ScheduledOffers /></Guard>} />
      <Route path="/recipient/offers/:offerId/handover" element={<Guard allow="recipient"><RecipientHandover /></Guard>} />
      <Route path="/recipient/profile" element={<Guard allow="recipient"><RecipientProfile /></Guard>} />
      <Route path={PENDING_PATH} element={<Guard allow="recipient"><PendingVerification /></Guard>} />

      {/* COORDINATOR */}
      <Route path="/coordinator" element={<Guard allow="coordinator"><Dashboard /></Guard>} />
      <Route path="/coordinator/dispatch" element={<Guard allow="coordinator"><Dispatch /></Guard>} />
      <Route path="/coordinator/verify" element={<Guard allow="coordinator"><VerifyOrganisations /></Guard>} />
      <Route path="/coordinator/organisations" element={<Guard allow="coordinator"><CapacityNotes /></Guard>} />
      <Route path="/coordinator/disputes" element={<Guard allow="coordinator"><ResolveDisputes /></Guard>} />

      {/* ADMIN */}
      <Route path="/admin" element={<Guard allow="administrator"><ReportsHome /></Guard>} />
      <Route path="/admin/kg-meals" element={<Guard allow="administrator"><KgMealReport /></Guard>} />
      <Route path="/admin/claimed-expired" element={<Guard allow="administrator"><ClaimedExpired /></Guard>} />
      <Route path="/admin/export" element={<Guard allow="administrator"><ExportReport /></Guard>} />
      <Route path="/admin/certificates" element={<Guard allow="administrator"><AdminCertificates /></Guard>} />
      <Route path="/admin/accounts" element={<Guard allow="administrator"><ManageAccounts /></Guard>} />

      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
