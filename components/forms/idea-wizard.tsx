'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ContextualActionBar } from '@/components/layout/contextual-action-bar';
import { ConfirmDialog } from '@/components/layout/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/forms/form-field';
import { ProfilePicker } from '@/components/forms/profile-picker';
import {
  ErrorSummary,
  FormSection,
  ImpactFieldset,
  RemoveButton,
  SectionIndex,
  SupportRequestFieldset,
  makeFieldLookup,
  type ImpactValue,
  type SupportRequestValue,
} from '@/components/forms/idea-form-parts';
import { saveIdeaDraft, submitIdeaDraft } from '@/lib/services/ideas';
import { IDEA_FORM_SECTIONS, collectIdeaIssues, type IdeaFormValues } from '@/lib/ideas/idea-form-issues';
import type { IdeaDraftInput } from '@/lib/validation/schemas';

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

const MAX_TEAM_MEMBERS = 5;
const MAX_SUPPORT_REQUESTS = 5;
const [SECTION_BASICS, SECTION_TEAM, SECTION_IMPACT, SECTION_SUPPORT, SECTION_MENTORS] = IDEA_FORM_SECTIONS;

export function IdeaWizard({ programId, mentors }: { programId: string; mentors: MentorOption[] }) {
  const router = useRouter();
  const [ideaId, setIdeaId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const summaryRef = React.useRef<HTMLDivElement>(null);

  const [basics, setBasics] = React.useState({
    team_name: '',
    idea_title: '',
    problem_opportunity: '',
    proposed_solution: '',
    target_users: '',
  });
  const [teamLeader, setTeamLeader] = React.useState<{ profile_id: string; full_name: string } | null>(null);
  const [teamMembers, setTeamMembers] = React.useState<TeamMemberEntry[]>([]);
  const [impacts, setImpacts] = React.useState<ImpactValue[]>([
    { impact_kind: 'primary', impact_type: 'time_efficiency', explanation: '', measurable_result: '' },
  ]);
  const [supportRequests, setSupportRequests] = React.useState<SupportRequestValue[]>([]);
  const [mentorPrefs, setMentorPrefs] = React.useState<{ priority: 1 | 2; mentor_profile_id: string }[]>([]);

  const teamMemberRows = teamMembers.map(({ profile_id, member_order }) => ({ profile_id, member_order }));

  const values: IdeaFormValues = {
    basics,
    team_leader_id: teamLeader?.profile_id,
    team_members: teamMemberRows,
    impacts,
    support_requests: supportRequests,
    mentor_preferences: mentorPrefs,
  };

  // Errors appear after the first submit attempt, then update live as fields are fixed.
  const issues = showErrors ? collectIdeaIssues(values) : [];
  const field = makeFieldLookup(issues);

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
    setSavedAt(new Date());
    toast.success('Draft saved');
  }

  function openSubmitConfirm() {
    if (collectIdeaIssues(values).length > 0) {
      setShowErrors(true);
      // Move focus to the summary once it has rendered.
      requestAnimationFrame(() => {
        summaryRef.current?.scrollIntoView({ block: 'start' });
        summaryRef.current?.focus({ preventScroll: true });
      });
      return;
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

  const title = field('idea_title');
  const problem = field('problem_opportunity', true);
  const solution = field('proposed_solution', true);
  const targetUsers = field('target_users', true);
  const teamName = field('team_name');
  const leader = field('team_leader', true);
  const members = field('team_members', true);
  const mentorField = field('mentor_preferences');

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,48rem)_13rem] lg:gap-12">
      <div className="space-y-8">
        <p className="text-sm text-muted-foreground">
          Fields marked <span aria-hidden="true">*</span>
          <span className="sr-only">as required</span> are needed to submit. You can save a draft at any time.
        </p>

        {issues.length > 0 && <ErrorSummary issues={issues} summaryRef={summaryRef} />}

        <FormSection section={SECTION_BASICS} description="Describe the opportunity, your solution and who benefits.">
          <FormField id={title.id} label="Idea title" required error={title.error}>
            <Input
              {...title.a11y}
              aria-required
              placeholder="A short, specific title"
              value={basics.idea_title}
              onChange={(e) => setBasics({ ...basics, idea_title: e.target.value })}
            />
          </FormField>
          <FormField
            id={problem.id}
            label="Problem / opportunity"
            required
            hint="What problem or opportunity does the idea address, and why does it matter?"
            error={problem.error}
          >
            <Textarea
              {...problem.a11y}
              aria-required
              rows={4}
              value={basics.problem_opportunity}
              onChange={(e) => setBasics({ ...basics, problem_opportunity: e.target.value })}
            />
          </FormField>
          <FormField
            id={solution.id}
            label="Proposed solution & AI use"
            required
            hint="Describe the solution and how AI will be used."
            error={solution.error}
          >
            <Textarea
              {...solution.a11y}
              aria-required
              rows={4}
              value={basics.proposed_solution}
              onChange={(e) => setBasics({ ...basics, proposed_solution: e.target.value })}
            />
          </FormField>
          <FormField
            id={targetUsers.id}
            label="Target users / beneficiaries"
            hint="Optional. Who will use or benefit from the solution?"
            error={targetUsers.error}
          >
            <Textarea
              {...targetUsers.a11y}
              rows={2}
              value={basics.target_users}
              onChange={(e) => setBasics({ ...basics, target_users: e.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection
          section={SECTION_TEAM}
          description={`Name your team and choose a leader. You can add up to ${MAX_TEAM_MEMBERS} members.`}
        >
          <FormField id={teamName.id} label="Team name" required error={teamName.error}>
            <Input
              {...teamName.a11y}
              aria-required
              value={basics.team_name}
              onChange={(e) => setBasics({ ...basics, team_name: e.target.value })}
            />
          </FormField>

          <FormField id={leader.id} label="Team leader" required hint="Search colleagues by name or email." error={leader.error}>
            {teamLeader ? (
              <div className="flex items-center justify-between gap-2 rounded-md border pl-3 text-sm">
                <span className="font-semibold">{teamLeader.full_name}</span>
                <RemoveButton label={`Remove ${teamLeader.full_name} as team leader`} onClick={() => setTeamLeader(null)} />
              </div>
            ) : (
              <ProfilePicker
                programId={programId}
                inputProps={{ ...leader.a11y, 'aria-required': true }}
                excludeIds={teamMembers.map((m) => m.profile_id)}
                onSelect={(p) => setTeamLeader({ profile_id: p.id, full_name: p.full_name })}
              />
            )}
          </FormField>

          <FormField
            id={members.id}
            label="Team members"
            hint={`Optional. Up to ${MAX_TEAM_MEMBERS} colleagues, searched by name or email.`}
            error={members.error}
          >
            <ProfilePicker
              programId={programId}
              inputProps={members.a11y}
              disabled={teamMembers.length >= MAX_TEAM_MEMBERS}
              excludeIds={[...teamMembers.map((m) => m.profile_id), ...(teamLeader ? [teamLeader.profile_id] : [])]}
              placeholder={
                teamMembers.length >= MAX_TEAM_MEMBERS
                  ? `Maximum of ${MAX_TEAM_MEMBERS} members reached`
                  : 'Type at least 2 characters…'
              }
              onSelect={(p) =>
                setTeamMembers((prev) =>
                  prev.length >= MAX_TEAM_MEMBERS || prev.some((m) => m.profile_id === p.id)
                    ? prev
                    : [...prev, { profile_id: p.id, full_name: p.full_name, member_order: prev.length + 1 }]
                )
              }
            />
            {teamMembers.length > 0 && (
              <ul aria-label="Team members added" className="divide-y rounded-md border">
                {teamMembers.map((m) => (
                  <li key={m.profile_id} className="flex items-center justify-between gap-2 pl-3 text-sm">
                    {m.full_name}
                    <RemoveButton
                      label={`Remove ${m.full_name} from the team`}
                      onClick={() =>
                        setTeamMembers((prev) =>
                          prev.filter((x) => x.profile_id !== m.profile_id).map((x, i) => ({ ...x, member_order: i + 1 }))
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </FormField>
        </FormSection>

        <FormSection
          section={SECTION_IMPACT}
          description="Choose the main business outcome. Add a secondary impact only when it adds distinct value."
        >
          {impacts.map((impact, idx) => (
            <ImpactFieldset
              key={idx}
              index={idx}
              impact={impact}
              field={field}
              onChange={(patch) => setImpacts((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))}
              onRemove={idx > 0 ? () => setImpacts((prev) => prev.filter((_, i) => i !== idx)) : undefined}
            />
          ))}
          {impacts.length < 2 && (
            <Button
              type="button"
              variant="outline"
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
        </FormSection>

        <FormSection
          section={SECTION_SUPPORT}
          description="Optional. Resources the project needs to reach its final output: tools, budget or data access."
        >
          {supportRequests.map((req, idx) => (
            <SupportRequestFieldset
              key={idx}
              index={idx}
              request={req}
              field={field}
              onChange={(patch) =>
                setSupportRequests((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
              }
              onRemove={() => setSupportRequests((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}
          {supportRequests.length < MAX_SUPPORT_REQUESTS && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSupportRequests((prev) => [...prev, { support_area: 'tools', details: '', reason: '', estimate: '' }])
              }
            >
              Add support request
            </Button>
          )}
        </FormSection>

        <FormSection
          section={SECTION_MENTORS}
          description="Choose two different mentors and rank them. Admins use your ranking when assigning a reviewer."
        >
          {([1, 2] as const).map((priority) => {
            const id = priority === 1 ? mentorField.id : `${mentorField.id}-2`;
            const selected = mentorPrefs.find((p) => p.priority === priority)?.mentor_profile_id ?? '';
            const other = mentorPrefs.find((p) => p.priority !== priority)?.mentor_profile_id;
            return (
              <FormField key={priority} id={id} label={`Mentor priority ${priority}`} required>
                <Select
                  value={selected}
                  onValueChange={(v) =>
                    setMentorPrefs((prev) => [
                      ...prev.filter((p) => p.priority !== priority),
                      { priority, mentor_profile_id: v },
                    ])
                  }
                >
                  <SelectTrigger
                    id={id}
                    aria-required
                    aria-invalid={(!!mentorField.error && !selected) || undefined}
                    aria-describedby={mentorField.error ? `${mentorField.id}-error` : undefined}
                    className="[&>span:first-child]:truncate [&>span:first-child]:text-left"
                  >
                    <SelectValue placeholder="Select a mentor" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                    {mentors.map((m) => {
                      const takenByOther = m.mentor_profile_id === other;
                      return (
                        <SelectItem
                          key={m.mentor_profile_id}
                          value={m.mentor_profile_id}
                          disabled={takenByOther}
                          description={takenByOther ? `Already your priority ${priority === 1 ? 2 : 1}` : m.expertise}
                        >
                          <span className="font-medium">{m.full_name}</span>
                          {m.job_title && <span className="text-muted-foreground">, {m.job_title}</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </FormField>
            );
          })}
          {mentorField.error && (
            <p id={`${mentorField.id}-error`} className="text-sm font-semibold text-destructive">
              {mentorField.error}
            </p>
          )}
        </FormSection>

        <ContextualActionBar className="justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {savedAt
              ? `Draft saved at ${savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}. Keep this page open to keep editing.`
              : ''}
          </p>
          <div className="flex flex-1 justify-end gap-2 sm:flex-none">
            <Button variant="secondary" type="button" onClick={persistDraft} disabled={pending} className="flex-1 sm:flex-none">
              {pending ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="button" onClick={openSubmitConfirm} disabled={pending} className="flex-1 sm:flex-none">
              Submit idea
            </Button>
          </div>
        </ContextualActionBar>
      </div>

      <SectionIndex issues={issues} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Submit this idea?"
        description="Submitting locks your idea for editing and routes it to a mentor for review. This cannot be undone."
        confirmLabel="Submit idea"
        onConfirm={handleFinalSubmit}
      />
    </div>
  );
}
