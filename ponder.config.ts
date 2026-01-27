import { createConfig, rateLimit } from "ponder";

import { CoinSwapABI } from "./abis/CoinSwap";
import { ERC20SwapABI } from "./abis/ERC20Swap";
import { citreaTransport } from "./citrea-transport-fix";


export default createConfig({
  chains: {
    testnet: {
      id: 5115,
      rpc: rateLimit(citreaTransport(process.env.TESTNET_RPC_PROVIDER_URL || "https://dev.rpc.testnet.juiceswap.com/"), {
        requestsPerSecond: 10,
      }),
    },
    mainnet: {
      id: 4114,
      rpc: rateLimit(citreaTransport(process.env.MAINNET_RPC_PROVIDER_URL || "https://rpc.citreascan.com/"), {
        requestsPerSecond: 10,
      }),
    },
  },
  contracts: {
    CoinSwapAbi: {
      chain: {
        testnet: {
          address: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
          startBlock: 18332348,
        },
        mainnet: {
          address: "0xfd92f846fe6e7d08d28d6a88676bb875e5d906ab",
          startBlock: 2684260,
        }
      },
      abi: CoinSwapABI,
    },
    ERC20SwapCitrea: {
      chain: {
        testnet: {
          address: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
          startBlock: 18286296, 
        },
        mainnet: {
          address: "0x7397f25f230f7d5a83c18e1b68b32511bf35f860",
          startBlock: 2684260,
        }
      },
      abi: ERC20SwapABI,
    },
  },
});
