import { ponder } from "ponder:registry";
import { lockups } from "../ponder.schema";

ponder.on("CoinSwapAbi:Lockup", async ({ event, context }) => {
  await context.db.insert(lockups).values({
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: "",
    swapType: "native",
  });
});

ponder.on("CoinSwapAbi:Claim", async ({ event, context }) => {
  await context.db
    .update(lockups, { preimageHash: event.args.preimageHash })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("CoinSwapAbi:Refund", async ({ event, context }) => {
  await context.db
    .update(lockups, { preimageHash: event.args.preimageHash })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

ponder.on("ERC20SwapCitrea:Lockup", async ({ event, context }) => {
  await context.db.insert(lockups).values({
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: "erc20",
  });
});

ponder.on("ERC20SwapCitrea:Claim", async ({ event, context }) => {
  await context.db
    .update(lockups, { preimageHash: event.args.preimageHash })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapCitrea:Refund", async ({ event, context }) => {
  await context.db
    .update(lockups, { preimageHash: event.args.preimageHash })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});