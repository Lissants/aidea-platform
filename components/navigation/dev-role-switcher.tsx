'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical } from 'lucide-react';
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

/**
 * QA-only role context switcher for seeded demo accounts. Rendered by the
 * server only when NODE_ENV !== 'production' AND the current user's email
 * matches a seeded demo pattern (see app conditions where this is used) —
 * never rendered in a production build regardless of props.
 */
export function DevRoleSwitcher({ availableRoles }: { availableRoles: AppRole[] }) {
  const router = useRouter();

  if (process.env.NODE_ENV === 'production') return null;

  async function setRole(role: AppRole) {
    await fetch('/api/session/active-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, dev: true }),
    });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5 border-dashed">
          <FlaskConical className="h-3.5 w-3.5" />
          Dev: view as
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Demo account role (QA only)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoles.map((role) => (
          <DropdownMenuItem key={role} onClick={() => setRole(role)}>
            {role}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
