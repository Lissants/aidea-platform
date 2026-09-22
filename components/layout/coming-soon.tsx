import { Construction } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={Construction}
        title="Coming in a later phase"
        description="This workflow is being built out in a follow-up phase of the AIdea platform."
      />
    </div>
  );
}
