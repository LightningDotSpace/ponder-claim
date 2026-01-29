import { ponder } from "ponder:registry";
import { lockups } from "../ponder.schema";
import { SwapType } from "./utils/constants";
import { executeAutoClaim } from "./utils/autoClaim";
import { getPreimageStore } from "./utils/preimageStore";

// Helper for Composite ID
const createLockupId = (chainId: number, preimageHash: string) =>
  `${chainId}:${preimageHash}`;

// ===== CITREA: CoinSwap (cBTC) =====
ponder.on("CoinSwapCitrea:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData = {
    id,
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

  // Auto-claim only if preimage registered AND claimAddress = customerAddress
  const store = getPreimageStore();
  const registered = store.get(event.args.preimageHash);

  if (registered) {
    const shouldClaim =
      registered.targetChainId === context.chain.id &&
      registered.customerAddress?.toLowerCase() === event.args.claimAddress.toLowerCase();

    if (shouldClaim) {
      executeAutoClaim(registered.preimage, lockupData, context.chain.id)
        .then((result) => {
          if (result.success) {
            console.log(`Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
            store.delete(event.args.preimageHash);
          } else if (result.error?.includes("no Ether locked") || result.error?.includes("no tokens locked")) {
            console.log(`Auto-claim skipped for ${event.args.preimageHash}: already claimed`);
          } else {
            console.error(`Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
          }
        })
        .catch((err) => console.error("Auto-claim error:", err));
    }
  }
});

ponder.on("CoinSwapCitrea:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("CoinSwapCitrea:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== CITREA: ERC20Swap (JUSD) =====
ponder.on("ERC20SwapCitrea:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData = {
    id,
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
    const shouldClaim =
      registered.targetChainId === context.chain.id &&
      registered.customerAddress?.toLowerCase() === event.args.claimAddress.toLowerCase();

    if (shouldClaim) {
      executeAutoClaim(registered.preimage, lockupData, context.chain.id)
        .then((result) => {
          if (result.success) {
            console.log(`Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
            store.delete(event.args.preimageHash);
          } else if (result.error?.includes("no tokens locked")) {
            console.log(`Auto-claim skipped for ${event.args.preimageHash}: already claimed`);
          } else {
            console.error(`Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
          }
        })
        .catch((err) => console.error("Auto-claim error:", err));
    }
  }
});

ponder.on("ERC20SwapCitrea:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapCitrea:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== POLYGON: ERC20Swap (USDT) =====
ponder.on("ERC20SwapPolygon:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id, // 137
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData);

  const store = getPreimageStore();
  const registered = store.get(event.args.preimageHash);

  if (registered) {
    const shouldClaim =
      registered.targetChainId === context.chain.id &&
      registered.customerAddress?.toLowerCase() === event.args.claimAddress.toLowerCase();

    if (shouldClaim) {
      executeAutoClaim(registered.preimage, lockupData, context.chain.id)
        .then((result) => {
          if (result.success) {
            console.log(`[Polygon] Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
            store.delete(event.args.preimageHash);
          } else if (result.error?.includes("no tokens locked")) {
            console.log(`[Polygon] Auto-claim skipped for ${event.args.preimageHash}: already claimed`);
          } else {
            console.error(`[Polygon] Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
          }
        })
        .catch((err) => console.error("[Polygon] Auto-claim error:", err));
    }
  }
});

ponder.on("ERC20SwapPolygon:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapPolygon:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});

// ===== ETHEREUM: ERC20Swap (USDT/USDC) =====
ponder.on("ERC20SwapEthereum:Lockup", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);

  const lockupData = {
    id,
    preimageHash: event.args.preimageHash,
    amount: event.args.amount,
    claimAddress: event.args.claimAddress,
    refundAddress: event.args.refundAddress,
    timelock: event.args.timelock,
    tokenAddress: event.args.tokenAddress,
    swapType: SwapType.ERC20,
    chainId: context.chain.id, // 1
    claimed: false,
    refunded: false,
  };

  await context.db.insert(lockups).values(lockupData);

  const store = getPreimageStore();
  const registered = store.get(event.args.preimageHash);

  if (registered) {
    const shouldClaim =
      registered.targetChainId === context.chain.id &&
      registered.customerAddress?.toLowerCase() === event.args.claimAddress.toLowerCase();

    if (shouldClaim) {
      executeAutoClaim(registered.preimage, lockupData, context.chain.id)
        .then((result) => {
          if (result.success) {
            console.log(`[Ethereum] Auto-claim successful for ${event.args.preimageHash}: ${result.txHash}`);
            store.delete(event.args.preimageHash);
          } else if (result.error?.includes("no tokens locked")) {
            console.log(`[Ethereum] Auto-claim skipped for ${event.args.preimageHash}: already claimed`);
          } else {
            console.error(`[Ethereum] Auto-claim failed for ${event.args.preimageHash}: ${result.error}`);
          }
        })
        .catch((err) => console.error("[Ethereum] Auto-claim error:", err));
    }
  }
});

ponder.on("ERC20SwapEthereum:Claim", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      claimed: true,
      claimTxHash: event.transaction.hash,
      preimage: event.args.preimage,
    });
});

ponder.on("ERC20SwapEthereum:Refund", async ({ event, context }) => {
  const id = createLockupId(context.chain.id, event.args.preimageHash);
  await context.db
    .update(lockups, { id })
    .set({
      refunded: true,
      refundTxHash: event.transaction.hash,
    });
});
