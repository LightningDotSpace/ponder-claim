import { ethers } from "ethers";
import { getSigner } from "./evm";
import { transactionQueue } from "./transactionQueue";
import { signAndBroadcast } from "./broadcastTx";
import { CONTRACT_ADDRESSES, SwapType } from "../../constants";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";

export interface SendClaimTxParams {
  chainId: number;
  preimage: string;
  claimAddress: string | null;
  refundAddress: string | null;
  amount: bigint | null;
  timelock: bigint | null;
  tokenAddress: string | null;
  swapType: string | null;
}

export async function sendClaimTx(params: SendClaimTxParams): Promise<{ txHash: string; swapType: string }> {
  const { chainId, preimage, claimAddress, refundAddress, amount, timelock, tokenAddress, swapType } = params;

  const contracts = CONTRACT_ADDRESSES[chainId];
  if (!contracts) throw new Error(`Unsupported chainId: ${chainId}`);

  const signer = getSigner(chainId);

  const { txResponse, swapType: resolvedSwapType } = await transactionQueue.enqueue(chainId, async () => {
    if (swapType === SwapType.ERC20 || tokenAddress) {
      const erc20Swap = new ethers.Contract(contracts.erc20Swap, ERC20SwapABI, signer);
      const unsignedTx = await erc20Swap
        .getFunction("claim(bytes32,uint256,address,address,address,uint256)")
        .populateTransaction(preimage, amount, tokenAddress, claimAddress, refundAddress, timelock);
      return { txResponse: await signAndBroadcast(signer, chainId, unsignedTx), swapType: SwapType.ERC20 };
    } else if (contracts.coinSwap) {
      const coinSwap = new ethers.Contract(contracts.coinSwap, CoinSwapABI, signer);
      const unsignedTx = await coinSwap
        .getFunction("claim(bytes32,uint256,address,address,uint256)")
        .populateTransaction(preimage, amount, claimAddress, refundAddress, timelock);
      return { txResponse: await signAndBroadcast(signer, chainId, unsignedTx), swapType: SwapType.NATIVE };
    } else {
      throw new Error(`No CoinSwap contract for chainId ${chainId}`);
    }
  });

  return { txHash: txResponse.hash, swapType: resolvedSwapType };
}
