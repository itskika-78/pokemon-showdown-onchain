'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/components/Providers';
import { LoginHero } from '@/components/LoginHero';

export default function LoginPage() {
  const { pubkey, signedIn, signIn, signingIn, error } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (signedIn) router.push('/collection');
  }, [signedIn, router]);

  return (
    <LoginHero
      pubkey={pubkey}
      signedIn={signedIn}
      signingIn={signingIn}
      error={error}
      onSignIn={() => void signIn()}
    />
  );
}
