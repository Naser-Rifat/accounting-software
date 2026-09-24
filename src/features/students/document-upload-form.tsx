import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ActionForm, type ActionState } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'
import { DOCUMENT_TYPES } from '@/lib/validation/document'

/**
 * Upload one file for a student or an application. The action receives the
 * File in FormData; the service decides what it really is.
 */
export function DocumentUploadForm({
  action,
  studentId,
  applicationId,
  defaultType = 'PASSPORT',
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  studentId?: string
  applicationId?: string
  defaultType?: string
}) {
  return (
    <ActionForm action={action} submitLabel="Upload" pendingLabel="Uploading…">
      {studentId ? <input type="hidden" name="studentId" value={studentId} /> : null}
      {applicationId ? <input type="hidden" name="applicationId" value={applicationId} /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2">
          <Label htmlFor="file">File (PDF, JPEG, PNG or WebP, up to 10 MB)</Label>
          <Input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="type">Type</Label>
          <select id="type" name="type" defaultValue={defaultType} className={SELECT_CLASS}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="expiresOn">Expires (optional)</Label>
          <Input id="expiresOn" name="expiresOn" type="date" />
        </div>
      </div>
    </ActionForm>
  )
}
