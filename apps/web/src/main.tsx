import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import '@fontsource-variable/inter';
import '@fontsource-variable/figtree';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

import { AppProvider } from './store/AppProvider';
import { createStore } from './store/store';
import { createDataLayer } from './data';
import { DataProvider } from './data/DataProvider';
import { App } from './App';

const store = createStore();
const data = createDataLayer(store);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DataProvider data={data}>
        <AppProvider store={store}>
          <App />
        </AppProvider>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
);
