'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { saveProgramContent, deleteProgramContent } from '@/lib/services/program-config';
import type { ProgramContentRow } from '@/lib/services/program-config';

/** Eligibility/team-rule text (a single fixed key) plus a free-form list of
 * FAQ entries — both stored as rows in program_content, keyed by
 * 'eligibility' and 'faq_<n>' respectively. */
export function ProgramContentEditor({ programId, content }: { programId: string; content: ProgramContentRow[] }) {
  const eligibility = content.find((c) => c.key === 'eligibility');
  const faqs = content.filter((c) => c.key.startsWith('faq_'));

  const [eligibilityBody, setEligibilityBody] = React.useState(eligibility?.body ?? '');
  const [newFaqQ, setNewFaqQ] = React.useState('');
  const [newFaqA, setNewFaqA] = React.useState('');
  const [pending, setPending] = React.useState(false);

  async function saveEligibility() {
    setPending(true);
    const result = await saveProgramContent(programId, 'eligibility', 'Eligibility & team rules', eligibilityBody);
    setPending(false);
    if ('error' in result) return toast.error(result.error);
    toast.success('Eligibility text saved');
  }

  async function addFaq() {
    if (!newFaqQ.trim() || !newFaqA.trim()) return;
    const key = `faq_${Date.now()}`;
    const result = await saveProgramContent(programId, key, newFaqQ, newFaqA);
    if ('error' in result) return toast.error(result.error);
    setNewFaqQ('');
    setNewFaqA('');
    toast.success('FAQ entry added');
  }

  async function removeFaq(id: string) {
    const result = await deleteProgramContent(id);
    if ('error' in result) return toast.error(result.error);
    toast.success('FAQ entry removed');
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eligibility & team rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea rows={5} value={eligibilityBody} onChange={(e) => setEligibilityBody(e.target.value)} placeholder="Who can participate, team size limits, etc." />
          <Button size="sm" onClick={saveEligibility} disabled={pending}>
            Save
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">FAQ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {faqs.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => removeFaq(f.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="space-y-2 rounded-lg border p-3">
            <Label>New FAQ entry</Label>
            <Input placeholder="Question" value={newFaqQ} onChange={(e) => setNewFaqQ(e.target.value)} />
            <Textarea placeholder="Answer" rows={2} value={newFaqA} onChange={(e) => setNewFaqA(e.target.value)} />
            <Button size="sm" variant="outline" onClick={addFaq}>
              <Plus className="h-4 w-4" /> Add FAQ
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
