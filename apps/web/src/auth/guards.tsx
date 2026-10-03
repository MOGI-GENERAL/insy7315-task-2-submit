import { Navigate, useLocation } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { Role } from '@fedsa/contract';
import { ErrorState, Loading } from '../components/feedback';
import { CHANGE_PASSWORD_PATH, roleHome, useAuth } from './context';

function Pending() {
  const { state, refresh } = useAuth();
  return (
    <div className="page-pending">
      {state.status === 'error' ? <ErrorState error={state.error} retry={refresh} /> : <Loading />}
    </div>
  );
}

/** hides screens from the wrong role. the API still checks every request */
export function RequireRole({ allow, children }: { allow?: Role; children: ReactElement }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading' || state.status === 'error') return <Pending />;
  if (state.status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const { user } = state.session;
  if (user.mustChangePassword && location.pathname !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  if (allow && user.role !== allow) return <Navigate to={roleHome[user.role]} replace />;
  return children;
}

/** sign-in and registration. a signed-in visitor goes back where they were headed */
export function SignedOutOnly({ children }: { children: ReactElement }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading' || state.status === 'error') return <Pending />;
  if (state.status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? roleHome[state.session.user.role]} replace />;
  }
  return children;
}

export function Landing() {
  const { state } = useAuth();
  if (state.status === 'loading' || state.status === 'error') return <Pending />;
  if (state.status === 'signedOut') return <Navigate to="/login" replace />;
  return <Navigate to={roleHome[state.session.user.role]} replace />;
}
