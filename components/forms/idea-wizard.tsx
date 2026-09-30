'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { Stepper } from '@/components/layout/stepper';
import { ContextualActionBar } from '@/components/layout/contextual-action-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { saveIdeaDraft, submitIdea } from '@/lib/services/ideas';
import type { ImpactKind, ImpactType, SupportArea } from '@/types/database';

const STEPS = [
  { key: 'basics', label: 'Idea Basics' },
  { key: 'team', label: 'Team' },
  { key: 'impact', label: 'Impact' },
  { key: 'support', label: 'Support Needed' },
  { key: 'mentors', label: 'Mentor Preference' },
  { key: 'review', label: 'Review & Submit' },
];

interface TeamMemberEntry {
  profile_id: string;
  full_name: string;
  member_order: number;
}

interface MentorOption {
  mentor_profile_id: string;
  full_name: string;
  expertise: string | null;
}

const IMPACT_TYPE_OPTIONS: { value: ImpactType; label: string }[] = [
  { value: 'revenue_growth', label: 'Revenue growth' },
  { value: 'time_efficiency', label: 'Time efficiency' },
  { value: 'cost_efficiency', label: 'Cost efficiency' },
  { value: 'governance_improvement', label: 'Governance improvement' },
];

const SUPPORT_AREA_OPTIONS: { value: SupportArea; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'budget', label: 'Budget' },
  { value: 'data_access', label: 'Data access' },
];

export function IdeaWizard({ programId, mentors }: { programId: string; mentors: MentorOption[] }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [ideaId, setIdeaId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const [basics, setBasics] = React.useState({
    team_name: '',
    idea_title: '',
    problem_opportunity: '',
    proposed_solution: '',
    target_users: '',
  });
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberEntry[]>([]);
  const [memberSearch, setMemberSearch] = React.useState('');
  const [memberResults, setMemberResults] = React.useState<{ id: string; full_name: string; email: string }[]>([]);
  const [impacts, setImpacts] = React.useState<
    { impact_kind: ImpactKind; impact_type: ImpactType; explanation: string; measurable_result: string }[]
  >([{ impact_kind: 'primary', impact_type: 'time_efficiency', explanation: '', measurable_result: '' }]);
  const [supportRequests, setSupportRequests] = React.useState<
    { support_area: SupportArea; details: string; reason: string; estimate: string }[]
  >([]);
  const [mentorPrefs, setMentorPrefs] = React.useState<{ priority: 1 | 2; mentor_profile_id: string }[]>([]);

  React.useEffect(() => {
    if (memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(memberSearch)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setMemberResults(data.profiles ?? []);
      } catch {
        // Aborted or transient — ignore.
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [memberSearch]);

  async function persistDraft() {
    setPending(true);
    const result = await saveIdeaDraft(programId, ideaId, {
      ...basics,
      team_members: teamMembers.map(({ profile_id, member_order }) => ({ profile_id, member_order })),
      impacts,
      support_requests: supportRequests,
      mentor_preferences: mentorPrefs,
    } as any);
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return false;
    }
    setIdeaId(result.ideaId);
    toast.success('Draft saved');
    return true;
  }

  async function handleFinalSubmit() {
    const saved = await persistDraft();
    if (!saved || !ideaId) return;
    setPending(true);
    const result = await submitIdea(ideaId);
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Idea submitted');
    router.push('/my-ideas');
  }

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} currentStep={step} onStepClick={(i) => i <= step && setStep(i)} />

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Idea basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Team name</Label>
              <Input value={basics.team_name} onChange={(e) => setBasics({ ...basics, team_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Idea title</Label>
              <Input value={basics.idea_title} onChange={(e) => setBasics({ ...basics, idea_title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Problem / opportunity</Label>
              <Textarea
                rows={4}
                value={basics.problem_opportunity}
                onChange={(e) => setBasics({ ...basics, problem_opportunity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Proposed solution</Label>
              <Textarea
                rows={4}
                value={basics.proposed_solution}
                onChange={(e) => setBasics({ ...basics, proposed_solution: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Target users</Label>
              <Textarea
                rows={2}
                value={basics.target_users}
                onChange={(e) => setBasics({ ...basics, target_users: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Team members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Search colleagues by name or email</Label>
              <Input value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Type at least 2 characters…" />
              {memberResults.length > 0 && (
                <div className="rounded-md border">
                  {memberResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        if (teamMembers.some((m) => m.profile_id === p.id)) return;
                        setTeamMembers((prev) => [
                          ...prev,
                          { profile_id: p.id, full_name: p.full_name, member_order: prev.length + 1 },
                        ]);
                        setMemberSearch('');
                        setMemberResults([]);
                      }}
                    >
                      <span>{p.full_name}</span>
                      <span className="text-xs text-muted-foreground">{p.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              {teamMembers.map((m) => (
                <div key={m.profile_id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  {m.full_name}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setTeamMembers((prev) => prev.filter((x) => x.profile_id !== m.profile_id))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {teamMembers.length === 0 && <p className="text-sm text-muted-foreground">No additional members added.</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Impact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {impacts.map((impact, idx) => (
              <div key={idx} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {impact.impact_kind === 'primary' ? 'Primary impact' : 'Secondary impact'}
                  </span>
                  {idx > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setImpacts((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <Select
                  value={impact.impact_type}
                  onValueChange={(v) =>
                    setImpacts((prev) => prev.map((it, i) => (i === idx ? { ...it, impact_type: v as ImpactType } : it)))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPACT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Explanation"
                  value={impact.explanation}
                  onChange={(e) =>
                    setImpacts((prev) => prev.map((it, i) => (i === idx ? { ...it, explanation: e.target.value } : it)))
                  }
                />
                <Input
                  placeholder="Measurable result"
                  value={impact.measurable_result}
                  onChange={(e) =>
                    setImpacts((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, measurable_result: e.target.value } : it))
                    )
                  }
                />
              </div>
            ))}
            {impacts.length < 2 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setImpacts((prev) => [
                    ...prev,
                    { impact_kind: 'secondary', impact_type: 'cost_efficiency', explanation: '', measurable_result: '' },
                  ])
                }
              >
                Add secondary impact
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Support needed (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supportRequests.map((req, idx) => (
              <div key={idx} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Select
                    value={req.support_area}
                    onValueChange={(v) =>
                      setSupportRequests((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, support_area: v as SupportArea } : it))
                      )
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_AREA_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setSupportRequests((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Details"
                  value={req.details}
                  onChange={(e) =>
                    setSupportRequests((prev) => prev.map((it, i) => (i === idx ? { ...it, details: e.target.value } : it)))
                  }
                />
                <Input
                  placeholder="Estimate"
                  value={req.estimate}
                  onChange={(e) =>
                    setSupportRequests((prev) => prev.map((it, i) => (i === idx ? { ...it, estimate: e.target.value } : it)))
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSupportRequests((prev) => [...prev, { support_area: 'tools', details: '', reason: '', estimate: '' }])}
            >
              Add support request
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Mentor preference</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2].map((priority) => (
              <div key={priority} className="space-y-1.5">
                <Label>Priority {priority} mentor</Label>
                <Select
                  value={mentorPrefs.find((p) => p.priority === priority)?.mentor_profile_id ?? ''}
                  onValueChange={(v) =>
                    setMentorPrefs((prev) => [
                      ...prev.filter((p) => p.priority !== priority),
                      { priority: priority as 1 | 2, mentor_profile_id: v },
                    ])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a mentor" />
                  </SelectTrigger>
                  <SelectContent>
                    {mentors.map((m) => (
                      <SelectItem key={m.mentor_profile_id} value={m.mentor_profile_id}>
                        {m.full_name} {m.expertise ? `· ${m.expertise}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Review &amp; submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-medium">{basics.idea_title || 'Untitled idea'}</span> — {basics.team_name || 'No team name'}
            </p>
            <p className="text-muted-foreground">
              {teamMembers.length} additional team member(s), {impacts.length} impact(s), {supportRequests.length} support
              request(s).
            </p>
            <p className="text-muted-foreground">
              Once submitted, your idea is locked and routed to a mentor for review — you won&apos;t be able to edit it further.
            </p>
          </CardContent>
        </Card>
      )}

      <ContextualActionBar>
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={pending}>
            Back
          </Button>
        )}
        <Button variant="secondary" onClick={persistDraft} disabled={pending}>
          Save draft
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={async () => (await persistDraft()) && setStep((s) => s + 1)} disabled={pending}>
            Next
          </Button>
        ) : (
          <Button onClick={() => setConfirmOpen(true)} disabled={pending}>
            Submit idea
          </Button>
        )}
      </ContextualActionBar>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this idea?"
        description="Submitting locks your idea for editing and routes it to a mentor for review. This cannot be undone."
        confirmLabel="Submit"
        onConfirm={handleFinalSubmit}
      />
    </div>
  );
}
