import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getClient } from "./contract";
import {
  getInjectedProvider,
  STUDIO_NEXT_CHAIN_ID_HEX,
  STUDIO_NEXT_WALLET_CHAIN,
  switchOrAddStudioNext,
  type Eip1193Provider,
} from "./injected";

export { getInjectedProvider, STUDIO_NEXT_CHAIN_ID_HEX, STUDIO_NEXT_WALLET_CHAIN };
export type { Eip1193Provider };

export type WalletStatus = "idle" | "connecting" | "switching" | "connected";

interface WalletState {
  address: string | null;
  chainId: string | null;
  status: WalletStatus;
  isStudioNext: boolean;
  hasWallet: boolean;
  showInstallModal: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchToStudioNext: () => Promise<boolean>;
  dismissInstallModal: () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

export function shortAddress(addr: string | null) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function requestStudioNext(provider: Eip1193Provider): Promise<boolean> {
  try {
    await switchOrAddStudioNext(provider);
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4001) {
      toast.error("Network switch rejected");
      return false;
    }
    toast.error("Couldn't switch network");
    return false;
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [hasWallet, setHasWallet] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

  // Detect provider on mount + try eager reconnect if already authorized
  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) {
      setHasWallet(false);
      return;
    }
    setHasWallet(true);

    let cancelled = false;
    (async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const cid = (await provider.request({ method: "eth_chainId" })) as string;
        if (cancelled) return;
        if (accounts && accounts.length > 0) {
          setAddress(accounts[0]);
          getClient(accounts[0]);
          setStatus("connected");
        }
        if (cid) setChainId(cid.toLowerCase());
      } catch {
        /* ignore */
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        setStatus("idle");
      } else {
        setAddress(accounts[0]);
        getClient(accounts[0]);
        setStatus("connected");
      }
    };
    const onChain = (...args: unknown[]) => {
      const cid = args[0] as string;
      setChainId(typeof cid === "string" ? cid.toLowerCase() : null);
    };

    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);

    return () => {
      cancelled = true;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchToStudioNext = useCallback(async (): Promise<boolean> => {
    const provider = getInjectedProvider();
    if (!provider) return false;
    setStatus("switching");
    const ok = await requestStudioNext(provider);
    if (ok) {
      try {
        const cid = (await provider.request({ method: "eth_chainId" })) as string;
        setChainId(cid?.toLowerCase() ?? null);
      } catch {
        /* ignore */
      }
      setStatus("connected");
    } else {
      setStatus(address ? "connected" : "idle");
    }
    return ok;
  }, [address]);

  const connect = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) {
      setShowInstallModal(true);
      return;
    }

    setStatus("connecting");
    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts || accounts.length === 0) {
        setStatus("idle");
        toast.error("No account returned");
        return;
      }
      setAddress(accounts[0]);
      getClient(accounts[0]);

      const cid = (await provider.request({ method: "eth_chainId" })) as string;
      const lower = cid?.toLowerCase() ?? null;
      setChainId(lower);

      if (lower !== STUDIO_NEXT_CHAIN_ID_HEX) {
        setStatus("switching");
        const ok = await requestStudioNext(provider);
        if (ok) {
          const cid2 = (await provider.request({ method: "eth_chainId" })) as string;
          setChainId(cid2?.toLowerCase() ?? null);
        }
      }

      setStatus("connected");
      toast.success("Wallet connected");
    } catch (err: unknown) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        toast.error("Connection rejected");
      } else if (code === -32002) {
        toast.error("Check your wallet — a request is already pending");
      } else {
        toast.error("Couldn't connect wallet");
      }
      setStatus(address ? "connected" : "idle");
    }
  }, [address]);

  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("idle");
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      chainId,
      status,
      isStudioNext: chainId === STUDIO_NEXT_CHAIN_ID_HEX,
      hasWallet,
      showInstallModal,
      connect,
      disconnect,
      switchToStudioNext,
      dismissInstallModal: () => setShowInstallModal(false),
    }),
    [
      address,
      chainId,
      status,
      hasWallet,
      showInstallModal,
      connect,
      disconnect,
      switchToStudioNext,
    ],
  );

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
