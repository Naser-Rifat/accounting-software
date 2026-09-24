import { redirect } from 'next/navigation'

import { PageShell } from '@/components/layout/page-shell'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ActionForm } from '@/features/accounting/action-form'
import { SELECT_CLASS } from '@/features/universities/fields'
import { USER_ROLES } from '@/lib/validation/user'
import {
  submitCreateUser,
  submitResetPassword,
  submitRevokeSessions,
  submitSetUserActive,
  submitUpdateUser,
} from '@/server/actions/users'
import { canManageUsers } from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import { linkOptions, listUsers } from '@/server/services/user-service'

export const metadata = { title: 'Users & Roles' }
export const dynamic = 'force-dynamic'

const ROLE_BLURB: Record<string, string> = {
  ADMIN: 'Everything: settings, users, fiscal years, reopening periods',
  ACCOUNTANT: 'All finance, GL, manual vouchers, approvals, period close, reports',
  COUNSELOR: 'Students and applications',
  AGENT: 'Own referred students; own commission statement',
  VIEWER: 'Read-only dashboards and reports',
}

export default async function UsersPage() {
  const user = await requireUser()
  if (!canManageUsers(user.role)) redirect('/admin/branches')

  const [users, links] = await Promise.all([listUsers(), linkOptions()])
  const active = users.filter((u) => u.isActive)

  return (
    <PageShell user={user} title="Users & Roles" subtitle={`${active.length} active · ${users.length - active.length} inactive · ${active.filter((u) => u.role === 'ADMIN').length} administrator(s)`}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">User ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Role</TableHead>
                <TableHead>Linked to</TableHead>
                <TableHead className="w-32">Last sign-in</TableHead>
                <TableHead className="w-20 text-right">Sessions</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-mono text-xs">{u.username}</TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {u.name}
                    {u.email ? <span className="block text-xs text-muted-foreground">{u.email}</span> : null}
                  </TableCell>
                  <TableCell className="text-xs">{u.role.toLowerCase()}</TableCell>
                  <TableCell className="text-xs whitespace-normal">
                    {u.counselor ? `counselor ${u.counselor}` : u.agent ? `agent ${u.agent}` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">{u.lastLoginAt ? u.lastLoginAt.slice(0, 16).replace('T', ' ') : 'never'}</TableCell>
                  <TableCell className="text-right tabular-nums">{u.activeSessions}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={u.isActive ? 'secondary' : 'outline'}>{u.isActive ? 'active' : 'inactive'}</Badge>
                      {u.mustChangePassword ? <Badge variant="outline">must change password</Badge> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {users.map((u) => (
          <Card key={u.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {u.name} <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">{u.username}</span>
                {u.id === user.id ? <Badge variant="outline" className="ml-2">you</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ActionForm action={submitUpdateUser} submitLabel="Save" variant="outline">
                <input type="hidden" name="userId" value={u.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="name" defaultValue={u.name} aria-label="Name" required />
                  <Input name="email" type="email" defaultValue={u.email ?? ''} placeholder="Email" aria-label="Email" />
                  <select name="role" defaultValue={u.role} className={SELECT_CLASS} aria-label="Role" disabled={u.id === user.id}>
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.toLowerCase()}
                      </option>
                    ))}
                  </select>
                  {u.id === user.id ? <input type="hidden" name="role" value={u.role} /> : null}
                  <select name="counselorId" defaultValue={u.counselorId ?? ''} className={SELECT_CLASS} aria-label="Counselor">
                    <option value="">— no counselor —</option>
                    {u.counselorId && !links.counselors.some((c) => c.id === u.counselorId) ? (
                      <option value={u.counselorId}>{u.counselor}</option>
                    ) : null}
                    {links.counselors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select name="agentId" defaultValue={u.agentId ?? ''} className={SELECT_CLASS} aria-label="Agent">
                    <option value="">— no agent —</option>
                    {u.agentId && !links.agents.some((a) => a.id === u.agentId) ? <option value={u.agentId}>{u.agent}</option> : null}
                    {links.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </ActionForm>

              <div className="flex flex-wrap items-end gap-2 border-t pt-3">
                <ActionForm action={submitResetPassword} submitLabel="Reset password" variant="outline" className="flex items-end gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <div className="space-y-1">
                    <Label htmlFor={`temp-${u.id}`} className="text-xs">
                      Temporary password
                    </Label>
                    <Input id={`temp-${u.id}`} name="tempPassword" type="password" autoComplete="new-password" className="w-48" required />
                  </div>
                </ActionForm>
                <ActionForm action={submitRevokeSessions} submitLabel="Sign out everywhere" variant="ghost" className="inline">
                  <input type="hidden" name="userId" value={u.id} />
                </ActionForm>
                {u.id !== user.id ? (
                  <ActionForm
                    action={submitSetUserActive}
                    submitLabel={u.isActive ? 'Deactivate' : 'Reactivate'}
                    variant={u.isActive ? 'destructive' : 'secondary'}
                    confirm={u.isActive ? `Deactivate ${u.username}? Their sessions are signed out immediately.` : undefined}
                    className="inline"
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="isActive" value={u.isActive ? 'false' : 'true'} />
                  </ActionForm>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a user</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={submitCreateUser} submitLabel="Create user" pendingLabel="Creating…">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="username">User ID</Label>
                <Input id="username" name="username" placeholder="lowercase, e.g. farhana" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <select id="role" name="role" defaultValue="VIEWER" className={SELECT_CLASS}>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toLowerCase()} — {ROLE_BLURB[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tempPassword">Temporary password</Label>
                <Input id="tempPassword" name="tempPassword" type="password" autoComplete="new-password" required />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="counselorId">Counselor</Label>
                  <select id="counselorId" name="counselorId" defaultValue="" className={SELECT_CLASS}>
                    <option value="">—</option>
                    {links.counselors.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agentId">Agent</Label>
                  <select id="agentId" name="agentId" defaultValue="" className={SELECT_CLASS}>
                    <option value="">—</option>
                    {links.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </ActionForm>
          <p className="mt-4 text-xs text-muted-foreground">
            A new user must change the temporary password at first sign-in. Nobody can change their own
            role or deactivate themselves, and the last active administrator cannot be demoted or
            deactivated.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  )
}
