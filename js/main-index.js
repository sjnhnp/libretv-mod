import { initializeStore } from './store.js';
import { initPasswordProtection } from './password.js';
import './ui.js';
import './app.js';

document.addEventListener('DOMContentLoaded', () => {
    initializeStore();
    initPasswordProtection();
});
