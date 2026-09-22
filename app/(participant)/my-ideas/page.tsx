import Link from 'next/link';
import { Lightbulb, PlusCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { ResponsiveTable, type ResponsiveTableColumn } from '@/components/ui/responsive-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { Idea } from '@/types/database';

export const metadata = { title: 'My Ideas' };

export default async function MyIdeasPage() {
  const user = await getCurrentUser();
  const supabase = createClient();

  const { data: ideas } = user
    ? await supabase
        .from('ideas')
        .select('*')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  const columns: ResponsiveTableColumn<Idea>[] = [
    { key: 'idea_title', header: 'Idea', cell: (row) => row.idea_title },
    { key: 'team_name', header: 'Team', cell: (row) => row.team_name },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => <StatusBadge status={row.status === 'submitted' ? 'submitted' : 'draft'} />,
    },
    { key: 'updated_at', header: 'Last updated', cell: (row) => formatDate(row.updated_at) },
  ];

  return (
    <div>
      <PageHeader
        title="My Ideas"
        description="Drafts and submitted ideas you own or lead."
        action={
          <Button asChild>
            <Link href="/submit">
              <PlusCircle className="h-4 w-4" /> Submit New Idea
            </Link>
          </Button>
        }
      />
      <ResponsiveTable
        columns={columns}
        data={ideas ?? []}
        getRowKey={(row) => row.id}
        emptyState={
          <EmptyState
            icon={Lightbulb}
            title="No ideas yet"
            description="Start your first AI Innovation Challenge submission."
            action={
              <Button asChild>
                <Link href="/submit">Submit New Idea</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
