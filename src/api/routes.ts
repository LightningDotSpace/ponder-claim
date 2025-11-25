import { db } from "ponder:api";
import { lockups } from "ponder:schema";
import { Context, Hono } from "hono";
import { and, eq } from "ponder";
import { ethers, formatEther } from "ethers";
import { CoinSwapABI } from "../../abis/CoinSwap";
import config from "../../ponder.config";
import { createSigner, prefix0x } from "../utils/evm";

const routes = new Hono();

routes.get("/check-preimagehash", async (c: Context) => {
  const preimageHash = c.req.query("preimageHash");
  if (!preimageHash) {
    return c.json({ error: "Preimage hash is required" }, 400);
  }

  const lockup = await db.select().from(lockups).where(eq(lockups.preimageHash, prefix0x(preimageHash))).limit(1);

  if (!lockup.length) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  return c.json({ lockup: lockup.length > 0 ? lockup[0]! : null });
});

routes.post("/help-me-claim", async (c: Context) => {
  const { preimageHash, preimage } = await c.req.json();

  const signer = createSigner(process.env.SIGNER_PRIVATE_KEY!);
  const coinSwapAddress = config.contracts.CoinSwapAbi.address;
  const coinSwap = new ethers.Contract(coinSwapAddress, CoinSwapABI, signer);

  const lockup = await db.select().from(lockups).where(
    and(
      eq(lockups.preimageHash, preimageHash),
      eq(lockups.claimed, false),
      eq(lockups.refunded, false)
    )
  ).limit(1);

  if (!lockup.length) {
    return c.json({ error: "Lockup not found" }, 404);
  }

  const lockupData = lockup[0]!;
  const amount = lockupData.amount;
  const claimAddress = lockupData.claimAddress;
  const refundAddress = lockupData.refundAddress;
  const timelock = lockupData.timelock;

  try {
    if (!coinSwap) {
      return c.json({ error: "Contract not initialized" }, 500);
    }

    const tx = await coinSwap.getFunction("claim(bytes32,uint256,address,address,uint256)")(
      prefix0x(preimage),
      Number(amount),
      claimAddress,
      refundAddress,
      timelock
    );

    const receipt = await tx.wait();

    return c.json({
      success: true,
      txHash: receipt.hash,
    });

  } catch (error) {
    console.error("Claim failed:", error);
    return c.json({ error: "Claim transaction failed", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

routes.get("/wallet", async (c: Context) => {
  const signer = createSigner(process.env.SIGNER_PRIVATE_KEY!);
  const address = await signer.getAddress();
  const balance = await signer.provider?.getBalance(address);

  return c.json({ address, balance: formatEther(balance?.toString() || "0n") });
});

export default routes;
