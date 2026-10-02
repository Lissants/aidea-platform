'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { TempPasswordDialog } from '@/components/admin/temp-password-dialog';
import { TIER_LABELS, type UserTier } from '@/lib/constants/navigation';
import { changeUserTier, deleteUserPermanently, resetUserPassword, setUserActive } from '@/lib/services/users';
import type { ManagedUser } from '@/lib/services/users';

type Pending = 'deactivate' | 'delete' | 'reset' | null;

/** One account in User Management: tier select plus deactivate / reset / delete. */
export function RoleManagementRow({ user }: { user: ManagedUser }) {
  const [busy, setBusy] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Pending>(null);
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);

  async function run<T extends { error: string } | { ok: true }>(fn: () => Promise<T>, success: string) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if ('error' in result) {
      toast.error(result.error);
      return null;
    }
    toast.success(success);
    return result;
  }

  async function onTierChange(tier: UserTier) {
    await run(() => changeUserTier(user.user_id, tier), `${user.full_name} is now ${TIER_LABELS[tier]}`);
  }

  async function onReset() {
    const result = await run(() => resetUserPassword(user.user_id), 'Password reset');
    if (result && 'tempPassword' in result) setTempPassword(result.tempPassword);
  }

  const tierOptions = user.tier ? Array.from(new Set<UserTier>([user.tier, ...user.assignableTiers])) : user.assignableTiers;

  return (
    <Card className={user.active ? undefined : 'opacity-70'}>
      <CardContent className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {user.full_name}
            {user.isSelf && <Badge variant="outline">You</Badge>}
            {!user.active && <Badge variant="destructive">Deactivated</Badge>}
            {user.must_change_password && <Badge variant="warning">Password change pending</Badge>}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.canManage ? (
            <select
              aria-label={`Tier for ${user.full_name}`}
              value={user.tier ?? ''}
              disabled={busy}
              onChange={(e) => onTierChange(e.target.value as UserTier)}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              {!user.tier && <option value="">Voter only</option>}
              {tierOptions.map((t) => (
                <option key={t} value={t}>
                  {TIER_LABELS[t]}
                </option>
              ))}
            </select>
          ) : (
            <Badge variant="secondary">{user.tier ? TIER_LABELS[user.tier] : 'Voter only'}</Badge>
          )}

          {user.canManage && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm('reset')}>
                Reset password
              </Button>
              {user.active ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => setConfirm('deactivate')}>
                  Deactivate
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => setUserActive(user.user_id, true), `${user.full_name} reactivated`)}
                >
                  Reactivate
                </Button>
              )}
              <Button size="sm" variant="destructive" disabled={busy} onClick={() => setConfirm('delete')}>
                Delete
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirm === 'reset'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Reset password?"
        description={`${user.full_name}'s current password will stop working. They sign in with a new temporary password and must choose their own straight away.`}
        confirmLabel="Reset password"
        onConfirm={onReset}
      />
      <ConfirmDialog
        open={confirm === 'deactivate'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Deactivate this account?"
        description={`${user.full_name} will be blocked from signing in immediately. Their ideas, votes and history are kept and the account can be reactivated.`}
        confirmLabel="Deactivate"
        destructive
        requiredConfirmationText={user.email}
        onConfirm={async () => {
          await run(() => setUserActive(user.user_id, false), `${user.full_name} deactivated`);
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Permanently delete this account?"
        description="This cannot be undone. Accounts with ideas, votes, reviews or audit history cannot be deleted: deactivate those instead."
        confirmLabel="Delete permanently"
        destructive
        requiredConfirmationText={user.email}
        onConfirm={async () => {
          await run(() => deleteUserPermanently(user.user_id), `${user.full_name} deleted`);
        }}
      />
      <TempPasswordDialog password={tempPassword} email={user.email} onClose={() => setTempPassword(null)} />
    </Card>
  );
}
