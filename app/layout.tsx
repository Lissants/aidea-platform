import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { giSansDisplay, giSansText } from './fonts';
import './globals.css';

// GI Sans is bundled locally (app/fonts) rather than fetched from Google Fonts,
// so builds work offline and on company networks that block external fonts.

export const metadata: Metadata = {
  title: {
    default: 'AIdea Submission Platform',
    template: '%s · AIdea Submission Platform',
  },
  description: 'AI Innovation Challenge — submit, review, and vote on AI innovation ideas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${giSansText.variable} ${giSansDisplay.variable}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          {children}
          <Toaster richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
