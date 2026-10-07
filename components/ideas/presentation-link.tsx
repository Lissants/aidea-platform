import { FileText } from 'lucide-react';

/** Link to an idea's uploaded presentation (PDF opens inline, .pptx downloads). */
export function PresentationLink({ url, name }: { url: string; name: string | null }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="focus-ring inline-flex max-w-full items-center gap-1.5 text-sm underline underline-offset-4 hover:text-foreground"
    >
      <FileText className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{name || 'Presentation'}</span>
    </a>
  );
}
