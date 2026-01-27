import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER_URL!);

export function createSigner(privateKey: string) {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.connect(provider);
}

const weiFactor = BigInt(10 ** 10);

export const satoshiToWei = (satoshis: number) => BigInt(satoshis) * weiFactor;

export const weiToSatoshi = (wei: bigint) => BigInt(wei) / weiFactor;

export const prefix0x = (val: string) => val.startsWith("0x") ? val : `0x${val}`;