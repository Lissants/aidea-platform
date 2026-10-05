import Image from 'next/image';

/**
 * Public pages carry the GIG lockup: business logo bottom-left, Godrej
 * Signature bottom-right, same height, bottom-aligned, 0.5in side and 0.2in
 * bottom margins. Marks are black on light; in dark mode they are shown as
 * their white versions (inverted), never otherwise recoloured.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <main className="flex flex-1 items-center px-4 py-10">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </main>
      <footer className="flex items-end justify-between gap-6 px-12 pb-5">
        <Image
          src="/brand/godrej-consumer-products.png"
          alt="Godrej Consumer Products"
          width={990}
          height={126}
          priority
          className="h-5 w-auto dark:invert sm:h-8"
        />
        <Image
          src="/brand/godrej-signature.png"
          alt="Godrej"
          width={876}
          height={418}
          priority
          className="h-5 w-auto dark:invert sm:h-8"
        />
      </footer>
    </div>
  );
}
