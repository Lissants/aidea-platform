import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Plain link-styled button that downloads a CSV from the admin export route. */
export function ExportButton({ type, label }: { type: string; label: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={`/api/admin/exports/${type}`} download>
        <Download className="h-4 w-4" />
        {label}
      </a>
    </Button>
  );
}
