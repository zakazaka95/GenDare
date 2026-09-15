// EIP-1193 injected provider discovery (Rabby / MetaMask). Browser-only.

import { STUDIO_NEXT_CHAIN_ID_HEX, STUDIO_NEXT_WALLET_CHAIN } from "./network";

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: Eip1193Provider[];
};

export { STUDIO_NEXT_CHAIN_ID_HEX, STUDIO_NEXT_WALLET_CHAIN };

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

/**
 * Pick an injected provider that works for both Rabby and MetaMask.
 * Rabby coexists with MetaMask via `window.ethereum.providers`.
 * Preference order: Rabby → MetaMask → first available.
 */
export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const eth = window.ethereum;
  if (!eth) return null;

  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    const rabby = eth.providers.find((p) => p.isRabby);
    if (rabby) return rabby;
    const mm = eth.providers.find((p) => p.isMetaMask && !p.isRabby);
    if (mm) return mm;
    return eth.providers[0];
  }
  return eth;
}

/** Switch the selected injected provider to Studio Next, adding it when absent. */
export async function switchOrAddStudioNext(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: STUDIO_NEXT_CHAIN_ID_HEX }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902 && code !== -32603) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [STUDIO_NEXT_WALLET_CHAIN],
    });
  }
}
