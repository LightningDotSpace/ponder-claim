import { ethers } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "./evm";
import { SwapType, CHAIN_IDS } from "./constants";
import { transactionQueue } from "./transactionQueue";

const CONTRACT_ADDRESSES: Record<number, { coinSwap?: string; erc20Swap: string }> = {
  [CHAIN_IDS.CITREA_MAINNET]: { // Citrea Mainnet
    coinSwap: "0xFD92F846fe6E7d08d28D6A88676BB875E5D906ab",
    erc20Swap: "0x7397F25F230f7d5A83c18e1B68b32511bf35F860",
  },
  [CHAIN_IDS.CITREA_TESTNET]: { // Citrea Testnet
    coinSwap: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
    erc20Swap: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
  },
  [CHAIN_IDS.POLYGON_MAINNET]: { // Polygon Mainnet
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
  [CHAIN_IDS.POLYGON_TESTNET_AMOY]: { // Polygon Testnet (Amoy)
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
  [CHAIN_IDS.ETHEREUM_MAINNET]: { // Ethereum Mainnet
    erc20Swap: "0x2E21F58Da58c391F110467c7484EdfA849C1CB9B",
  },
};

interface LockupData {
  preimageHash: string;
  amount: bigint | null;
  claimAddress: string | null;
  refundAddress: string | null;
  timelock: bigint | null;
  tokenAddress: string | null;
  swapType: string | null;
  claimed: boolean | null;
  refunded: boolean | null;
}

export async function executeAutoClaim(
  preimage: string,
  lockupData: LockupData,
  chainId: number
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const contracts = CONTRACT_ADDRESSES[chainId];
  if (!contracts) {
    return { success: false, error: `Unsupported chainId: ${chainId}` };
  }

  if (lockupData.claimed || lockupData.refunded) {
    return { success: false, error: "Lockup already claimed or refunded" };
  }

  const { amount, claimAddress, refundAddress, timelock, swapType, tokenAddress } = lockupData;

  if (!amount || !claimAddress || !refundAddress || !timelock) {
    return { success: false, error: "Missing lockup data" };
  }

  try {
    const txHash = await transactionQueue.enqueue(chainId, async () => {
      const signer = getSigner(chainId);

      if (swapType === SwapType.ERC20 || tokenAddress) {
        const erc20Swap = new ethers.Contract(contracts.erc20Swap, ERC20SwapABI, signer);

        const tx = await erc20Swap.getFunction("claim(bytes32,uint256,address,address,address,uint256)")(
          prefix0x(preimage),
          amount,
          tokenAddress,
          claimAddress,
          refundAddress,
          timelock
        );

        const receipt = await tx.wait();
        return receipt.hash as string;
      } else if (contracts.coinSwap) {
        const coinSwap = new ethers.Contract(contracts.coinSwap, CoinSwapABI, signer);

        const tx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")(
          prefix0x(preimage),
          amount,
          claimAddress,
          refundAddress,
          timelock
        );

        const receipt = await tx.wait();
        return receipt.hash as string;
      } else {
        throw new Error(`No CoinSwap contract for chainId ${chainId}`);
      }
    });

    return { success: true, txHash };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Auto-claim failed on chain ${chainId}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}
