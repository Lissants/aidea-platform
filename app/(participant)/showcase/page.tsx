import Image from 'next/image';
import { Images } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/session';
import type { WinnerCategory } from '@/types/database';

export const metadata = { title: 'Project Showcase' };

interface ShowcaseCardRow {
  id: string;
  idea_id: string;
  image_url: string | null;
  short_description: string | null;
  idea_title: string | null;
  team_name: string | null;
  team_leader_name: string | null;
  /** Only set once the final presentation result is published. */
  winner_category: WinnerCategory | null;
}

/**
 * Published showcase projects only. Once published, a project's title, team
 * name, team leader and member names are public to any signed-in user
 * (the 0013 showcase visibility rules); internal assessment fields
 * (scores, comments, decided_by) are never selected here.
 */
async function fetchPublishedShowcase() {
  const projects = await db.query<ShowcaseCardRow>(
    `SELECT sp.id, sp.idea_id, sp.image_url, sp.short_description,
            i.idea_title, i.team_name, leader.full_name AS team_leader_name,
            fpa.winner_category
       FROM showcase_projects sp
       JOIN ideas i ON i.id = sp.idea_id
       LEFT JOIN profiles leader ON leader.id = i.team_leader_id
       LEFT JOIN final_presentation_assessments fpa ON fpa.idea_id = i.id AND fpa.published = 1
      WHERE sp.published = 1
      ORDER BY sp.created_at DESC`
  );

  const members = await db.query<{ idea_id: string; full_name: string | null }>(
    `SELECT itm.idea_id, p.full_name
       FROM idea_team_members itm
       JOIN profiles p ON p.id = itm.profile_id
      WHERE itm.idea_id IN (@ideaIds)
      ORDER BY itm.member_order`,
    { ideaIds: projects.map((p) => p.idea_id) }
  );

  const membersByIdea = new Map<string, string[]>();
  for (const m of members) {
    if (!m.full_name) continue;
    const list = membersByIdea.get(m.idea_id) ?? [];
    list.push(m.full_name);
    membersByIdea.set(m.idea_id, list);
  }

  return projects.map((p) => ({ ...p, members: membersByIdea.get(p.idea_id) ?? [] }));
}

export default async function ShowcasePage() {
  const user = await getCurrentUser();
  const projects = user ? await fetchPublishedShowcase() : [];

  return (
    <div>
      <PageHeader title="Project Showcase" description="Published AI Innovation Challenge projects." />
      {projects.length === 0 ? (
        <EmptyState icon={Images} title="Nothing published yet" description="Check back once showcase projects go live." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              {p.image_url && (
                <div className="relative h-40 w-full bg-muted">
                  <Image src={p.image_url} alt={p.idea_title ?? 'Project'} fill className="object-cover" />
                </div>
              )}
              <CardHeader className="space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{p.idea_title}</CardTitle>
                  {p.winner_category && <StatusBadge status={p.winner_category} />}
                </div>
                <p className="text-xs text-muted-foreground">{p.team_name}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>{p.short_description}</p>
                {p.team_leader_name && (
                  <p className="text-xs">
                    <span className="font-medium text-foreground">Team leader:</span> {p.team_leader_name}
                  </p>
                )}
                {p.members.length > 0 && (
                  <p className="text-xs">
                    <span className="font-medium text-foreground">Team:</span> {p.members.join(', ')}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
