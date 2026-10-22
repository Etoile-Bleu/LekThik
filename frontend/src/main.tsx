import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
// Fonts are bundled with the app, not fetched from another company, so opening LekThik sends
// nobody's address to a font server. The browser only downloads the parts it needs.
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './index.css';
import './ui/styles/ui.css';
import './ui/styles/themes.css';
import './ui/styles/access.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
