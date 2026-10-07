import Link from 'next/link';
import { Lightbulb, PlusCircle, Vote } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { Program } from '@/types/database';

export async function ParticipantOverview({ user }: { user: SessionUser }) {
  const program = await db.queryOne<Program>(
    `SELECT TOP (1) * FROM programs WHERE status = 'active' ORDER BY created_at DESC`
  );

  const myIdeasCount =
    (await db.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM ideas WHERE created_by = @uid', { uid: user.id }))
      ?.count ?? 0;

  return (
    <div>
      <PageHeader
        title={`Welcome${user.profile?.full_name ? `, ${user.profile.full_name.split(' ')[0]}` : ''}`}
        description={program?.title ?? 'AI Innovation Challenge'}
        action={
          <Button asChild>
            <Link href="/submit">
              <PlusCircle className="h-4 w-4" /> Submit New Idea
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" /> My Ideas
            </CardDescription>
            <CardTitle className="text-3xl">{myIdeasCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Vote className="h-4 w-4" /> Voting
            </CardDescription>
            <CardTitle className="text-lg">
              <Link href="/voting" className="text-primary hover:underline">
                Cast your vote
              </Link>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submission window</CardDescription>
            <CardTitle className="text-base">
              {program?.submission_close_at
                ? new Date(program.submission_close_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                  })
                : 'TBD'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
