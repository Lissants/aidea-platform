import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { AlertTriangle } from 'lucide-react';
import { IdeaWizard } from '@/components/forms/idea-wizard';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Submit New Idea' };

export default async function SubmitIdeaPage() {
  const supabase = await createClient();

  const { data: program } = await supabase
    .from('programs')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!program) {
    return (
      <div>
        <PageHeader title="Submit New Idea" />
        <EmptyState icon={AlertTriangle} title="No active program" description="There is no open submission window right now." />
      </div>
    );
  }

  const { data: mentorRows } = await supabase
    .from('mentor_profiles')
    .select('id, expertise, profiles(full_name)');

  const mentors = (mentorRows ?? []).map((m: any) => ({
    mentor_profile_id: m.id,
    full_name: m.profiles?.full_name ?? 'Mentor',
    expertise: m.expertise,
  }));

  return (
    <div>
      <PageHeader title="Submit New Idea" description={program.title} />
      <IdeaWizard programId={program.id} mentors={mentors} />
    </div>
  );
}
