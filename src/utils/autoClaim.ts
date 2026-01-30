import { ethers } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "./evm";
import { SwapType, CONTRACT_ADDRESSES } from "../../constants";
import { transactionQueue } from "./transactionQueue";

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
