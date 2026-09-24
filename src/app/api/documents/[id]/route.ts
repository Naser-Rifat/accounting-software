import { asciiFileName } from '@/lib/documents/mime'
import { getCurrentUser } from '@/server/auth/session'
import { readDocumentBytes } from '@/server/services/document-service'

/**
 * Serve an uploaded document to a signed-in user.
 *
 * The content type is what the bytes were sniffed as at upload, never what
 * the browser claimed. `sandbox` and `nosniff` mean that even if something
 * slipped past the sniffer, it renders inert on our origin.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new Response('Not signed in', { status: 401 })

  const { id } = await params
  const doc = await readDocumentBytes(id).catch(() => null)
  if (!doc) return new Response('Not found', { status: 404 })

  const ascii = asciiFileName(doc.fileName)
  const utf8 = encodeURIComponent(doc.fileName)

  return new Response(doc.bytes, {
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Length': String(doc.bytes.byteLength),
      'Content-Disposition': `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': 'sandbox',
    },
  })
}
