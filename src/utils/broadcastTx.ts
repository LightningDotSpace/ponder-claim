import { ethers } from "ethers";
import { PUBLIC_BROADCAST_RPCS } from "../../constants";

/**
 * Rebroadcast an already-signed raw transaction to public mempools.
 * Fire-and-forget: failures are logged but never propagated.
 */
const broadcastProviders = new Map<string, ethers.JsonRpcProvider>();

function getBroadcastProvider(chainId: number, rpcUrl: string): ethers.JsonRpcProvider {
  if (!broadcastProviders.has(rpcUrl)) {
    const staticNetwork = ethers.Network.from(chainId);
    broadcastProviders.set(rpcUrl, new ethers.JsonRpcProvider(rpcUrl, staticNetwork, { staticNetwork }));
  }
  return broadcastProviders.get(rpcUrl)!;
}

function rebroadcastToPublicMempools(chainId: number, signedTx: string): void {
  const rpcs = PUBLIC_BROADCAST_RPCS[chainId];
  if (!rpcs?.length) return;

  for (const rpcUrl of rpcs) {
    getBroadcastProvider(chainId, rpcUrl)
      .broadcastTransaction(signedTx)
      .then(() => console.log(`Rebroadcast OK → ${rpcUrl}`))
      .catch((e) => console.debug(`Rebroadcast failed → ${rpcUrl}: ${(e as Error).message}`));
  }
}

/**
 * Per-chain nonce tracker.
 * Avoids relying on the RPC's getTransactionCount("pending") which can be
 * stale right after a broadcast and cause nonce collisions.
 * Safe because all txs per chain are serialized via the transactionQueue.
 */
const nextNonce = new Map<number, number>();

async function acquireNonce(signer: ethers.Wallet, chainId: number): Promise<number> {
  const local = nextNonce.get(chainId);
  if (local !== undefined) return local;

  const rpcNonce = await signer.getNonce("pending");
  return rpcNonce;
}

function advanceNonce(chainId: number, used: number): void {
  nextNonce.set(chainId, used + 1);
}

export function resetNonce(chainId: number): void {
  nextNonce.delete(chainId);
}

/**
 * Populate, sign, and broadcast to primary + public mempools.
 * Uses local nonce tracking to avoid RPC staleness issues.
 * Returns the TransactionResponse (does NOT wait for confirmation).
 */
export async function signAndBroadcast(
  signer: ethers.Wallet,
  chainId: number,
  unsignedTx: ethers.TransactionLike,
): Promise<ethers.TransactionResponse> {
  const nonce = await acquireNonce(signer, chainId);
  const populated = await signer.populateTransaction({ ...unsignedTx, nonce });

  const bump = (v: ethers.BigNumberish | null | undefined) => v != null ? (BigInt(v) * 115n) / 100n : v;
  populated.maxFeePerGas = bump(populated.maxFeePerGas);
  populated.maxPriorityFeePerGas = bump(populated.maxPriorityFeePerGas);
  if (populated.gasPrice) populated.gasPrice = bump(populated.gasPrice);

  const signedTx = await signer.signTransaction(populated);

  try {
    const txResponse = await signer.provider!.broadcastTransaction(signedTx);
    advanceNonce(chainId, nonce);
    rebroadcastToPublicMempools(chainId, signedTx);
    return txResponse;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("NONCE_EXPIRED") || msg.includes("nonce too low") ||
      msg.includes("REPLACEMENT_UNDERPRICED") || msg.includes("underpriced") ||
      msg.includes("TRANSACTION_REPLACED") ||
      msg.includes("dropped") || msg.includes("not mined")
    ) {
      resetNonce(chainId);
    }
    throw error;
  }
}
