import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Loading } from './components/feedback';

// each in its own chunk. a driver's visit downloads neither the shell nor the screens
const DriverPage = lazy(async () => ({
  default: (await import('./routes/driver/DriverPage')).DriverPage,
}));
const SignedInApp = lazy(async () => ({
  default: (await import('./SignedInApp')).SignedInApp,
}));

export function Root() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/c/:token" element={<DriverPage />} />
        <Route path="*" element={<SignedInApp />} />
      </Routes>
    </Suspense>
  );
}
