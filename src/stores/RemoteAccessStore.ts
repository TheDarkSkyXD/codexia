import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { RemoteUiConfigInput, RemoteUiStatus } from "@/types/remote";

interface RemoteAccessStore {
  config: RemoteUiConfigInput;
  status: RemoteUiStatus | null;
  loading: boolean;
  setConfig: (update: Partial<RemoteUiConfigInput>) => void;
  setStatus: (status: RemoteUiStatus | null) => void;
  setLoading: (loading: boolean) => void;
  resetStatus: () => void;
}

const DEFAULT_CONFIG: RemoteUiConfigInput = {
  port: 7420,
  allowedOrigin: "any",
  minimizeApp: false,
  applicationUi: true,
  enableInfoUrl: true,
  bundlePath: undefined,
  externalHost: undefined,
};

export const useRemoteAccessStore = create<RemoteAccessStore>()(
  persist(
    (set) => ({
      config: DEFAULT_CONFIG,
      status: null,
      loading: false,
      setConfig: (update) =>
        set((state) => ({
          config: { ...state.config, ...update },
        })),
      setStatus: (status) => set({ status }),
      setLoading: (loading) => set({ loading }),
      resetStatus: () => set({ status: null }),
    }),
    {
      name: "remote-access-settings",
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState as Partial<RemoteAccessStore>) ?? {};
        const mergedConfig = {
          ...DEFAULT_CONFIG,
          ...state.config,
        };

        if ((version ?? 0) < 1) {
          mergedConfig.applicationUi = true;
        }

        return {
          config: mergedConfig,
          status: state.status ?? null,
          loading: false,
        } satisfies Partial<RemoteAccessStore>;
      },
    },
  ),
);
