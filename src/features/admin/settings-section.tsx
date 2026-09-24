import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ActionForm, type ActionState } from '@/features/accounting/action-form'
import { SELECT_CLASS, TEXTAREA_CLASS } from '@/features/universities/fields'
import { isEffectiveDated } from '@/lib/validation/settings'

/**
 * One settings section, rendered from the data — docs/modules/16-settings.md:
 * "The admin screen renders each field from its dataType, so adding a setting
 * is a seed row, not a UI change." Server-safe.
 */

export type SettingRowData = {
  key: string
  value: string
  dataType: string
  isLocked: boolean
  lockReason: string | null
  updatedAt: string
  updatedBy: string | null
  options: readonly string[] | null
}

export type SettingChange = {
  key: string
  value: string
  effectiveFrom: string
  effectiveTo: string | null
  changedBy: string
  changedAt: string
  note: string | null
}

/** "company.legalName" → "Legal name". */
export function settingLabel(key: string) {
  const last = key.split('.').pop() ?? key
  const words = last.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function SettingField({ setting }: { setting: SettingRowData }) {
  const id = `value-${setting.key.replace(/\W/g, '-')}`
  const base = { id, name: 'value' as const }
  switch (setting.dataType) {
    case 'BOOLEAN':
      return (
        <select {...base} defaultValue={setting.value} className={SELECT_CLASS}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      )
    case 'ENUM':
      return (
        <select {...base} defaultValue={setting.value} className={SELECT_CLASS}>
          {(setting.options ?? [setting.value]).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'TEXT':
    case 'JSON':
      return <textarea {...base} defaultValue={setting.value} className={TEXTAREA_CLASS} />
    case 'INT':
      return <Input {...base} type="number" step={1} defaultValue={setting.value} className="text-right tabular-nums" />
    case 'DECIMAL':
    case 'PERCENT':
      return <Input {...base} inputMode="decimal" defaultValue={setting.value} className="text-right tabular-nums" />
    case 'DATE':
      return <Input {...base} type="date" defaultValue={setting.value} />
    case 'FILE_URL':
      return <Input {...base} type="url" placeholder="https://" defaultValue={setting.value} />
    default:
      return <Input {...base} defaultValue={setting.value} />
  }
}

export function SettingsSection({
  settings,
  canEdit,
  action,
  today,
}: {
  settings: SettingRowData[]
  canEdit: boolean
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  today: string
}) {
  return (
    <div className="divide-y">
      {settings.map((s) => (
        <div key={s.key} className="grid gap-3 py-4 lg:grid-cols-[18rem_1fr]">
          <div>
            <p className="text-sm font-medium">{settingLabel(s.key)}</p>
            <p className="font-mono text-xs text-muted-foreground">{s.key}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge variant="outline">{s.dataType.toLowerCase()}</Badge>
              {s.isLocked ? <Badge variant="secondary">locked</Badge> : null}
            </div>
          </div>
          <div>
            {s.isLocked || !canEdit ? (
              <div className={s.isLocked ? 'opacity-70' : ''}>
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  {s.value === '' ? <span className="text-muted-foreground">— not set —</span> : <span className="whitespace-pre-wrap">{s.value}</span>}
                </p>
                {s.isLocked ? (
                  <p className="mt-1 text-xs text-muted-foreground">Locked — {s.lockReason}. It cannot be changed without restating history.</p>
                ) : null}
              </div>
            ) : (
              <ActionForm action={action} submitLabel="Save" pendingLabel="Saving…" variant="outline" className="space-y-2">
                <input type="hidden" name="key" value={s.key} />
                <div className={isEffectiveDated(s.dataType) ? 'grid gap-2 sm:grid-cols-[1fr_10rem_1fr]' : 'grid gap-2 sm:grid-cols-[1fr_1fr]'}>
                  {/* Keyed on the stored value: after a save the default changes, and an
                      uncontrolled input must remount to show it. */}
                  <SettingField key={s.value} setting={s} />
                  {isEffectiveDated(s.dataType) ? (
                    <div className="space-y-1">
                      <Label htmlFor={`from-${s.key}`} className="text-xs">
                        Effective from
                      </Label>
                      <Input id={`from-${s.key}`} name="effectiveFrom" type="date" defaultValue={today} />
                    </div>
                  ) : null}
                  <Input name="note" placeholder="Why (optional)" aria-label="Reason for the change" />
                </div>
              </ActionForm>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {s.updatedBy ? `Last changed by ${s.updatedBy} on ${s.updatedAt.slice(0, 10)}` : 'Seed default'}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

export function SettingChangesTable({ changes }: { changes: SettingChange[] }) {
  if (changes.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No changes yet.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-36">When</TableHead>
          <TableHead>Key</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="w-28">Effective</TableHead>
          <TableHead className="w-28">By</TableHead>
          <TableHead>Note</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map((c, i) => (
          <TableRow key={`${c.key}-${c.effectiveFrom}-${i}`}>
            <TableCell className="text-xs tabular-nums">{c.changedAt}</TableCell>
            <TableCell className="font-mono text-xs">{c.key}</TableCell>
            <TableCell className="text-sm whitespace-normal break-all">{c.value === '' ? '—' : c.value}</TableCell>
            <TableCell className="text-xs">
              {c.effectiveFrom}
              {c.effectiveTo ? ` → ${c.effectiveTo}` : ''}
            </TableCell>
            <TableCell className="text-xs">{c.changedBy}</TableCell>
            <TableCell className="text-xs whitespace-normal text-muted-foreground">{c.note ?? ''}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
