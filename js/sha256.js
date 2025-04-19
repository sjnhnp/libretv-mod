// js/sha256.js - Provides an asynchronous SHA-256 hashing function using Web Crypto API.

/**
 * Calculates the SHA-256 hash of a given string message.
 * Uses the browser's built-in Web Crypto API for security and performance.
 *
 * @param {string} message - The string message to hash.
 * @returns {Promise<string>} A promise that resolves with the SHA-256 hash as a hexadecimal string.
 * @throws {Error} If the Web Crypto API is unavailable or hashing fails.
 */
export async function sha256(message) {
    // Check if Web Crypto API is available
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) {
        console.error("Web Crypto API or TextEncoder not supported in this browser.");
        throw new Error("Cryptography features not supported.");
    }

    try {
        // Encode the string message into a Uint8Array
        const msgBuffer = new TextEncoder().encode(message);

        // Hash the message buffer using SHA-256
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

        // Convert the ArrayBuffer result to an array of bytes
        const hashArray = Array.from(new Uint8Array(hashBuffer));

        // Convert the byte array to a hexadecimal string
        const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

        return hashHex;
    } catch (error) {
        console.error("SHA-256 hashing failed:", error);
        // Re-throw the error for the caller to handle
        throw new Error(`SHA-256 hashing failed: ${error.message}`);
    }
}

// Make the function globally available if not using modules (e.g., in password.js)
// If using ES modules, the 'export' keyword is sufficient.
// For compatibility with scripts that might expect it globally:
if (typeof window !== 'undefined') {
    window.sha256 = sha256;
}
