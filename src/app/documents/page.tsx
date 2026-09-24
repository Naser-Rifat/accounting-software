import Link from 'next/link'

import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { DocumentType } from '@/generated/prisma/enums'
import { ActionForm } from '@/features/accounting/action-form'
import { humanise } from '@/features/students/pipeline'
import { DOCUMENT_TYPES } from '@/lib/validation/document'
import { submitRemoveDocument, submitVerifyDocument } from '@/server/actions/documents'
import { canManageStudents } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { listDocuments } from '@/server/services/document-service'

export const metadata = { title: 'Documents' }
export const dynamic = 'force-dynamic'

const FILTER_SELECT = 'h-9 rounded-md border bg-transparent px-2 text-sm'
const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`

export default async function DocumentsPage({ searchParams }: PageProps<'/documents'>) {
  const user = await requireUser()
  const params = await searchParams
  const type = typeof params.type === 'string' && DOCUMENT_TYPES.some((t) => t.code === params.type) ? (params.type as DocumentType) : undefined
  const verified = params.verified === '1' ? true : params.verified === '0' ? false : undefined

  const documents = await listDocuments({ type, verified })
  const canManage = canManageStudents(user.role)
  const unverified = documents.filter((d) => !d.verified).length

  return (
    <PageShell user={user} title="Documents" subtitle={`${documents.length} file(s) · ${unverified} awaiting verification`}>
      <form className="flex flex-wrap items-center gap-2">
        <select name="type" defaultValue={type ?? ''} className={FILTER_SELECT}>
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        <select name="verified" defaultValue={verified === undefined ? '' : verified ? '1' : '0'} className={FILTER_SELECT}>
          <option value="">Verified or not</option>
          <option value="0">Unverified only</option>
          <option value="1">Verified only</option>
        </select>
        <Button type="submit" size="sm" variant="outline">
          Filter
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No documents match. Upload from a student or an application.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead className="w-40">Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead className="w-28">Expires</TableHead>
                  <TableHead className="w-28">Uploaded</TableHead>
                  <TableHead className="w-24">Verified</TableHead>
                  {canManage ? <TableHead className="w-40" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm whitespace-normal">
                      {d.studentId ? (
                        <Link href={`/students/${d.studentId}`} className="hover:underline">
                          {d.studentName}
                        </Link>
                      ) : (
                        '—'
                      )}
                      {d.applicationCode ? (
                        <Link href={`/applications/${d.applicationId}`} className="block font-mono text-xs text-muted-foreground hover:underline">
                          {d.applicationCode}
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{humanise(d.type)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <a href={d.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {d.fileName}
                      </a>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {d.mimeType.split('/')[1]} · {kb(d.sizeBytes)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">{d.expiresOn ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {d.uploadedAt.slice(0, 10)}
                      <span className="block text-muted-foreground">{d.uploadedBy}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.verified ? 'secondary' : 'outline'}>{d.verified ? 'verified' : 'unverified'}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!d.verified ? (
                            <ActionForm action={submitVerifyDocument} submitLabel="Verify" variant="outline" className="inline">
                              <input type="hidden" name="documentId" value={d.id} />
                            </ActionForm>
                          ) : null}
                          <ActionForm action={submitRemoveDocument} submitLabel="Remove" variant="ghost" confirm={`Remove ${d.fileName}?`} className="inline">
                            <input type="hidden" name="documentId" value={d.id} />
                          </ActionForm>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Files are stored outside the database and served only to signed-in users. The type shown
            is what the file really is, not what it was named.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
