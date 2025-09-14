import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/globals.css';

const OWNER_KEY = import.meta.env.VITE_OWNER_KEY || 'LAWNOWNER2025';

window.enterAdmin = (pwd) => {
  if (pwd === OWNER_KEY) {
    localStorage.setItem('ownerKey', OWNER_KEY);
    console.log('%cAdmin mode enabled', 'color: green; font-weight: bold;');
    location.reload();
  } else {
    console.log('%cWrong password', 'color: red;');
  }
};
window.exitAdmin = () => {
  localStorage.removeItem('ownerKey');
  console.log('%cAdmin mode disabled', 'color: orange;');
  location.reload();
};

if (!localStorage.getItem('ownerKey')) {
  console.log('%cTip:', 'color:#0ea5e9;font-weight:bold;', `Run enterAdmin('${OWNER_KEY}') in the console to enable Admin UI.`);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
