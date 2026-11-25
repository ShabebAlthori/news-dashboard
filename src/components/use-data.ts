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
