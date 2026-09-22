import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { RoleManagementRow } from '@/components/admin/role-management-row';
import { fetchUsersWithRoles } from '@/lib/services/roles';

export const metadata = { title: 'Role Management' };

export default async function RolesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const users = await fetchUsersWithRoles(searchParams.q);

  return (
    <div>
      <PageHeader title="Role Management" description="Grant or revoke platform roles. Every change is written to the audit log." />

      <form method="get" className="mb-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q ?? ''}
          placeholder="Search by name or email…"
          className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Search
        </button>
        {searchParams.q && (
          <Link href="/roles" className="self-center text-sm text-muted-foreground hover:underline">
            Clear
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No users found" description="Try a different search." />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <RoleManagementRow key={u.user_id} user={u} />
          ))}
        </div>
      )}
    </div>
  );
}
