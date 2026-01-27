import { createConfig, rateLimit } from "ponder";

import { CoinSwapABI } from "./abis/CoinSwap";
import { ERC20SwapABI } from "./abis/ERC20Swap";
import { citreaTransport } from "./citrea-transport-fix";

const rpcProviderUrl = process.env.RPC_PROVIDER_URL!;
const targetChain = (process.env.TARGET_CHAIN as "testnet" | "mainnet") || "mainnet";

const chainIds = {
  testnet: 5115,
  mainnet: 4114,
}

const contractAddresses = {
  testnet: {
    CoinSwapAbi: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65" as `0x${string}`,
    ERC20SwapCitrea: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc" as `0x${string}`,
  },
  mainnet: {
    CoinSwapAbi: "0xfd92f846fe6e7d08d28d6a88676bb875e5d906ab" as `0x${string}`,
    ERC20SwapCitrea: "0x7397f25f230f7d5a83c18e1b68b32511bf35f860" as `0x${string}`,
  },
}

const startBlocks = {
  testnet: 18332348,
  mainnet: 2684260,
}
export default createConfig({
  chains: {
    [targetChain]: {
      id: chainIds[targetChain],
      rpc: rateLimit(citreaTransport(rpcProviderUrl), {
        requestsPerSecond: 10,
      }),
    },
  },
  contracts: {
    CoinSwapAbi: {
      chain: targetChain,
      address: contractAddresses[targetChain].CoinSwapAbi,
      startBlock: startBlocks[targetChain],
      abi: CoinSwapABI,
    },
    ERC20SwapCitrea: {
      chain: targetChain,
      address: contractAddresses[targetChain].ERC20SwapCitrea,
      startBlock: startBlocks[targetChain],
      abi: ERC20SwapABI,
    },
  },
});
