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

interface AppDataCtx {
  assets: AssetsResponse | null;
  teamIds: string[];
  settings: DasSettingsResponse | null;
  syncing: boolean;
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
  refreshAssets: async () => {},
  refreshTeam: async () => {},
  refreshSettings: async () => {},
  setTeamIds: () => {},
});

export const useAppData = () => useContext(Ctx);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useSession();
  const [assets, setAssets] = useState<AssetsResponse | null>(() => clientCache.getAssets());
  const [teamIds, setTeamIds] = useState<string[]>(() => clientCache.getTeam()?.assetIds ?? []);
  const [settings, setSettings] = useState<DasSettingsResponse | null>(() => clientCache.getSettings());
  const [syncing, setSyncing] = useState(false);

  const refreshAssets = useCallback(async (chainSync = false) => {
    const showSpinner = chainSync || !clientCache.getAssets();
    if (showSpinner) setSyncing(true);
    try {
      const d = await dedupeFetch(chainSync ? 'assets-sync' : 'assets', () =>
        apiClient.assets(chainSync),
      );
      setAssets(d);
      clientCache.setAssets(d);
    } catch {
      /* keep stale cache on error */
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
      return;
    }

    const cachedAssets = clientCache.getAssets();
    const cachedTeam = clientCache.getTeam();
    const cachedSettings = clientCache.getSettings();
    if (cachedAssets) setAssets(cachedAssets);
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
    const onRefresh = () => {
      void refreshAssets(true);
      void refreshTeam();
    };
    window.addEventListener('das-settings-changed', onRefresh);
    window.addEventListener('balance-refresh', onRefresh);
    return () => {
      window.removeEventListener('das-settings-changed', onRefresh);
      window.removeEventListener('balance-refresh', onRefresh);
    };
  }, [refreshAssets, refreshTeam]);

  const value = useMemo<AppDataCtx>(
    () => ({
      assets,
      teamIds,
      settings,
      syncing,
      refreshAssets,
      refreshTeam,
      refreshSettings,
      setTeamIds,
    }),
    [assets, teamIds, settings, syncing, refreshAssets, refreshTeam, refreshSettings],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
