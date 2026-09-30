'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { addUserRole, removeUserRole } from '@/lib/services/roles';
import type { UserRoleRow, RoleName } from '@/lib/services/roles';

const ALL_ROLES: RoleName[] = ['participant', 'mentor', 'admin', 'employee_voter'];
const ROLE_LABEL: Record<RoleName, string> = {
  participant: 'Participant',
  mentor: 'Mentor',
  admin: 'Admin',
  employee_voter: 'Employee Voter',
};

export function RoleManagementRow({ user }: { user: UserRoleRow }) {
  const [pendingRole, setPendingRole] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<RoleName>('participant');
  const available = ALL_ROLES.filter((r) => !user.roles.includes(r));
  const selectValue = available.includes(selected) ? selected : available[0];

  async function handleAdd() {
    if (!selectValue) return;
    setPendingRole(selectValue);
    const result = await addUserRole(user.user_id, selectValue);
    setPendingRole(null);
    if ('error' in result) return toast.error(result.error);
    toast.success(`${ROLE_LABEL[selectValue]} granted`);
  }

  async function handleRemove(role: RoleName) {
    setPendingRole(role);
    const result = await removeUserRole(user.user_id, role);
    setPendingRole(null);
    if ('error' in result) return toast.error(result.error);
    toast.success(`${ROLE_LABEL[role]} removed`);
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">{user.full_name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.roles.map((r) => (
            <Badge key={r} variant="secondary" className="gap-1">
              {ROLE_LABEL[r]}
              <button
                type="button"
                aria-label={`Remove ${ROLE_LABEL[r]}`}
                disabled={pendingRole === r}
                onClick={() => handleRemove(r)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {available.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                value={selectValue}
                onChange={(e) => setSelected(e.target.value as RoleName)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                {available.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={handleAdd} disabled={!!pendingRole}>
                Add role
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
