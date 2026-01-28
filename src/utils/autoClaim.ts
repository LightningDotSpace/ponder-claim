import { ethers } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { createSigner, prefix0x } from "./evm";
import { SwapType } from "./constants";

const contractAddresses = {
  testnet: {
    CoinSwapAbi: "0xd02731fD8c5FDD53B613A699234FAd5EE8851B65",
    ERC20SwapCitrea: "0xf2e019a371e5Fd32dB2fC564Ad9eAE9E433133cc",
  },
  mainnet: {
    CoinSwapAbi: "0xfd92f846fe6e7d08d28d6a88676bb875e5d906ab",
    ERC20SwapCitrea: "0x7397f25f230f7d5a83c18e1b68b32511bf35f860",
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
  const signer = createSigner(process.env.SIGNER_PRIVATE_KEY!);
  const chainName = chainId === 5115 ? "testnet" : "mainnet";

  if (lockupData.claimed || lockupData.refunded) {
    return { success: false, error: "Lockup already claimed or refunded" };
  }

  const { amount, claimAddress, refundAddress, timelock, swapType, tokenAddress } = lockupData;

  if (!amount || !claimAddress || !refundAddress || !timelock) {
    return { success: false, error: "Missing lockup data" };
  }

  try {
    if (swapType === SwapType.ERC20) {
      const erc20SwapAddress = contractAddresses[chainName].ERC20SwapCitrea;
      const erc20Swap = new ethers.Contract(erc20SwapAddress, ERC20SwapABI, signer);

      const tx = await erc20Swap.getFunction("claim(bytes32,uint256,address,address,address,uint256)")(
        prefix0x(preimage),
        amount,
        tokenAddress,
        claimAddress,
        refundAddress,
        timelock
      );

      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash };
    } else {
      const coinSwapAddress = contractAddresses[chainName].CoinSwapAbi;
      const coinSwap = new ethers.Contract(coinSwapAddress, CoinSwapABI, signer);

      const tx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")(
        prefix0x(preimage),
        Number(amount),
        claimAddress,
        refundAddress,
        timelock
      );

      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Auto-claim failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}
