import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { AppProvider } from './store/AppProvider';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
