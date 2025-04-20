// SHA-256 utility using Web Crypto API
export async function sha256(message) {
    try {
        // UTF-8 encode input string
        const msgBuffer = new TextEncoder().encode(message);
        // Hash the buffer
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        // Convert ArrayBuffer to byte array, then to hex string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        // Normally Web Crypto should always be available, but wrap for robustness
        throw new Error("SHA-256 computation failed: " + (e && e.message ? e.message : e));
    }
}

