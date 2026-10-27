import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import './components/feedback/feedback.css';

import { createDataLayer } from './data';
import { DataProvider } from './data/DataProvider';
import { LanguageProvider } from './i18n/LanguageProvider';
import { ToastProvider } from './components/feedback';
import { AuthProvider } from './auth/AuthProvider';
import { DemoDataBanner } from './components/DemoDataBanner';
import { App } from './App';

const data = await createDataLayer();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        {/* outside the routes for the signed-out screens too */}
        <DemoDataBanner />
        <DataProvider data={data}>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </DataProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
