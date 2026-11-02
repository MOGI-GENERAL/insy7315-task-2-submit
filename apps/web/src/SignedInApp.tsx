import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';

export function SignedInApp() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
