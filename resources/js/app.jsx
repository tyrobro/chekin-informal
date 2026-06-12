import './bootstrap.js';
import React from 'react';
import { createRoot } from 'react-dom/client';

// 1. Import the root component
import App from '../../src/App.jsx'; 

// 2. Import the AuthProvider required by App.jsx
// (If AuthProvider is a default export rather than named, remove the curly braces here)
import { AuthProvider } from '../../src/context/AuthContext.jsx'; 

const rootElement = document.getElementById('root');

if (rootElement) {
    createRoot(rootElement).render(
        <React.StrictMode>
            <AuthProvider>
                <App />
            </AuthProvider>
        </React.StrictMode>
    );
}