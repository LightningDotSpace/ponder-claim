import { createConfig, rateLimit } from "ponder";
import { http } from "viem";
import { ERC20SwapABI } from "./abis/ERC20Swap";
import { CoinSwapABI } from "./abis/CoinSwap";
import { citreaTransport } from "./citrea-transport-fix";

const targetChain = (process.env.TARGET_CHAIN as "testnet" | "mainnet") || "mainnet";

// Chain IDs - keep in sync with src/utils/constants.ts
const CHAIN_IDS = {
  CITREA_MAINNET: 4114,
  CITREA_TESTNET: 5115,
  POLYGON_MAINNET: 137,
  POLYGON_TESTNET_AMOY: 80002, // Amoy testnet (Mumbai deprecated)
  ETHEREUM_MAINNET: 1,
} as const;

const config = {
  testnet: {
    citrea: { chainId: CHAIN_IDS.CITREA_TESTNET, rpc: process.env.RPC_CITREA_TESTNET! },
    polygon: { chainId: CHAIN_IDS.POLYGON_TESTNET_AMOY, rpc: process.env.RPC_POLYGON_TESTNET! },
    ethereum: { chainId: CHAIN_IDS.ETHEREUM_MAINNET, rpc: process.env.RPC_ETHEREUM! },
    contracts: {
      citreaERC20: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
      citreaCoin: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
      polygonERC20: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
      ethereumERC20: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
    },
    startBlocks: { citrea: 18332348, polygon: 50000000, ethereum: 19000000 },
  },
  mainnet: {
    citrea: { chainId: CHAIN_IDS.CITREA_MAINNET, rpc: process.env.RPC_CITREA_MAINNET! },
    polygon: { chainId: CHAIN_IDS.POLYGON_MAINNET, rpc: process.env.RPC_POLYGON! },
    ethereum: { chainId: CHAIN_IDS.ETHEREUM_MAINNET, rpc: process.env.RPC_ETHEREUM! },
    contracts: {
      citreaERC20: "0x7397F25F230f7d5A83c18e1B68b32511bf35F860",
      citreaCoin: "0xFD92F846fe6E7d08d28D6A88676BB875E5D906ab",
      polygonERC20: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
      ethereumERC20: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
    },
    startBlocks: { citrea: 2684260, polygon: 50000000, ethereum: 19000000 },
  },
};

const c = config[targetChain];

export default createConfig({
  ordering: "multichain",
  chains: {
    citrea: {
      id: c.citrea.chainId,
      rpc: rateLimit(citreaTransport(c.citrea.rpc), { requestsPerSecond: 10 }),
    },
    polygon: {
      id: c.polygon.chainId,
      rpc: rateLimit(http(c.polygon.rpc), { requestsPerSecond: 25 }),
    },
    ethereum: {
      id: c.ethereum.chainId,
      rpc: rateLimit(http(c.ethereum.rpc), { requestsPerSecond: 25 }),
    },
  },
  contracts: {
    // Citrea Contracts (existing, renamed)
    CoinSwapCitrea: {
      chain: "citrea",
      address: c.contracts.citreaCoin as `0x${string}`,
      startBlock: c.startBlocks.citrea,
      abi: CoinSwapABI,
    },
    ERC20SwapCitrea: {
      chain: "citrea",
      address: c.contracts.citreaERC20 as `0x${string}`,
      startBlock: c.startBlocks.citrea,
      abi: ERC20SwapABI,
    },
    // Polygon Contract (new)
    ERC20SwapPolygon: {
      chain: "polygon",
      address: c.contracts.polygonERC20 as `0x${string}`,
      startBlock: c.startBlocks.polygon,
      abi: ERC20SwapABI,
    },
    // Ethereum Contract (new)
    ERC20SwapEthereum: {
      chain: "ethereum",
      address: c.contracts.ethereumERC20 as `0x${string}`,
      startBlock: c.startBlocks.ethereum,
      abi: ERC20SwapABI,
    },
  },
});
