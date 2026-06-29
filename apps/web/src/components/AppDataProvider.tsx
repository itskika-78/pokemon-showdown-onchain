'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useSession } from '@/components/Providers';
import { apiClient, type AssetsResponse, type DasSettingsResponse } from '@/lib/api';
import { clientCache, dedupeFetch } from '@/lib/clientCache';
import { DAS_SETTINGS_CHANGED, readNetworkChangeDetail } from '@/lib/networkEvents';

const EMPTY_ASSETS: AssetsResponse = { cards: [], profiles: {}, unsupported: [] };

function hasWalletAssets(d: AssetsResponse | null | undefined): boolean {
  return !!d && (d.cards.length > 0 || d.unsupported.length > 0);
}

interface AppDataCtx {
  assets: AssetsResponse | null;
  teamIds: string[];
  settings: DasSettingsResponse | null;
  syncing: boolean;
  assetsError: string | null;
  refreshAssets: (chainSync?: boolean) => Promise<void>;
  refreshTeam: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  setTeamIds: Dispatch<SetStateAction<string[]>>;
}

const Ctx = createContext<AppDataCtx>({
  assets: null,
  teamIds: [],
  settings: null,
  syncing: false,
  assetsError: null,
  refreshAssets: async () => {},
  refreshTeam: async () => {},
  refreshSettings: async () => {},
  setTeamIds: () => {},
});

export const useAppData = () => useContext(Ctx);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession();
  const [assets, setAssets] = useState<AssetsResponse | null>(() => {
    const cached = clientCache.getAssets();
    return hasWalletAssets(cached) ? cached : null;
  });
  const [teamIds, setTeamIds] = useState<string[]>(() => clientCache.getTeam()?.assetIds ?? []);
  const [settings, setSettings] = useState<DasSettingsResponse | null>(() => clientCache.getSettings());
  const [syncing, setSyncing] = useState(false);
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const refreshAssets = useCallback(async (chainSync = false) => {
    const cached = clientCache.getAssets();
    const showSpinner = chainSync || !hasWalletAssets(cached);
    if (showSpinner) setSyncing(true);
    try {
      const d = await dedupeFetch(chainSync ? 'assets-sync' : 'assets', () =>
        apiClient.assets(chainSync),
      );
      setAssets(d);
      setAssetsError(null);
      clientCache.setAssets(d);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load collection';
      setAssetsError(msg);
      if (hasWalletAssets(cached)) {
        setAssets(cached);
      } else {
        setAssets(EMPTY_ASSETS);
      }
    } finally {
      if (showSpinner) setSyncing(false);
    }
  }, []);

  const refreshTeam = useCallback(async () => {
    try {
      const t = await dedupeFetch('team', () => apiClient.getTeam());
      setTeamIds(t.assetIds);
      clientCache.setTeam(t);
    } catch {
      /* keep stale */
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await dedupeFetch('settings', () => apiClient.getSettings());
      setSettings(s);
      clientCache.setSettings(s);
    } catch {
      /* keep stale */
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setAssets(null);
      setTeamIds([]);
      setSettings(null);
      setAssetsError(null);
      return;
    }

    const cachedAssets = clientCache.getAssets();
    const cachedTeam = clientCache.getTeam();
    const cachedSettings = clientCache.getSettings();
    if (hasWalletAssets(cachedAssets)) setAssets(cachedAssets);
    if (cachedTeam) setTeamIds(cachedTeam.assetIds);
    if (cachedSettings) setSettings(cachedSettings);

    void refreshTeam();
    void refreshSettings();

    void (async () => {
      await refreshAssets(false);
      void refreshAssets(true);
    })();
  }, [signedIn, refreshAssets, refreshTeam, refreshSettings]);

  useEffect(() => {
    const onRefresh = (ev: Event) => {
      const detail = readNetworkChangeDetail(ev);
      if (detail) {
        setSettings((prev) =>
          prev
            ? { ...prev, mode: detail.mode, cluster: detail.cluster }
            : prev,
        );
        clientCache.setSettings({
          ...(clientCache.getSettings() ?? {
            mode: detail.mode,
            cluster: detail.cluster,
            rpcConfigured: { mainnet: true, devnet: true, active: true },
            canEditMode: true,
            lockedMode: null,
            supportedCollections: [],
          }),
          mode: detail.mode,
          cluster: detail.cluster,
        });
      }
      void refreshAssets(true);
      void refreshTeam();
    };
    window.addEventListener(DAS_SETTINGS_CHANGED, onRefresh);
    return () => {
      window.removeEventListener(DAS_SETTINGS_CHANGED, onRefresh);
    };
  }, [refreshAssets, refreshTeam]);

  useEffect(() => {
    const onBalanceRefresh = () => {
      void refreshAssets(true);
      void refreshTeam();
    };
    window.addEventListener('balance-refresh', onBalanceRefresh);
    return () => window.removeEventListener('balance-refresh', onBalanceRefresh);
  }, [refreshAssets, refreshTeam]);

  const value = useMemo<AppDataCtx>(
    () => ({
      assets,
      teamIds,
      settings,
      syncing,
      assetsError,
      refreshAssets,
      refreshTeam,
      refreshSettings,
      setTeamIds,
    }),
    [assets, teamIds, settings, syncing, assetsError, refreshAssets, refreshTeam, refreshSettings],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
