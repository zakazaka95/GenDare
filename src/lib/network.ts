import { studioDevnet } from "genlayer-js/chains";

// The SDK RC currently exposes the v0.6 Studio network as `studioDevnet`.
// Studio Next uses that same chain configuration and chain ID, with a new
// developer-facing RPC. One shared definition keeps reads, writes,
// Transaction Kit, and injected wallets on the exact same network.
export const STUDIO_NEXT_RPC_URL = "https://studio-next.genlayer.com/api";
export const STUDIO_NEXT_EXPLORER_URL = "https://explorer-studio-dev.genlayer.com";

export const STUDIO_NEXT_CHAIN = {
  ...studioDevnet,
  name: "GenLayer Studio Next",
  rpcUrls: {
    default: {
      http: [STUDIO_NEXT_RPC_URL],
    },
  },
} satisfies typeof studioDevnet;

export const STUDIO_NEXT_CHAIN_ID_HEX = `0x${STUDIO_NEXT_CHAIN.id.toString(16)}`.toLowerCase();

export const STUDIO_NEXT_WALLET_CHAIN = {
  chainId: STUDIO_NEXT_CHAIN_ID_HEX,
  chainName: STUDIO_NEXT_CHAIN.name,
  nativeCurrency: STUDIO_NEXT_CHAIN.nativeCurrency,
  rpcUrls: [STUDIO_NEXT_RPC_URL],
  blockExplorerUrls: [STUDIO_NEXT_EXPLORER_URL],
} as const;
