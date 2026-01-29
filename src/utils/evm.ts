import { ethers } from "ethers";
import { CHAIN_IDS } from "./constants";

/**
 * Chain-specific RPC configuration.
 * NOTE: The same SIGNER_PRIVATE_KEY is used for all chains.
 * This is intentional - the claim service uses a single wallet across all supported networks.
 */
const CHAIN_CONFIGS: Record<number, { name: string; rpcEnv: string }> = {
  [CHAIN_IDS.CITREA_MAINNET]: { name: "citrea-mainnet", rpcEnv: "RPC_CITREA_MAINNET" },
  [CHAIN_IDS.CITREA_TESTNET]: { name: "citrea-testnet", rpcEnv: "RPC_CITREA_TESTNET" },
  [CHAIN_IDS.POLYGON_MAINNET]: { name: "polygon-mainnet", rpcEnv: "RPC_POLYGON" },
  [CHAIN_IDS.POLYGON_TESTNET_AMOY]: { name: "polygon-testnet-amoy", rpcEnv: "RPC_POLYGON_TESTNET" },
  [CHAIN_IDS.ETHEREUM_MAINNET]: { name: "ethereum-mainnet", rpcEnv: "RPC_ETHEREUM" },
};

const providers = new Map<number, ethers.JsonRpcProvider>();
const signers = new Map<number, ethers.Wallet>();

export function getProvider(chainId: number): ethers.JsonRpcProvider {
  if (!providers.has(chainId)) {
    const config = CHAIN_CONFIGS[chainId];
    if (!config) throw new Error(`Unsupported chainId: ${chainId}`);

    const rpcUrl = process.env[config.rpcEnv];
    if (!rpcUrl) throw new Error(`Missing RPC URL for ${config.name}`);

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
