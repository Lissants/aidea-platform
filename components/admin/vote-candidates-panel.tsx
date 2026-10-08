import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { VoteCandidateRow } from '@/lib/services/voting-management';

/**
 * Read-only list of every Build idea — the live voting ballot
 * (v_vote_candidates). Ideas join automatically once their screening Pass
 * and qualifier Build results are published.
 */
export function VoteCandidatesPanel({ candidates }: { candidates: VoteCandidateRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Candidates ({candidates.length})</CardTitle>
        <p className="text-sm text-muted-foreground">
          Every idea with a published Build result is on the ballot. New ideas join an open vote automatically.
        </p>
      </CardHeader>
      <CardContent>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ideas have a published Build result yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Voting candidates">
            {candidates.map((c) => (
              <li key={c.idea_id} className="p-3 text-sm">
                <p className="font-medium">{c.idea_title}</p>
                <p className="text-xs text-muted-foreground">{c.team_name}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
