'use client';

import * as React from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Shows a temporary password exactly once; it is never stored or retrievable afterwards. */
export function TempPasswordDialog({
  password,
  email,
  onClose,
}: {
  password: string | null;
  email: string;
  onClose: () => void;
}) {
  const bodyRef = React.useRef<HTMLDivElement>(null);

  async function copy() {
    if (!password) return;
    if (await copyText(password, bodyRef.current)) toast.success('Copied');
    else toast.error('Copy failed: select the password and copy it manually');
  }

  return (
    <Dialog open={password !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            Share this with {email} securely. It is shown only once, and they must choose a new password when they sign in.
          </DialogDescription>
        </DialogHeader>
        <div ref={bodyRef} className="flex items-center gap-2">
          <code className="flex-1 select-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">{password}</code>
          <Button type="button" variant="outline" size="icon" aria-label="Copy password" onClick={copy}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
