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
 * Populate, sign, and broadcast to primary + public mempools.
 * Returns the TransactionResponse (does NOT wait for confirmation).
 */
export async function signAndBroadcast(
  signer: ethers.Wallet,
  chainId: number,
  unsignedTx: ethers.TransactionLike,
): Promise<ethers.TransactionResponse> {
  const populated = await signer.populateTransaction(unsignedTx);
  const signedTx = await signer.signTransaction(populated);

  const txResponse = await signer.provider!.broadcastTransaction(signedTx);

  rebroadcastToPublicMempools(chainId, signedTx);

  return txResponse;
}
