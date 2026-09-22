import Image from 'next/image';
import { Images } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { createClient } from '@/lib/supabase/server';

export const metadata = { title: 'Project Showcase' };

export default async function ShowcasePage() {
  const supabase = createClient();

  const { data: projects } = await supabase
    .from('showcase_projects')
    .select(
      `*, ideas (
         idea_title, team_name,
         profiles:team_leader_id (full_name),
         idea_team_members (profiles (full_name)),
         final_presentation_assessments (published, winner_decision, winner_category)
       )`
    )
    .eq('published', true)
    .order('created_at', { ascending: false });

  return (
    <div>
      <PageHeader title="Project Showcase" description="Published AI Innovation Challenge projects." />
      {!projects || projects.length === 0 ? (
        <EmptyState icon={Images} title="Nothing published yet" description="Check back once showcase projects go live." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p: any) => {
            const fpa = p.ideas?.final_presentation_assessments?.[0] ?? p.ideas?.final_presentation_assessments ?? null;
            const showWinner = fpa?.published && fpa.winner_category;
            const members: string[] = (p.ideas?.idea_team_members ?? []).map((m: any) => m.profiles?.full_name).filter(Boolean);

            return (
              <Card key={p.id} className="overflow-hidden">
                {p.image_url && (
                  <div className="relative h-40 w-full bg-muted">
                    <Image src={p.image_url} alt={p.ideas?.idea_title ?? 'Project'} fill className="object-cover" />
                  </div>
                )}
                <CardHeader className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{p.ideas?.idea_title}</CardTitle>
                    {showWinner && <StatusBadge status={fpa.winner_category} />}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.ideas?.team_name}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>{p.short_description}</p>
                  {p.ideas?.profiles?.full_name && (
                    <p className="text-xs">
                      <span className="font-medium text-foreground">Team leader:</span> {p.ideas.profiles.full_name}
                    </p>
                  )}
                  {members.length > 0 && (
                    <p className="text-xs">
                      <span className="font-medium text-foreground">Team:</span> {members.join(', ')}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
