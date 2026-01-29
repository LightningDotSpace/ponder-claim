import { ethers } from "ethers";

const CHAIN_CONFIGS: Record<number, { name: string; rpcEnv: string }> = {
  4114: { name: "citrea-mainnet", rpcEnv: "RPC_CITREA_MAINNET" },
  5115: { name: "citrea-testnet", rpcEnv: "RPC_CITREA_TESTNET" },
  137: { name: "polygon", rpcEnv: "RPC_POLYGON" },
  1: { name: "ethereum", rpcEnv: "RPC_ETHEREUM" },
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
