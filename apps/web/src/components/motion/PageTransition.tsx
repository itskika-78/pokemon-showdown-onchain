'use client';

/** No animation — tab switches should feel instant. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
