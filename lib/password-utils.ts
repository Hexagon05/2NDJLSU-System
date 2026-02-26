// Password utility functions for hashing and verification

/**
 * Hash a password using a simple implementation
 * Note: In production, consider using bcrypt or a similar library
 */
export const hashPassword = async (password: string): Promise<string> => {
    // Simple hash implementation for client-side use
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
};

/**
 * Verify a password against a hashed password
 */
export const verifyPassword = async (
    password: string,
    hashedPassword: string
): Promise<boolean> => {
    const hashToVerify = await hashPassword(password);
    return hashToVerify === hashedPassword;
};
