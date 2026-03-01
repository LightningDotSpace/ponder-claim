import { ethers } from "ethers";
import { PUBLIC_BROADCAST_RPCS } from "../../constants";

/**
 * Rebroadcast an already-signed raw transaction to public mempools.
 * Fire-and-forget: failures are logged but never propagated.
 */
function rebroadcastToPublicMempools(chainId: number, signedTx: string): void {
  const rpcs = PUBLIC_BROADCAST_RPCS[chainId];
  if (!rpcs?.length) return;

  for (const rpcUrl of rpcs) {
    new ethers.JsonRpcProvider(rpcUrl)
      .broadcastTransaction(signedTx)
      .then(() => console.log(`Rebroadcast OK → ${rpcUrl}`))
      .catch((e) => console.debug(`Rebroadcast failed → ${rpcUrl}: ${(e as Error).message}`));
  }
}

/**
 * Populate, sign, broadcast to primary + public mempools, then wait for confirmation.
 * Returns the confirmed receipt.
 */
export async function signBroadcastAndWait(
  signer: ethers.Wallet,
  chainId: number,
  unsignedTx: ethers.TransactionLike,
  confirmations: number,
  timeoutMs: number,
): Promise<ethers.TransactionReceipt> {
  const populated = await signer.populateTransaction(unsignedTx);
  const signedTx = await signer.signTransaction(populated);

  const txResponse = await signer.provider!.broadcastTransaction(signedTx);

  rebroadcastToPublicMempools(chainId, signedTx);

  const receipt = await txResponse.wait(confirmations, timeoutMs);
  if (!receipt) throw new Error("Transaction receipt is null");
  return receipt;
}
