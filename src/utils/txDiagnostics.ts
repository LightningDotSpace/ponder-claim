type TxDiagnostics = {
  category:
    | "replaced"
    | "fee_underpriced"
    | "nonce_too_low"
    | "insufficient_funds"
    | "already_known"
    | "confirmation_timeout"
    | "dropped"
    | "unknown";
  code?: string;
  message: string;
  replacementTxHash?: string;
  cancelled?: boolean;
};

export function getTxDiagnostics(error: unknown): TxDiagnostics {
  const anyError = error as Record<string, unknown> | undefined;
  const code = typeof anyError?.code === "string" ? anyError.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  console.debug("[txDiagnostics] raw error", {
    code,
    message,
    shortMessage: anyError?.shortMessage,
    reason: anyError?.reason,
    info: anyError?.info,
  });

  if (code === "TRANSACTION_REPLACED") {
    const replacement = anyError?.replacement as { hash?: string } | undefined;
    const cancelled = typeof anyError?.cancelled === "boolean" ? anyError.cancelled : undefined;
    return {
      category: "replaced",
      code,
      message,
      replacementTxHash: replacement?.hash,
      cancelled,
    };
  }

  if (code === "REPLACEMENT_UNDERPRICED" || lower.includes("underpriced")) {
    return { category: "fee_underpriced", code, message };
  }

  if (code === "NONCE_EXPIRED" || lower.includes("nonce too low") || lower.includes("nonce has already been used")) {
    return { category: "nonce_too_low", code, message };
  }

  if (code === "INSUFFICIENT_FUNDS" || lower.includes("insufficient funds")) {
    return { category: "insufficient_funds", code, message };
  }

  if (lower.includes("already known") || lower.includes("already imported")) {
    return { category: "already_known", code, message };
  }

  if (code === "TIMEOUT" || lower.includes("timeout")) {
    return { category: "confirmation_timeout", code, message };
  }

  if (lower.includes("dropped") || lower.includes("not mined")) {
    return { category: "dropped", code, message };
  }

  return { category: "unknown", code, message };
}
