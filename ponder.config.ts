import { createConfig, rateLimit } from "ponder";

import { CoinSwapABI } from "./abis/CoinSwap";
import { ERC20SwapABI } from "./abis/ERC20Swap";
import { citreaTransport } from "./citrea-transport-fix";


export default createConfig({
  chains: {
    testnet: {
      id: 5115,
      rpc: rateLimit(citreaTransport(process.env.RPC_PROVIDER_URL!), {
        requestsPerSecond: 10,
      }),
    },
  },
  contracts: {
    CoinSwapAbi: {
      chain: "testnet",
      abi: CoinSwapABI,
      address: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
      startBlock: 18332348,
    },
    ERC20SwapCitrea: {
      chain: "testnet",
      abi: ERC20SwapABI,
      address: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
      startBlock: 18286296, 
    },
  },
});
