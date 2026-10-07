import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VoteCandidateRow } from '@/lib/services/voting-management';

/**
 * Read-only list of every idea in the final presentation stage — the live
 * voting ballot (v_vote_candidates). Ideas join automatically once an admin
 * opens their final presentation assessment; no winner publication needed.
 */
export function VoteCandidatesPanel({ candidates }: { candidates: VoteCandidateRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidates ({candidates.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every idea in the final presentation stage is on the ballot. New ideas join an open vote automatically.
        </p>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ideas have reached final presentation yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Voting candidates">
            {candidates.map((c) => (
              <li key={c.idea_id} className="flex items-center justify-between gap-4 p-3 text-sm">
                <div>
                  <p className="font-medium">{c.idea_title}</p>
                  <p className="text-xs text-muted-foreground">{c.team_name}</p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {c.short_description || c.image_url ? 'Showcase content' : 'No showcase content'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
