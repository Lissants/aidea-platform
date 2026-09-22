'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AppRole } from '@/lib/constants/navigation';

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  mentor: 'Mentor',
  participant: 'Participant',
  employee_voter: 'Employee Voter',
};

/**
 * Shown only when a user has more than one role. Lets them switch "acting
 * as" context; the choice is persisted server-side in a cookie
 * (aidea_active_role, set via /api/session/active-role) and read by the
 * AppShell + middleware on the next navigation.
 */
export function RoleSwitcher({ roles, activeRole }: { roles: AppRole[]; activeRole: AppRole }) {
  const router = useRouter();

  if (roles.length <= 1) return null;

  async function switchRole(role: AppRole) {
    await fetch('/api/session/active-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          {ROLE_LABELS[activeRole]}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acting as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => (
          <DropdownMenuItem key={role} onClick={() => switchRole(role)}>
            {ROLE_LABELS[role]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
