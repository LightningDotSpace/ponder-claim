import { createConfig, rateLimit } from "ponder";

import { CoinSwapABI } from "./abis/CoinSwap";
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
  },
});
