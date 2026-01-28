import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_PROVIDER_URL!);

let signer: ethers.Wallet | null = null;

export function getSigner(): ethers.Wallet {
  if (!signer) {
    signer = new ethers.Wallet(process.env.SIGNER_PRIVATE_KEY!, provider);
  }
  return signer;
}

const weiFactor = BigInt(10 ** 10);

export const satoshiToWei = (satoshis: number) => BigInt(satoshis) * weiFactor;

export const weiToSatoshi = (wei: bigint) => BigInt(wei) / weiFactor;

export const prefix0x = (val: string) => val.startsWith("0x") ? val : `0x${val}`;