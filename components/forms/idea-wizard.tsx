'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { ContextualActionBar } from '@/components/layout/contextual-action-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/currency-input';
import { IMPACT_TYPE_OPTIONS } from '@/lib/constants/impact';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { saveIdeaDraft, submitIdeaDraft } from '@/lib/services/ideas';
import {
  ideaBasicsSchema,
  ideaImpactsSchema,
  ideaMentorPreferencesSchema,
  ideaSupportRequestsSchema,
  ideaTeamSchema,
  type IdeaDraftInput,
} from '@/lib/validation/schemas';
import type { ImpactKind, ImpactType, SupportArea } from '@/types/database';

const SECTION_LABELS = ['Idea basics', 'Team members', 'Impact', 'Support needed', 'Mentor preference'];

interface TeamMemberEntry {
  profile_id: string;
  full_name: string;
  member_order: number;
}

interface MentorOption {
  mentor_profile_id: string;
  full_name: string;
  job_title: string | null;
  expertise: string | null;
}

const SUPPORT_AREA_OPTIONS: { value: SupportArea; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'budget', label: 'Budget' },
  { value: 'data_access', label: 'Data access' },
];

/** Placeholders for the support details and "why" textareas, per support area. */
const SUPPORT_FIELD_COPY: Record<SupportArea, { details: string; reason: string }> = {
  tools: {
    details: 'Tools, licenses, or technology',
    reason: 'Explain how it supports project development',
  },
  budget: {
    details: 'Provide the main cost assumptions',
    reason: 'Explain how the budget supports project development',
  },
  data_access: {
    details: 'Required data and level of access',
    reason: 'Explain how the data will be used',
  },
};

const MAX_TEAM_MEMBERS = 5;

function RequiredMark() {
  return (
    <span className="ml-0.5 text-destructive" aria-hidden="true">
      *
    </span>
  );
}

/** Debounced colleague search; calls onSelect with the picked profile. */
function ProfilePicker({
  onSelect,
  excludeIds,
  disabled,
  placeholder = 'Type at least 2 characters…',
}: {
  onSelect: (profile: { id: string; full_name: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<{ id: string; full_name: string; email: string }[]>([]);

  React.useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(search)}`, {
          signal: controller.signal,
        });
        const data = await res.json();
        setResults(data.profiles ?? []);
      } catch {
        // Aborted or transient — ignore.
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search]);

  const visible = results.filter((p) => !excludeIds.includes(p.id));

  return (
    <>
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} disabled={disabled} />
      {visible.length > 0 && (
        <div className="rounded-md border">
          {visible.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onSelect(p);
                setSearch('');
                setResults([]);
              }}
            >
              <span>{p.full_name}</span>
              <span className="text-xs text-muted-foreground">{p.email}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function IdeaWizard({ programId, mentors }: { programId: string; mentors: MentorOption[] }) {
  const router = useRouter();
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
  const [teamLeader, setTeamLeader] = React.useState<{ profile_id: string; full_name: string } | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberEntry[]>([]);
  const [impacts, setImpacts] = React.useState<
    { impact_kind: ImpactKind; impact_type: ImpactType; explanation: string; measurable_result: string }[]
  >([{ impact_kind: 'primary', impact_type: 'time_efficiency', explanation: '', measurable_result: '' }]);
  const [supportRequests, setSupportRequests] = React.useState<
    { support_area: SupportArea; details: string; reason: string; estimate: string }[]
  >([]);
  const [mentorPrefs, setMentorPrefs] = React.useState<{ priority: 1 | 2; mentor_profile_id: string }[]>([]);

  const teamMemberRows = teamMembers.map(({ profile_id, member_order }) => ({ profile_id, member_order }));

  /** Validates one group of fields; returns the first error message, if any. */
  function validateStep(index: number): string | null {
    const result =
      index === 0
        ? ideaBasicsSchema.safeParse(basics)
        : index === 1
          ? ideaTeamSchema.safeParse({ team_leader_id: teamLeader?.profile_id, team_members: teamMemberRows })
          : index === 2
            ? ideaImpactsSchema.safeParse({ impacts })
            : index === 3
              ? ideaSupportRequestsSchema.safeParse({ support_requests: supportRequests })
              : index === 4
                ? ideaMentorPreferencesSchema.safeParse({ mentor_preferences: mentorPrefs })
                : null;
    if (!result || result.success) return null;
    return result.error.issues[0]?.message ?? 'Please check this section';
  }

  const draftPayload = () => ({
    ...basics,
    team_leader_id: teamLeader?.profile_id,
    team_members: teamMemberRows,
    impacts,
    support_requests: supportRequests,
    mentor_preferences: mentorPrefs,
  });

  /** Saves the whole form as a draft — empty fields in any section are allowed. */
  async function persistDraft() {
    setPending(true);
    const result = await saveIdeaDraft(programId, ideaId, draftPayload());
    setPending(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    setIdeaId(result.ideaId ?? null);
    toast.success('Draft saved');
  }

  function openSubmitConfirm() {
    // All fields are validated only on submit.
    for (let i = 0; i < SECTION_LABELS.length; i++) {
      const error = validateStep(i);
      if (error) {
        toast.error(`${SECTION_LABELS[i]}: ${error}`);
        return;
      }
    }
    setConfirmOpen(true);
  }

  async function handleFinalSubmit() {
    setPending(true);
    const result = await submitIdeaDraft(programId, ideaId, draftPayload() as IdeaDraftInput);
    setPending(false);
    if (result.ideaId) setIdeaId(result.ideaId);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success('Idea submitted');
    router.push('/my-ideas');
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Team &amp; Idea Information</CardTitle>
          <p className="text-sm text-muted-foreground">
            Describe the opportunity, proposed solution, and intended users.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Team name
              <RequiredMark />
            </Label>
            <Input value={basics.team_name} onChange={(e) => setBasics({ ...basics, team_name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>
              Team leader
              <RequiredMark />
            </Label>
            <p className="text-xs text-muted-foreground">Search colleagues by name or email</p>
            {teamLeader ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                {teamLeader.full_name}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTeamLeader(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <ProfilePicker
                excludeIds={teamMembers.map((m) => m.profile_id)}
                onSelect={(p) => setTeamLeader({ profile_id: p.id, full_name: p.full_name })}
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Team members</Label>
            <p className="text-xs text-muted-foreground">
              Search colleagues by name or email (maximum {MAX_TEAM_MEMBERS} members)
            </p>
            <ProfilePicker
              disabled={teamMembers.length >= MAX_TEAM_MEMBERS}
              excludeIds={[...teamMembers.map((m) => m.profile_id), ...(teamLeader ? [teamLeader.profile_id] : [])]}
              placeholder={
                teamMembers.length >= MAX_TEAM_MEMBERS ? 'Maximum of 5 members reached' : 'Type at least 2 characters…'
              }
              onSelect={(p) =>
                setTeamMembers((prev) =>
                  prev.length >= MAX_TEAM_MEMBERS || prev.some((m) => m.profile_id === p.id)
                    ? prev
                    : [...prev, { profile_id: p.id, full_name: p.full_name, member_order: prev.length + 1 }]
                )
              }
            />
          </div>
          <div className="space-y-2">
            {teamMembers.map((m) => (
              <div key={m.profile_id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                {m.full_name}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    setTeamMembers((prev) =>
                      prev.filter((x) => x.profile_id !== m.profile_id).map((x, i) => ({ ...x, member_order: i + 1 }))
                    )
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {teamMembers.length === 0 && <p className="text-sm text-muted-foreground">No additional members added.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>
              Idea title
              <RequiredMark />
            </Label>
            <Input
              placeholder="Enter a concise idea title"
              value={basics.idea_title}
              onChange={(e) => setBasics({ ...basics, idea_title: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Problem / opportunity
              <RequiredMark />
            </Label>
            <Textarea
              rows={4}
              placeholder="What problem or opportunity does the idea address, and why is it relevant?"
              value={basics.problem_opportunity}
              onChange={(e) => setBasics({ ...basics, problem_opportunity: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Proposed Solution &amp; AI Use
              <RequiredMark />
            </Label>
            <Textarea
              rows={4}
              placeholder="Describe the proposed solution and how AI will be used"
              value={basics.proposed_solution}
              onChange={(e) => setBasics({ ...basics, proposed_solution: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Target Users / Beneficiaries</Label>
            <Textarea
              rows={2}
              placeholder="Who will use or benefit from the solution?"
              value={basics.target_users}
              onChange={(e) => setBasics({ ...basics, target_users: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="block">Business Impact</Label>
            <p className="text-xs text-muted-foreground">
              Define the primary impact and add a secondary impact only when it provides distinct additional value.
            </p>
          </div>
          {impacts.map((impact, idx) => (
            <div key={idx} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">
                    {impact.impact_kind === 'primary' ? 'Primary impact' : 'Secondary impact'}
                    {impact.impact_kind === 'primary' && <RequiredMark />}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {impact.impact_kind === 'primary'
                      ? 'Select the main business outcome expected from this idea.'
                      : 'Select an additional business outcome that adds distinct value.'}
                  </p>
                </div>
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
              <div className="space-y-1.5">
                <Label>
                  How will the idea create this impact?
                  <RequiredMark />
                </Label>
                <Textarea
                  placeholder="Explain the expected business value"
                  value={impact.explanation}
                  onChange={(e) =>
                    setImpacts((prev) => prev.map((it, i) => (i === idx ? { ...it, explanation: e.target.value } : it)))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>What measurable result would indicate success?</Label>
                <Input
                  placeholder="Define the expected result or indicator"
                  value={impact.measurable_result}
                  onChange={(e) =>
                    setImpacts((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, measurable_result: e.target.value } : it))
                    )
                  }
                />
              </div>
            </div>
          ))}
          {impacts.length < 2 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setImpacts((prev) => [
                  ...prev,
                  { impact_kind: 'secondary', impact_type: 'cost_optimization', explanation: '', measurable_result: '' },
                ])
              }
            >
              Add secondary impact
            </Button>
          )}
          <div className="space-y-1">
            <Label className="block">Support needed (optional)</Label>
            <p className="text-xs text-muted-foreground">
              Identify the resources required to develop the project and complete its final output.
            </p>
          </div>
          {supportRequests.map((req, idx) => {
            const copy = SUPPORT_FIELD_COPY[req.support_area];
            return (
              <div key={idx} className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Select
                    value={req.support_area}
                    onValueChange={(v) =>
                      setSupportRequests((prev) =>
                        prev.map((it, i) =>
                          i === idx
                            ? { ...it, support_area: v as SupportArea, estimate: v === 'budget' ? it.estimate : '' }
                            : it
                        )
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
                <div className="space-y-1.5">
                  <Label htmlFor={`support-details-${idx}`}>Support Details</Label>
                  <Textarea
                    id={`support-details-${idx}`}
                    placeholder={copy.details}
                    value={req.details}
                    onChange={(e) =>
                      setSupportRequests((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, details: e.target.value } : it))
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`support-reason-${idx}`}>Why is this support needed?</Label>
                  <Textarea
                    id={`support-reason-${idx}`}
                    placeholder={copy.reason}
                    value={req.reason}
                    onChange={(e) =>
                      setSupportRequests((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, reason: e.target.value } : it))
                      )
                    }
                  />
                </div>
                {req.support_area === 'budget' && (
                  <div className="space-y-1.5">
                    <Label htmlFor={`support-amount-${idx}`}>Estimated Amount</Label>
                    <CurrencyInput
                      id={`support-amount-${idx}`}
                      placeholder="0"
                      value={req.estimate}
                      onValueChange={(digits) =>
                        setSupportRequests((prev) =>
                          prev.map((it, i) => (i === idx ? { ...it, estimate: digits } : it))
                        )
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSupportRequests((prev) => [...prev, { support_area: 'tools', details: '', reason: '', estimate: '' }])}
          >
            Add support request
          </Button>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Preferred Mentors</h3>
            <p className="text-xs text-muted-foreground">
              Choose exactly two different mentors and clearly rank them as Priority 1 and Priority 2.
            </p>
          </div>
          {[1, 2].map((priority) => (
            <div key={priority} className="space-y-1.5">
              <Label>
                Mentor Priority {priority}
                <RequiredMark />
              </Label>
              <Select
                value={mentorPrefs.find((p) => p.priority === priority)?.mentor_profile_id ?? ''}
                onValueChange={(v) =>
                  setMentorPrefs((prev) => [
                    ...prev.filter((p) => p.priority !== priority),
                    { priority: priority as 1 | 2, mentor_profile_id: v },
                  ])
                }
              >
                <SelectTrigger className="[&>span:first-child]:truncate [&>span:first-child]:text-left">
                  <SelectValue placeholder="Select a mentor" />
                </SelectTrigger>
                <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                  {mentors.map((m) => (
                    <SelectItem
                      key={m.mentor_profile_id}
                      value={m.mentor_profile_id}
                      description={m.expertise}
                    >
                      <span className="font-medium">{m.full_name}</span>
                      {m.job_title && <span className="text-muted-foreground"> · {m.job_title}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </CardContent>
      </Card>

      <ContextualActionBar>
        <Button variant="secondary" type="button" onClick={persistDraft} disabled={pending}>
          Save draft
        </Button>
        <Button type="button" onClick={openSubmitConfirm} disabled={pending}>
          Submit idea
        </Button>
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
