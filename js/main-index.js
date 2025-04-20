import { initializeStore } from './store.js';
import { initPasswordProtection } from './password.js';
initializeStore();
initPasswordProtection();
import './ui.js';
import './app.js';

document.addEventListener('DOMContentLoaded', () => {
    initializeStore();
    initPasswordProtection();
});
