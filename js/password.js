// js/password.js - Password protection logic

"use strict";

/**
 * Checks if password protection is enabled via environment variable.
 * Relies on `window.__ENV__.PASSWORD` being injected by middleware.
 * @returns {boolean} True if password protection is active.
 */
function isPasswordProtected() {
    // Check for the injected environment variable object and the PASSWORD property
    const pwdHash = window.__ENV__?.PASSWORD;

    // Protection is enabled if the hash is a non-empty string (assuming SHA-256 length)
    // and not just placeholder zeros (if middleware fails gracefully).
    return typeof pwdHash === 'string' && pwdHash.length === 64 && !/^0+$/.test(pwdHash);
}

/**
 * Checks if the user has successfully verified the password within the TTL.
 * Reads verification status and timestamp from localStorage.
 * @returns {boolean} True if verified and within TTL.
 */
function isPasswordVerified() {
    // If protection isn't enabled, verification is not needed.
    if (!isPasswordProtected()) {
        return true;
    }

    try {
        const storedData = localStorage.getItem(PASSWORD_CONFIG.localStorageKey);
        if (!storedData) {
            return false; // No verification data found
        }

        const verificationData = JSON.parse(storedData);
        const { verified, timestamp } = verificationData;

        // Check if verified flag is true and timestamp exists
        if (verified && timestamp) {
            const now = Date.now();
            const expiryTime = timestamp + PASSWORD_CONFIG.verificationTTL;
            // Return true only if current time is before the expiry time
            return now < expiryTime;
        }

        return false; // Data exists but is invalid or verification failed previously
    } catch (error) {
        console.error('Error reading password verification status from localStorage:', error);
        // In case of storage error, assume not verified for security
        return false;
    }
}

// Expose check functions globally if needed by other scripts (like app.js)
window.isPasswordProtected = isPasswordProtected;
window.isPasswordVerified = isPasswordVerified;

/**
 * Verifies the entered password against the stored hash.
 * Saves verification status to localStorage upon success.
 * @param {string} password - The password entered by the user.
 * @returns {Promise<boolean>} True if the password is correct.
 */
async function verifyPassword(password) {
    if (!password) return false; // Empty password cannot be correct

    const correctHash = window.__ENV__?.PASSWORD;
    // If no hash is set (protection disabled), this function shouldn't be called,
    // but handle defensively.
    if (!correctHash || correctHash.length !== 64) {
        console.warn("Password hash not available or invalid for verification.");
        return false;
    }

    try {
        // Use the globally available sha256 function (ensure sha256.js is loaded)
        if (typeof window.sha256 !== 'function') {
             console.error("SHA-256 function not found. Make sure sha256.js is loaded.");
             return false;
        }
        const inputHash = await window.sha256(password);
        const isValid = inputHash === correctHash;

        if (isValid) {
            // Save verification status and current timestamp to localStorage
            const verificationData = {
                verified: true,
                timestamp: Date.now()
            };
            try {
                localStorage.setItem(PASSWORD_CONFIG.localStorageKey, JSON.stringify(verificationData));
                console.log("Password verification successful. Status saved.");
            } catch (storageError) {
                console.error('Failed to save password verification status to localStorage:', storageError);
                // Verification still considered successful for this session, but might fail on refresh if storage fails
            }
        } else {
            console.warn("Password verification failed.");
            // Optionally clear any existing invalid verification data
            // localStorage.removeItem(PASSWORD_CONFIG.localStorageKey);
        }
        return isValid;

    } catch (error) {
        console.error('Error during password hashing or verification:', error);
        return false;
    }
}

// --- UI Interaction Functions ---

/**
 * Shows the password modal dialog.
 */
function showPasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    if (passwordModal) {
        passwordModal.style.display = 'flex'; // Use flex to center content
        // Autofocus the input field for better UX
        setTimeout(() => passwordInput?.focus(), 100); // Small delay ensure modal is visible
        hidePasswordError(); // Hide any previous error message
    } else {
        console.error("Password modal element not found.");
    }
}
// Expose globally if called directly from HTML onclick
window.showPasswordModal = showPasswordModal;


/**
 * Hides the password modal dialog.
 */
function hidePasswordModal() {
    const passwordModal = document.getElementById('passwordModal');
    if (passwordModal) {
        passwordModal.style.display = 'none';
    }
}

/**
 * Shows the password error message within the modal.
 */
function showPasswordError() {
    const errorElement = document.getElementById('passwordError');
    if (errorElement) {
        errorElement.classList.remove('hidden');
    }
}

/**
 * Hides the password error message within the modal.
 */
function hidePasswordError() {
    const errorElement = document.getElementById('passwordError');
    if (errorElement) {
        errorElement.classList.add('hidden');
    }
}

/**
 * Handles the password submission logic.
 * Called when the user clicks the submit button or presses Enter.
 */
async function handlePasswordSubmit() {
    const passwordInput = document.getElementById('passwordInput');
    const password = passwordInput ? passwordInput.value : ''; // Get value safely

    // Basic check: prevent submission if input is missing (shouldn't happen)
    if (!passwordInput) {
         console.error("Password input element not found during submission.");
         return;
    }

    // Add a temporary loading/disabling state to the button? (Optional UX)
    const submitButton = document.getElementById('passwordSubmitBtn');
    if (submitButton) submitButton.disabled = true;

    if (await verifyPassword(password)) {
        hidePasswordError();
        hidePasswordModal();
        // Optional: Reload or trigger an action if needed after verification
        console.log("Password verified, access granted.");
        // Example: If verification unlocks specific content dynamically:
        // if(typeof onPasswordVerified === 'function') onPasswordVerified();
    } else {
        showPasswordError();
        passwordInput.value = ''; // Clear the input on failure
        passwordInput.focus();    // Re-focus for retry
    }

     if (submitButton) submitButton.disabled = false; // Re-enable button
}

/**
 * Initializes the password protection system on page load.
 * Checks protection status and verification status, shows modal if needed.
 */
function initPasswordProtection() {
    // Only proceed if password protection is actually enabled
    if (!isPasswordProtected()) {
        console.log("Password protection is not enabled.");
        return;
    }

    console.log("Password protection enabled. Checking verification status...");

    // If already verified and valid, do nothing.
    if (isPasswordVerified()) {
        console.log("Password already verified and valid.");
        return;
    }

    // If not verified, show the modal and set up listeners.
    console.log("Password not verified or expired. Showing verification modal.");
    showPasswordModal();

    // Ensure listeners are attached only once, or attach them here if modal is dynamically added
    const submitButton = document.getElementById('passwordSubmitBtn');
    const passwordInput = document.getElementById('passwordInput');

    if (submitButton && passwordInput) {
        // Remove potential previous listeners before adding new ones
        submitButton.removeEventListener('click', handlePasswordSubmit);
        passwordInput.removeEventListener('keypress', handlePasswordInputKeypress);

        // Add listeners
        submitButton.addEventListener('click', handlePasswordSubmit);
        passwordInput.addEventListener('keypress', handlePasswordInputKeypress);
    } else {
        console.error("Password modal submit button or input field not found during init.");
    }
}

/**
 * Handles keypress events on the password input (for Enter key submission).
 * @param {KeyboardEvent} e The keyboard event.
 */
function handlePasswordInputKeypress(e) {
    if (e.key === 'Enter') {
        e.preventDefault(); // Prevent default form submission if it's in a form
        handlePasswordSubmit();
    }
}


// --- SHA-256 Function ---
// Ensure this function is available globally or imported correctly
// It's assumed sha256.js provides `window.sha256` or this script imports it.
// Example using Web Crypto API (should match sha256.js)
if (typeof window.sha256 !== 'function') {
    window.sha256 = async function(message) {
        try {
            const msgBuffer = new TextEncoder().encode(message);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            return hashHex;
        } catch (error) {
            console.error("SHA-256 Hashing failed:", error);
            throw error; // Re-throw the error to be handled by the caller
        }
    };
}


// --- Initialization Trigger ---
// Initialize after the DOM is fully loaded.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPasswordProtection);
} else {
    // DOMContentLoaded has already fired
    initPasswordProtection();
}
