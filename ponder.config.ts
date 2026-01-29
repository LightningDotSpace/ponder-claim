import { createConfig, rateLimit } from "ponder";
import { http } from "viem";
import { ERC20SwapABI } from "./abis/ERC20Swap";
import { CoinSwapABI } from "./abis/CoinSwap";
import { citreaTransport } from "./citrea-transport-fix";
import { CONTRACT_ADDRESSES, CHAIN_IDS, CHAIN_RPC_URLS } from "./constants";

const targetChain = (process.env.TARGET_CHAIN as "testnet" | "mainnet") || "mainnet";

const config = {
  testnet: {
    citrea: { chainId: CHAIN_IDS.CITREA_TESTNET, rpc: CHAIN_RPC_URLS[CHAIN_IDS.CITREA_TESTNET]! },
    polygon: { chainId: CHAIN_IDS.POLYGON_TESTNET_AMOY, rpc: CHAIN_RPC_URLS[CHAIN_IDS.POLYGON_TESTNET_AMOY]! },
    ethereum: { chainId: CHAIN_IDS.ETHEREUM_MAINNET, rpc: CHAIN_RPC_URLS[CHAIN_IDS.ETHEREUM_MAINNET]! },
    contracts: {
      citreaERC20: CONTRACT_ADDRESSES[CHAIN_IDS.CITREA_TESTNET]!.erc20Swap,
      citreaCoin: CONTRACT_ADDRESSES[CHAIN_IDS.CITREA_TESTNET]!.coinSwap!,
      polygonERC20: CONTRACT_ADDRESSES[CHAIN_IDS.POLYGON_TESTNET_AMOY]!.erc20Swap,
      ethereumERC20: CONTRACT_ADDRESSES[CHAIN_IDS.ETHEREUM_MAINNET]!.erc20Swap,
    },
    startBlocks: { citrea: 18332348, polygon: 50000000, ethereum: 19000000 },
  },
  mainnet: {
    citrea: { chainId: CHAIN_IDS.CITREA_MAINNET, rpc: CHAIN_RPC_URLS[CHAIN_IDS.CITREA_MAINNET]! },
    polygon: { chainId: CHAIN_IDS.POLYGON_MAINNET, rpc: CHAIN_RPC_URLS[CHAIN_IDS.POLYGON_MAINNET]! },
    ethereum: { chainId: CHAIN_IDS.ETHEREUM_MAINNET, rpc: CHAIN_RPC_URLS[CHAIN_IDS.ETHEREUM_MAINNET]! },
    contracts: {
      citreaERC20: CONTRACT_ADDRESSES[CHAIN_IDS.CITREA_MAINNET]!.erc20Swap,
      citreaCoin: CONTRACT_ADDRESSES[CHAIN_IDS.CITREA_MAINNET]!.coinSwap!,
      polygonERC20: CONTRACT_ADDRESSES[CHAIN_IDS.POLYGON_MAINNET]!.erc20Swap,
      ethereumERC20: CONTRACT_ADDRESSES[CHAIN_IDS.ETHEREUM_MAINNET]!.erc20Swap,
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
