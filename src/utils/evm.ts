import { ethers } from "ethers";
import { CHAIN_RPC_URLS } from "../../constants";

/**
 * Chain-specific RPC configuration.
 * NOTE: The same SIGNER_PRIVATE_KEY is used for all chains.
 * This is intentional - the claim service uses a single wallet across all supported networks.
 */

const providers = new Map<number, ethers.JsonRpcProvider>();
const signers = new Map<number, ethers.Wallet>();

export function getProvider(chainId: number): ethers.JsonRpcProvider {
  if (!providers.has(chainId)) {
    const rpcUrl = CHAIN_RPC_URLS[chainId];
    if (!rpcUrl) throw new Error(`Missing RPC URL for chainId: ${chainId}`);

    providers.set(chainId, new ethers.JsonRpcProvider(rpcUrl));
  }
  return providers.get(chainId)!;
}

/**
 * Get a signer for the specified chain.
 * NOTE: Uses the same SIGNER_PRIVATE_KEY for all chains.
 * This means the claim service wallet address is identical across all networks.
 */
export function getSigner(chainId: number): ethers.Wallet {
  if (!signers.has(chainId)) {
    const privateKey = process.env.SIGNER_PRIVATE_KEY;
    if (!privateKey) throw new Error("Missing SIGNER_PRIVATE_KEY");

    const provider = getProvider(chainId);
    signers.set(chainId, new ethers.Wallet(privateKey, provider));
  }
  return signers.get(chainId)!;
}

const weiFactor = BigInt(10 ** 10);

export const satoshiToWei = (satoshis: number) => BigInt(satoshis) * weiFactor;

export const weiToSatoshi = (wei: bigint) => BigInt(wei) / weiFactor;

export const prefix0x = (val: string) => val.startsWith("0x") ? val : `0x${val}`;
