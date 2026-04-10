/** crypto.randomUUID() requires a secure context (HTTPS / localhost).
 *  This falls back to crypto.getRandomValues() which works on plain HTTP. */
export function generateId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant bits
  return [
    bytes.slice(0, 4),
    bytes.slice(4, 6),
    bytes.slice(6, 8),
    bytes.slice(8, 10),
    bytes.slice(10, 16),
  ]
    .map((b) => Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(''))
    .join('-')
}
