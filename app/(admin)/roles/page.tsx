import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { RoleManagementRow } from '@/components/admin/role-management-row';
import { AddUserDialog } from '@/components/admin/add-user-dialog';
import { fetchManagedUsers } from '@/lib/services/users';

export const metadata = { title: 'User Management' };

function pageHref(q: string | undefined, page: number) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `/roles?${qs}` : '/roles';
}

export default async function RolesPage(props: { searchParams: Promise<Record<string, string | undefined>> }) {
  const searchParams = await props.searchParams;
  const { users, total, page, pageSize, creatableTiers } = await fetchManagedUsers(
    searchParams.q,
    Number(searchParams.page) || 1
  );
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Add and deactivate users and change their role. Every change is written to the audit log."
        action={<AddUserDialog tiers={creatableTiers} />}
      />

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

      {lastPage > 1 && (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          {page > 1 ? <Link href={pageHref(searchParams.q, page - 1)}>Previous</Link> : <span />}
          <span className="text-muted-foreground">
            Page {page} of {lastPage} ({total} users)
          </span>
          {page < lastPage ? <Link href={pageHref(searchParams.q, page + 1)}>Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
