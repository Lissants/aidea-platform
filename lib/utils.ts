import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, isValid } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined, pattern = 'PP') {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!isValid(d)) return '—';
  return format(d, pattern);
}
