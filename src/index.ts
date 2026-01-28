import { ponder } from "ponder:registry";
import { lockups } from "../ponder.schema";
import { SwapType } from "./utils/constants";
import { executeAutoClaim } from "./utils/autoClaim";
import { getPreimageStore } from "./utils/preimageStore";

ponder.on("CoinSwapAbi:Lockup", async ({ event, context }) => {
  const lockupData = {
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    swapType: SwapType.NATIVE,
    chainId: context.chain.id,
    tokenAddress: null,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData);

  const store = getPreimageStore();
  const registered = store.get(event.args.preimageHash);

  if (registered) {
    executeAutoClaim(registered.preimage, lockupData, context.chain.id)
      .then((result) => {
        if (result.success) {
          console.log(`Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
        } else {
          console.error(`Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
        }
      })
      .catch((err) => console.error("Auto-claim error:", err));
  }
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
  const lockupData = {
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id,
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData);

  const store = getPreimageStore();
  const registered = store.get(event.args.preimageHash);

  if (registered) {
    executeAutoClaim(registered.preimage, lockupData, context.chain.id)
      .then((result) => {
        if (result.success) {
          console.log(`Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
        } else {
          console.error(`Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
        }
      })
      .catch((err) => console.error("Auto-claim error:", err));
  }
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