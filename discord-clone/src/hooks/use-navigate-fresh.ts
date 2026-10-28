'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

/**
 * Navigate, then refresh Server Components once the URL has changed.
 *
 * For pages whose layout must also update (a new channel in the sidebar, a
 * new server in the rail). Calling router.refresh() right after router.push()
 * makes Next 15 drop the push; waiting for the pathname to change avoids it.
 * The refresh fires on any change from the starting path, so redirects
 * (push('/') → /servers/…) are covered too.
 */
export function useNavigateFresh() {
  const router = useRouter();
  const pathname = usePathname();
  const pendingFrom = useRef<string | null>(null);

  useEffect(() => {
    if (pendingFrom.current !== null && pathname !== pendingFrom.current) {
      pendingFrom.current = null;
      router.refresh();
    }
  }, [pathname, router]);

  return useCallback(
    (url: string) => {
      pendingFrom.current = pathname;
      router.push(url);
    },
    [router, pathname],
  );
}
