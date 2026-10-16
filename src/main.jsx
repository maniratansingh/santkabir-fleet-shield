import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Developer Watermark & Provenance (Mani Ratan Singh • mrps.in)
if (typeof window !== 'undefined') {
  window.__MRPS_FLEET__ = {
    app: 'Sant Kabir Fleet Shield',
    version: '1.0.0',
    developer: 'Mani Ratan Singh',
    website: 'https://mrps.in',
    github: 'https://github.com/maniratansingh',
    hospital: 'Sant Kabir Eye Hospital (PIECS)',
  };

  console.log(
    '%c⚡ Sant Kabir Fleet Shield %c Engineered by Mani Ratan Singh (https://mrps.in)',
    'background: #0284c7; color: #fff; font-weight: bold; padding: 3px 8px; border-radius: 4px;',
    'color: #0284c7; font-weight: 600; padding: 3px;'
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
