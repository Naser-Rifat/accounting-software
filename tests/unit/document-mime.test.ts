import { describe, expect, it } from 'vitest'

import { asciiFileName, sniffMime } from '@/lib/documents/mime'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('sniffMime', () => {
  it('recognises the four accepted formats by signature', () => {
    expect(sniffMime(new TextEncoder().encode('%PDF-1.7\n%âãÏÓ'))).toBe('application/pdf')
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10))).toBe('image/jpeg')
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toBe('image/png')
    expect(
      sniffMime(bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50)),
    ).toBe('image/webp')
  })

  it('rejects anything else, whatever it was named', () => {
    expect(sniffMime(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull() // MZ — a Windows executable
    expect(sniffMime(new TextEncoder().encode('<html><script>alert(1)</script>'))).toBeNull()
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull() // zip / docx
    expect(sniffMime(bytes())).toBeNull()
    expect(sniffMime(bytes(0x52, 0x49, 0x46, 0x46))).toBeNull() // RIFF without WEBP
  })
})

describe('asciiFileName', () => {
  it('strips what cannot go in a header', () => {
    expect(asciiFileName('passport "scan".pdf')).toBe('passport scan.pdf')
    expect(asciiFileName('ছাড়পত্র.pdf')).toBe('.pdf')
    expect(asciiFileName('evil\r\nX-Injected: 1.pdf')).toBe('evilX-Injected: 1.pdf')
    expect(asciiFileName('   ')).toBe('document')
  })
})
