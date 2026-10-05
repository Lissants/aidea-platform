'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';

interface ProfileResult {
  id: string;
  full_name: string;
  email: string;
  committed_idea_title: string | null;
}

interface ProfilePickerProps {
  programId: string;
  onSelect: (profile: { id: string; full_name: string }) => void;
  excludeIds: string[];
  disabled?: boolean;
  placeholder?: string;
  /** ARIA wiring from fieldA11y(): id, aria-describedby, aria-invalid. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
}

/** Debounced colleague search; calls onSelect with the picked profile. */
export function ProfilePicker({
  programId,
  onSelect,
  excludeIds,
  disabled,
  placeholder = 'Type at least 2 characters…',
  inputProps,
}: ProfilePickerProps) {
  const [search, setSearch] = React.useState('');
  const [results, setResults] = React.useState<ProfileResult[]>([]);
  const listId = `${inputProps?.id ?? 'profile-picker'}-results`;

  React.useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profiles/search?q=${encodeURIComponent(search)}&programId=${encodeURIComponent(programId)}`,
          { signal: controller.signal }
        );
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
  }, [search, programId]);

  const visible = results.filter((p) => !excludeIds.includes(p.id));

  return (
    <>
      <Input
        {...inputProps}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-controls={visible.length > 0 ? listId : undefined}
      />
      {visible.length > 0 && (
        <ul id={listId} aria-label="Matching colleagues" className="divide-y rounded-md border">
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!!p.committed_idea_title}
                className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                onClick={() => {
                  onSelect(p);
                  setSearch('');
                  setResults([]);
                }}
              >
                <span className="font-semibold">{p.full_name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.committed_idea_title ? `Already committed to "${p.committed_idea_title}"` : p.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
