'use client';

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FunnelStage, WorkloadRow, TurnoutPoint, WinnerCategoryRow } from '@/lib/services/reports';

const COLORS = ['#141414', '#5B5FEF', '#22C55E', '#F59E0B', '#EF4444'];

export function ReportsCharts({
  funnel,
  workload,
  turnout,
  winners,
}: {
  funnel: FunnelStage[];
  workload: WorkloadRow[];
  turnout: TurnoutPoint[];
  winners: WinnerCategoryRow[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission funnel</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="stage" width={110} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reviewer workload vs capacity</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {workload.length === 0 ? (
            <p className="text-sm text-muted-foreground">No mentors in this program yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="active" name="Active reviews" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="capacity" name="Capacity" fill={COLORS[0]} opacity={0.25} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Voting turnout (latest period)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          {turnout.length === 0 ? (
            <p className="text-sm text-muted-foreground">No votes recorded for the latest voting period.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={turnout}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="idea_title" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="vote_count" name="Votes" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Winner categories</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={winners} dataKey="count" nameKey="category" outerRadius={90} label>
                {winners.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
