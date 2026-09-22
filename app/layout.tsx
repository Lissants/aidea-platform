import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

// Uses the system font stack (see app/globals.css) rather than next/font's
// Google Fonts loader, so builds never depend on fetching fonts.google.com —
// important for offline CI and for company networks that block it.

export const metadata: Metadata = {
  title: {
    default: 'AIdea Submission Platform',
    template: '%s · AIdea Submission Platform',
  },
  description: 'AI Innovation Challenge — submit, review, and showcase AI innovation ideas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
