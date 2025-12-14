import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

if (import.meta.env.DEV) {
  console.log('Starting app initialization...');
  console.log('Environment variables:', {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL ? 'Set' : 'Missing',
    supabaseKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'Set' : 'Missing'
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error('Could not find root element!');
  throw new Error("Could not find root element to mount to");
}

if (import.meta.env.DEV) console.log('Root element found, creating React root...');

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
  // Optional: Send to error reporting service
});

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
if (import.meta.env.DEV) console.log('App rendered successfully!');
