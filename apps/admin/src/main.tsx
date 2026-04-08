import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { initSupabase } from './lib/supabase';
import App from './App';
import './index.css';

// Initialize Supabase (from saved tenant config or env vars).
// If no config exists yet, the app still renders — login will handle it.
initSupabase().then(() => {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
});
