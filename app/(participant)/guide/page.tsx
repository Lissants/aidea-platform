import { BookOpen, ChevronDown, FileText } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/layout/empty-state';
import { fetchActiveProgram, fetchProgramContent, fetchProgramResources } from '@/lib/services/program-config';
import { formatDate } from '@/lib/utils';

export const metadata = { title: 'Program Guide' };

/** Read-only view of what admins maintain on /program: eligibility & team
 * rules, FAQ and resource files. Open to every signed-in role. */
export default async function ProgramGuidePage() {
  const program = await fetchActiveProgram();

  if (!program) {
    return (
      <div>
        <PageHeader title="Program Guide" />
        <EmptyState icon={BookOpen} title="No program yet" description="Rules, FAQ and files appear here once the program is set up." />
      </div>
    );
  }

  const [content, resources] = await Promise.all([fetchProgramContent(program.id), fetchProgramResources(program.id)]);
  const eligibility = content.find((c) => c.key === 'eligibility')?.body?.trim();
  // 'faq' (no suffix) is the key the seed data uses; the admin editor writes 'faq_<n>'.
  const faqs = content.filter((c) => (c.key === 'faq' || c.key.startsWith('faq_')) && c.title && c.body);

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader
        className="pb-0"
        title="Program Guide"
        description={`Eligibility and team rules, frequently asked questions and files for ${program.title}.`}
      />

      <section aria-labelledby="rules-title" className="space-y-3">
        <h2 id="rules-title" className="text-lg font-bold">
          Eligibility & team rules
        </h2>
        {eligibility ? (
          <div className="whitespace-pre-line break-words rounded-xl border px-4 py-3 text-sm leading-relaxed">{eligibility}</div>
        ) : (
          <p className="text-sm text-muted-foreground">The rules haven&apos;t been published yet.</p>
        )}
      </section>

      <section aria-labelledby="faq-title" className="space-y-3">
        <h2 id="faq-title" className="text-lg font-bold">
          FAQ
        </h2>
        {faqs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions have been answered yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {faqs.map((f) => (
              <li key={f.id}>
                <details className="group">
                  <summary className="focus-ring flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 break-words">{f.title}</span>
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="whitespace-pre-line break-words px-4 pb-3 text-sm text-muted-foreground">{f.body}</p>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="resources-title" className="space-y-3">
        <h2 id="resources-title" className="text-lg font-bold">
          Resources
        </h2>
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files have been shared yet.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {resources.map((r) => (
              <li key={r.id}>
                <a
                  href={r.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block break-words font-semibold underline underline-offset-4">{r.title}</span>
                    <span className="block text-sm text-muted-foreground">Added {formatDate(r.created_at)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
