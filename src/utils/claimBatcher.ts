import { ethers } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import { ERC20SwapABI } from "../../abis/ERC20Swap";
import { getSigner, prefix0x } from "./evm";
import { transactionQueue } from "./transactionQueue";
import { signBroadcastAndWait } from "./broadcastTx";
import { CONTRACT_ADDRESSES, SwapType } from "../../constants";

const BATCH_WINDOW_MS = 5_000;
const TX_WAIT_TIMEOUT_MS = 40_000;

export interface ClaimResult {
  txHash: string;
  swapType: string;
  chainId: number;
  batched: boolean;
}

export interface ClaimParams {
  preimage: string;
  amount: bigint;
  claimAddress: string;
  refundAddress: string;
  timelock: bigint;
  tokenAddress?: string | null;
  swapType: string;
  chainId: number;
  lockupId: string;
}

interface PendingClaim extends ClaimParams {
  resolve: (result: ClaimResult) => void;
  reject: (error: Error) => void;
}

class ClaimBatcher {
  private batches = new Map<string, PendingClaim[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  private getBatchKey(claim: ClaimParams): string {
    const isErc20 = claim.swapType === SwapType.ERC20 || !!claim.tokenAddress;
    return `${claim.chainId}:${isErc20 ? "erc20" : "native"}:${claim.tokenAddress || "coin"}`;
  }

  enqueue(params: ClaimParams): Promise<ClaimResult> {
    return new Promise((resolve, reject) => {
      const key = this.getBatchKey(params);

      if (!this.batches.has(key)) {
        this.batches.set(key, []);
      }
      this.batches.get(key)!.push({ ...params, resolve, reject });

      if (!this.timers.has(key)) {
        this.timers.set(
          key,
          setTimeout(() => this.flush(key), BATCH_WINDOW_MS)
        );
      }
    });
  }

  private async flush(key: string): Promise<void> {
    this.timers.delete(key);

    const claims = this.batches.get(key);
    this.batches.delete(key);

    if (!claims || claims.length === 0) return;

    if (claims.length === 1) {
      await this.executeIndividual(claims[0]!);
      return;
    }

    console.log(`[ClaimBatcher] Flushing batch of ${claims.length} claims for ${key}`);

    try {
      await this.executeBatch(claims);
    } catch (error) {
      console.warn(
        `[ClaimBatcher] Batch failed for ${key}, falling back to individual claims:`,
        error instanceof Error ? error.message : error
      );
      await this.fallbackToIndividual(claims);
    }
  }

  private async executeBatch(claims: PendingClaim[]): Promise<void> {
    const { chainId, swapType, tokenAddress } = claims[0]!;
    const contracts = CONTRACT_ADDRESSES[chainId];

    if (!contracts) {
      throw new Error(`No contracts for chainId ${chainId}`);
    }

    const { erc20Swap: erc20SwapAddr, coinSwap: coinSwapAddr } = contracts;
    const isErc20 = swapType === SwapType.ERC20 || !!tokenAddress;
    const preimages = claims.map((c) => prefix0x(c.preimage));
    const amounts = claims.map((c) => c.amount);
    const refundAddresses = claims.map((c) => c.refundAddress);
    const timelocks = claims.map((c) => c.timelock);

    const txHash = await transactionQueue.enqueue(chainId, async () => {
      const signer = getSigner(chainId);

      if (isErc20) {
        const erc20Swap = new ethers.Contract(erc20SwapAddr, ERC20SwapABI, signer);
        const unsignedTx = await erc20Swap.getFunction("claimBatch")
          .populateTransaction(tokenAddress, preimages, amounts, refundAddresses, timelocks);
        const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
        return receipt.hash;
      } else if (coinSwapAddr) {
        const coinSwap = new ethers.Contract(coinSwapAddr, CoinSwapABI, signer);
        const unsignedTx = await coinSwap.getFunction("claimBatch")
          .populateTransaction(preimages, amounts, refundAddresses, timelocks);
        const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
        return receipt.hash;
      } else {
        throw new Error(`No CoinSwap contract for chainId ${chainId}`);
      }
    });

    const effectiveSwapType = isErc20 ? SwapType.ERC20 : SwapType.NATIVE;

    for (const claim of claims) {
      claim.resolve({ txHash, swapType: effectiveSwapType, chainId, batched: true });
    }
  }

  private async fallbackToIndividual(claims: PendingClaim[]): Promise<void> {
    for (const claim of claims) {
      await this.executeIndividual(claim);
    }
  }

  private async executeIndividual(claim: PendingClaim): Promise<void> {
    const { chainId, swapType, tokenAddress, preimage, amount, claimAddress, refundAddress, timelock } = claim;
    const contracts = CONTRACT_ADDRESSES[chainId];

    if (!contracts) {
      claim.reject(new Error(`No contracts for chainId ${chainId}`));
      return;
    }

    const { erc20Swap: erc20SwapAddr, coinSwap: coinSwapAddr } = contracts;

    try {
      const result = await transactionQueue.enqueue(chainId, async () => {
        const signer = getSigner(chainId);
        const isErc20 = swapType === SwapType.ERC20 || !!tokenAddress;

        if (isErc20) {
          const erc20Swap = new ethers.Contract(erc20SwapAddr, ERC20SwapABI, signer);
          const unsignedTx = await erc20Swap.getFunction("claim(bytes32,uint256,address,address,address,uint256)")
            .populateTransaction(prefix0x(preimage), amount, tokenAddress, claimAddress, refundAddress, timelock);
          const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
          return { txHash: receipt.hash, swapType: SwapType.ERC20 };
        } else if (coinSwapAddr) {
          const coinSwap = new ethers.Contract(coinSwapAddr, CoinSwapABI, signer);
          const unsignedTx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")
            .populateTransaction(prefix0x(preimage), amount, claimAddress, refundAddress, timelock);
          const receipt = await signBroadcastAndWait(signer, chainId, unsignedTx, 1, TX_WAIT_TIMEOUT_MS);
          return { txHash: receipt.hash, swapType: SwapType.NATIVE };
        } else {
          throw new Error(`No CoinSwap contract for chainId ${chainId}`);
        }
      });

      claim.resolve({ ...result, chainId, batched: false });
    } catch (error) {
      claim.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export const claimBatcher = new ClaimBatcher();
