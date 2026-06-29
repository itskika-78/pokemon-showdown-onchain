'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import bs58 from 'bs58';
import { clientConfig, endpointForCluster } from '@/lib/clientConfig';
import { apiClient, clearToken, getToken, setToken, type DasNetwork } from '@/lib/api';
import { warmSessionCaches } from '@/lib/clientCache';
import { DAS_SETTINGS_CHANGED, readNetworkChangeDetail } from '@/lib/networkEvents';
import '@solana/wallet-adapter-react-ui/styles.css';

/* ---------------- network (data source / cluster) ---------------- */

export interface NetworkInfo {
  mode: DasNetwork;
  cluster: 'mainnet-beta' | 'devnet';
  onChain: boolean;
}

const NetworkContext = createContext<NetworkInfo | null>(null);
export const useNetwork = () => useContext(NetworkContext);

/* ---------------- session (SIWS) ---------------- */

interface SessionCtx {
  pubkey: string | null;
  token: string | null;
  signedIn: boolean;
  signingIn: boolean;
  signIn: () => Promise<void>;
  signOut: () => void;
  error: string | null;
}

const SessionContext = createContext<SessionCtx>({
  pubkey: null,
  token: null,
  signedIn: false,
  signingIn: false,
  signIn: async () => {},
  signOut: () => {},
  error: null,
});

export const useSession = () => useContext(SessionContext);

function SessionProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect } = useWallet();
  const [token, setTok] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getToken() : null,
  );
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTok(getToken()), []);

  useEffect(() => {
    if (!token) return;
    void import('@/lib/clientCache').then(({ warmSessionCaches }) => warmSessionCaches());
  }, [token]);

  // A stale/expired token (cleared by the api client on a 401) drops us back to
  // the signed-out state so the user can re-authenticate instead of looping on
  // "unauthorized" while the nav still shows them signed in.
  useEffect(() => {
    const onExpired = () => setTok(null);
    window.addEventListener('session-expired', onExpired);
    return () => window.removeEventListener('session-expired', onExpired);
  }, []);

  const pubkey = publicKey?.toBase58() ?? null;

  const signIn = useCallback(async () => {
    setError(null);
    if (!publicKey || !signMessage) {
      setError('Connect a wallet first');
      return;
    }
    setSigningIn(true);
    try {
      const pk = publicKey.toBase58();
      const { message } = await apiClient.nonce(pk);
      const sig = await signMessage(new TextEncoder().encode(message));
      const { token: jwt } = await apiClient.verify({ pubkey: pk, message, signature: bs58.encode(sig) });
      setToken(jwt);
      setTok(jwt);
      void warmSessionCaches();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed';
      setError(msg);
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  const signOut = useCallback(() => {
    clearToken();
    setTok(null);
    void import('@/lib/clientCache').then(({ clientCache }) => clientCache.clearAll());
    void disconnect();
  }, [disconnect]);

  const value = useMemo<SessionCtx>(
    () => ({ pubkey, token, signedIn: !!token, signingIn, signIn, signOut, error }),
    [pubkey, token, signingIn, signIn, signOut, error],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

const NETWORK_CACHE_KEY = 'battler_network';

function defaultNetwork(): NetworkInfo {
  const cluster = clientConfig.cluster === 'devnet' ? 'devnet' : 'mainnet-beta';
  return { mode: cluster === 'devnet' ? 'devnet' : 'mainnet', cluster, onChain: true };
}

function readCachedNetwork(): NetworkInfo | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(NETWORK_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NetworkInfo;
  } catch {
    return null;
  }
}

function persistNetworkCache(n: NetworkInfo): void {
  try {
    sessionStorage.setItem(NETWORK_CACHE_KEY, JSON.stringify(n));
  } catch {
    /* quota */
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  const [network, setNetwork] = useState<NetworkInfo | null>(() => readCachedNetwork() ?? defaultNetwork());

  useEffect(() => {
    let alive = true;
    const load = () => {
      apiClient
        .network()
        .then((n) => {
          if (!alive) return;
          setNetwork(n);
          persistNetworkCache(n);
        })
        .catch(() => {
          if (alive) setNetwork((prev) => prev ?? defaultNetwork());
        });
    };
    const onSettingsChanged = (ev: Event) => {
      const detail = readNetworkChangeDetail(ev);
      if (detail) {
        const optimistic: NetworkInfo = { mode: detail.mode, cluster: detail.cluster, onChain: true };
        setNetwork(optimistic);
        persistNetworkCache(optimistic);
      }
      load();
    };
    load();
    window.addEventListener(DAS_SETTINGS_CHANGED, onSettingsChanged);
    return () => {
      alive = false;
      window.removeEventListener(DAS_SETTINGS_CHANGED, onSettingsChanged);
    };
  }, []);

  const cluster = network?.cluster ?? (clientConfig.cluster === 'devnet' ? 'devnet' : 'mainnet-beta');
  const endpoint = useMemo(() => endpointForCluster(cluster), [cluster]);

  return (
    <NetworkContext.Provider value={network}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect={false}>
          <WalletModalProvider>
            <SessionProvider>{children}</SessionProvider>
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </NetworkContext.Provider>
  );
}
