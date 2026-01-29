// Swap types
export enum SwapType {
  NATIVE = "native",
  ERC20 = "erc20",
}

// Chain IDs
export const CHAIN_IDS = {
  CITREA_MAINNET: 4114,
  CITREA_TESTNET: 5115,
  POLYGON_MAINNET: 137,
  POLYGON_TESTNET_AMOY: 80002,
  ETHEREUM_MAINNET: 1,
} as const;

// Chain RPC URLs
export const CHAIN_RPC_URLS: Record<number, string | undefined> = {
  [CHAIN_IDS.CITREA_MAINNET]: process.env.RPC_CITREA_MAINNET,
  [CHAIN_IDS.CITREA_TESTNET]: process.env.RPC_CITREA_TESTNET,
  [CHAIN_IDS.POLYGON_MAINNET]: process.env.RPC_POLYGON,
  [CHAIN_IDS.POLYGON_TESTNET_AMOY]: process.env.RPC_POLYGON_TESTNET,
  [CHAIN_IDS.ETHEREUM_MAINNET]: process.env.RPC_ETHEREUM,
};

// Contract addresses by chain ID
export const CONTRACT_ADDRESSES: Record<number, { coinSwap?: string; erc20Swap: string }> = {
  4114: { // Citrea Mainnet
    coinSwap: "0xFD92F846fe6E7d08d28D6A88676BB875E5D906ab",
    erc20Swap: "0x7397F25F230f7d5A83c18e1B68b32511bf35F860",
  },
  5115: { // Citrea Testnet
    coinSwap: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
    erc20Swap: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
  },
  137: { // Polygon Mainnet
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
  80002: { // Polygon Testnet (Amoy)
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
  1: { // Ethereum Mainnet
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
};
