'use client';

import { useEffect, useState } from 'react';
import { isFeatureNew } from '@/lib/featureFlags';

export function NewBadge({ featureId }: { featureId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(isFeatureNew(featureId));
    const onStorage = () => setShow(isFeatureNew(featureId));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [featureId]);

  if (!show) return null;
  return <span className="new-badge-dot" aria-label="New" title="New" />;
}
