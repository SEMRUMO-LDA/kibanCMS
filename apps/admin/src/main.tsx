import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initSupabase } from './lib/supabase';
import App from './App';
import './index.css';

// Initialize Supabase (fetches tenant config) before rendering
initSupabase()
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
      <React.StrictMode>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </React.StrictMode>
    );
  })
  .catch((err) => {
    document.getElementById('root')!.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui">
        <div style="text-align:center">
          <h1 style="font-size:1.5rem;margin-bottom:0.5rem">Configuration Error</h1>
          <p style="color:#666">${err.message}</p>
        </div>
      </div>
    `;
  });
