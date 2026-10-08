import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PresentationLink } from '@/components/ideas/presentation-link';
import { impactTypeLabel } from '@/lib/constants/impact';
import { formatDate } from '@/lib/utils';

interface IdeaDetailData {
  idea_title: string;
  team_name: string;
  problem_opportunity: string;
  proposed_solution: string;
  target_users: string | null;
  /** Omit when the caller doesn't load it; null = leader slot vacant. */
  team_leader?: { full_name: string } | null;
  team_members: { full_name: string }[];
  impacts: { impact_kind: string; impact_type: string; explanation: string | null; measurable_result: string | null }[];
  support_requests: { support_area: string; details: string | null; reason?: string | null; estimate: string | null }[];
  mentor_preferences: { priority: number; mentor_name: string }[];
  /** Team-uploaded deck (Build ideas); omitted or null = none yet. */
  presentation?: { url: string; name: string | null; uploaded_at: string | null } | null;
}

const SUPPORT_AREA_LABEL: Record<string, string> = {
  tools: 'Tools',
  budget: 'Budget',
  data_access: 'Data access',
};

/** Read-only presentation of a submitted idea's full detail — reused by
 * the mentor review page and admin decision screens. */
export function IdeaDetailReadonly({ idea }: { idea: IdeaDetailData }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{idea.idea_title}</CardTitle>
          <p className="text-sm text-muted-foreground">{idea.team_name}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium">Problem / opportunity</p>
            <p className="text-muted-foreground">{idea.problem_opportunity}</p>
          </div>
          <div>
            <p className="font-medium">Proposed solution</p>
            <p className="text-muted-foreground">{idea.proposed_solution}</p>
          </div>
          {idea.target_users && (
            <div>
              <p className="font-medium">Target users</p>
              <p className="text-muted-foreground">{idea.target_users}</p>
            </div>
          )}
          {idea.team_leader !== undefined && (
            <div>
              <p className="font-medium">Team leader</p>
              <p className="text-muted-foreground">{idea.team_leader?.full_name ?? 'Vacant'}</p>
            </div>
          )}
          {idea.team_members.length > 0 && (
            <div>
              <p className="font-medium">{idea.team_leader !== undefined ? 'Team members' : 'Team'}</p>
              <p className="text-muted-foreground">{idea.team_members.map((m) => m.full_name).join(', ')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {idea.presentation && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Presentation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <PresentationLink url={idea.presentation.url} name={idea.presentation.name} />
            {idea.presentation.uploaded_at && (
              <p className="text-xs text-muted-foreground">Uploaded {formatDate(idea.presentation.uploaded_at)}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Impact</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {idea.impacts.map((impact, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={impact.impact_kind === 'primary' ? 'default' : 'secondary'}>
                  {impact.impact_kind === 'primary' ? 'Primary' : 'Secondary'}
                </Badge>
                <span className="font-medium">{impactTypeLabel(impact.impact_type)}</span>
              </div>
              <p className="text-muted-foreground">{impact.explanation}</p>
              {impact.measurable_result && (
                <p className="text-xs text-muted-foreground">Measurable result: {impact.measurable_result}</p>
              )}
            </div>
          ))}
          {idea.impacts.length === 0 && <p className="text-muted-foreground">No impact information provided.</p>}
        </CardContent>
      </Card>

      {idea.support_requests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Support requested</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {idea.support_requests.map((s, idx) => (
              <div key={idx} className="space-y-0.5">
                <p className="font-medium">{SUPPORT_AREA_LABEL[s.support_area] ?? s.support_area}</p>
                {s.details && <p className="whitespace-pre-wrap text-muted-foreground">{s.details}</p>}
                {s.reason && (
                  <p className="whitespace-pre-wrap text-muted-foreground">
                    <span className="font-medium text-foreground">Why: </span>
                    {s.reason}
                  </p>
                )}
                {s.estimate && (
                  <p className="text-muted-foreground">
                    Estimated amount:{' '}
                    <span className="tabular-nums">
                      {/^\d+$/.test(s.estimate) ? `IDR ${Number(s.estimate).toLocaleString('en-US')}` : s.estimate}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {idea.mentor_preferences.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mentor preference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {idea.mentor_preferences
              .sort((a, b) => a.priority - b.priority)
              .map((p) => (
                <p key={p.priority}>
                  Priority {p.priority}: <span className="font-medium">{p.mentor_name}</span>
                </p>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
