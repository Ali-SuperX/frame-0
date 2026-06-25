"use client";

import { useStudioStore } from "@/lib/store";

/**
 * Build the `x-frame-api-keys` header value from the store's apiKeys map.
 * Returns undefined if no keys are configured (so we don't send an empty
 * header, letting the server fall back to env vars silently).
 */
export function apiKeysHeader(): Record<string, string> {
  const keys = useStudioStore.getState().apiKeys;
  if (!keys || Object.keys(keys).length === 0) return {};
  return { "x-frame-api-keys": JSON.stringify(keys) };
}
