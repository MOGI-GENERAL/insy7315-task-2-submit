/* ROUTE TABLE — CLIENT-SIDE ROLE GUARDS (NOT A SUBSTITUTE FOR SERVER AUTH) */

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';

import { AppShell } from './components/AppShell';
import { useCurrentUser } from './store/context';
import type { Role } from './store/types';

import { Login } from './routes/Login';
import { Notifications } from './routes/Notifications';

import { DonorHome } from './routes/donor/DonorHome';
import { PostOffer } from './routes/donor/PostOffer';
import { OfferPosted } from './routes/donor/OfferPosted';
import { DonorOfferDetail } from './routes/donor/DonorOfferDetail';
import { DonorHandover } from './routes/donor/DonorHandover';
import { DonorCertificates } from './routes/donor/DonorCertificates';

import { OfferFeed } from './routes/recipient/OfferFeed';
import { OfferDetail } from './routes/recipient/OfferDetail';
import { ClaimConfirm } from './routes/recipient/ClaimConfirm';
import { MyClaims } from './routes/recipient/MyClaims';
import { ReleaseClaim } from './routes/recipient/ReleaseClaim';
import { ScheduledOffers } from './routes/recipient/ScheduledOffers';
import { RecipientHandover } from './routes/recipient/RecipientHandover';
import { RecipientProfile } from './routes/recipient/RecipientProfile';

import { Dashboard } from './routes/coordinator/Dashboard';
import { Dispatch } from './routes/coordinator/Dispatch';
import { VerifyOrganisations } from './routes/coordinator/VerifyOrganisations';
import { CapacityNotes } from './routes/coordinator/CapacityNotes';
import { ResolveDisputes } from './routes/coordinator/ResolveDisputes';

import { ReportsHome } from './routes/admin/ReportsHome';
import { KgMealReport } from './routes/admin/KgMealReport';
import { ClaimedExpired } from './routes/admin/ClaimedExpired';
import { ExportReport } from './routes/admin/ExportReport';
import { AdminCertificates } from './routes/admin/AdminCertificates';
import { ManageAccounts } from './routes/admin/ManageAccounts';

const roleHome: Record<Role, string> = {
  donor: '/donor',
  recipient: '/recipient',
  coordinator: '/coordinator',
  administrator: '/admin',
};

/* ROLE GUARD */
function Guard({ allow, children }: { allow: Role; children: ReactElement }) {
  const user = useCurrentUser();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== allow) return <Navigate to={roleHome[user.role]} replace />;

  return <AppShell>{children}</AppShell>;
}

function AnyRole({ children }: { children: ReactElement }) {
  const user = useCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function Landing() {
  const user = useCurrentUser();
  return <Navigate to={user ? roleHome[user.role] : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<LoginRoute />} />

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
      <Route path="/donor/handover/:claimId" element={<Guard allow="donor"><DonorHandover /></Guard>} />
      <Route path="/donor/certificates" element={<Guard allow="donor"><DonorCertificates /></Guard>} />

      {/* RECIPIENT */}
      <Route path="/recipient" element={<Guard allow="recipient"><OfferFeed /></Guard>} />
      <Route path="/recipient/offers/:offerId" element={<Guard allow="recipient"><OfferDetail /></Guard>} />
      <Route path="/recipient/offers/:offerId/claim" element={<Guard allow="recipient"><ClaimConfirm /></Guard>} />
      <Route path="/recipient/claims" element={<Guard allow="recipient"><MyClaims /></Guard>} />
      <Route path="/recipient/claims/:claimId/release" element={<Guard allow="recipient"><ReleaseClaim /></Guard>} />
      <Route path="/recipient/scheduled" element={<Guard allow="recipient"><ScheduledOffers /></Guard>} />
      <Route path="/recipient/handover/:claimId" element={<Guard allow="recipient"><RecipientHandover /></Guard>} />
      <Route path="/recipient/profile" element={<Guard allow="recipient"><RecipientProfile /></Guard>} />

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

function LoginRoute() {
  const user = useCurrentUser();
  if (user) return <Navigate to={roleHome[user.role]} replace />;
  return <Login />;
}
