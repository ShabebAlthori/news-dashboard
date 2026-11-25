"use client";

import useSWR from "swr";
import type { StatusResponse } from "@/lib/shared/types";

export function useStatus() {
  return useSWR<StatusResponse>("/api/status", { refreshInterval: 30_000, revalidateOnFocus: true });
}

/** True when the server finished a refresh after `generatedAt` (i.e. newer stories exist). */
export function useHasNewer(generatedAt: string | undefined): boolean {
  const { data } = useStatus();
  if (!generatedAt || !data?.lastSuccessAt) return false;
  return new Date(data.lastSuccessAt).getTime() > new Date(generatedAt).getTime() + 1000;
}

export async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export function markRead(articleId: number) {
  try {
    const blob = new Blob([JSON.stringify({ articleId })], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/read", blob)) return;
  } catch {
    // fall through
  }
  void fetch("/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleId }), keepalive: true });
}
