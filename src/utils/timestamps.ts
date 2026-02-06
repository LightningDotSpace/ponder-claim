export const TEMPORAL_FRAMES = ["1h", "24h", "all-time"] as const;

export const getTimestamp1hRoundedDown = (timestamp: bigint): bigint => {
  const date = new Date(Number(timestamp) * 1000);
  const rounded = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
      date.getUTCHours(), 0, 0, 0)
  );
  return BigInt(rounded.getTime() / 1000);
};

export const getTimestamp24hRoundedDown = (timestamp: bigint): bigint => {
  const date = new Date(Number(timestamp) * 1000);
  const rounded = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(),
      0, 0, 0)
  );
  return BigInt(rounded.getTime() / 1000);
};

export const getTimestampByTemporalFrame = (
  type: string,
  timestamp: bigint
): bigint => {
  switch (type) {
    case "1h":
      return getTimestamp1hRoundedDown(timestamp);
    case "24h":
      return getTimestamp24hRoundedDown(timestamp);
    case "all-time":
    default:
      return 0n;
  }
};

export const getIdByTemporalFrame = (
  chainId: number,
  tokenIdentifier: string,
  type: string,
  timestamp: bigint
): string => {
  const prefix = `${chainId}:${tokenIdentifier}`;
  switch (type) {
    case "1h":
      return `${prefix}-1h-${getTimestamp1hRoundedDown(timestamp)}`;
    case "24h":
      return `${prefix}-24h-${getTimestamp24hRoundedDown(timestamp)}`;
    case "all-time":
    default:
      return prefix;
  }
};
