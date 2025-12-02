import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('Starting app initialization...');
console.log('Environment variables:', {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Missing',
  supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing'
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Could not find root element!');
  throw new Error("Could not find root element to mount to");
}

console.log('Root element found, creating React root...');
const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
console.log('App rendered successfully!');
