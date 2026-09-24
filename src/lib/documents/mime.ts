/**
 * What a file actually is, from its first bytes.
 *
 * The browser's `File.type` is whatever the client claims — a renamed .exe
 * arrives as "application/pdf". The stored mime type and the extension on
 * disk come from here, never from the upload. The list is deliberately short:
 * nothing that a browser would execute (html, svg) and nothing whose signature
 * is shared with other formats (docx is a zip).
 */

export type AllowedMime = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'

export const ALLOWED_EXTENSIONS: Record<AllowedMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b)

export function sniffMime(bytes: Uint8Array): AllowedMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf' // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // WEBP
  ) {
    return 'image/webp'
  }
  return null
}

/** Only ASCII, no quotes or control characters — safe inside a header. */
export function asciiFileName(name: string, fallback = 'document'): string {
  const cleaned = name
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/["\\]/g, '')
    .trim()
  return cleaned || fallback
}
