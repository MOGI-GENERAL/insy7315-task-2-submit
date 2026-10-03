import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import './components/feedback/feedback.css';

import { AppProvider } from './store/AppProvider';
import { createStore } from './store/store';
import { createDataLayer } from './data';
import { DataProvider } from './data/DataProvider';
import { LanguageProvider } from './i18n/LanguageProvider';
import { ToastProvider } from './components/feedback';
import { AuthProvider } from './auth/AuthProvider';
import { App } from './App';

const store = createStore();
const data = createDataLayer(store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <DataProvider data={data}>
          <AppProvider store={store}>
            <ToastProvider>
              <AuthProvider>
                <App />
              </AuthProvider>
            </ToastProvider>
          </AppProvider>
        </DataProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
);
