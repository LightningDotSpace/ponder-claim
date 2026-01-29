/**
 * Validates an Ethereum address format.
 * Must be 0x followed by exactly 40 hex characters.
 */
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates a preimage format.
 * Must be 32 bytes (64 hex chars), optionally with 0x prefix.
 */
export function isValidPreimage(preimage: string): boolean {
  // Remove 0x prefix if present
  const hex = preimage.startsWith('0x') ? preimage.slice(2) : preimage;
  // Must be exactly 64 hex characters (32 bytes)
  return /^[a-fA-F0-9]{64}$/.test(hex);
}

/**
 * Validates a preimage hash format.
 * Must be 32 bytes (64 hex chars), optionally with 0x prefix.
 */
export function isValidPreimageHash(preimageHash: string): boolean {
  // Same format as preimage (32 bytes)
  return isValidPreimage(preimageHash);
}
