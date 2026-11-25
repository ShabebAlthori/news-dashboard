"use client";

// Reader actions that work in both editions: the self-hosted server (HTTP API) and
// the static web edition (browser storage).
import type { Prefs, Story } from "@/lib/shared/types";
import { IS_STATIC } from "./mode";
import { addRead, loadStatusFile, setPrefs, setSaved } from "./static-api";

async function postJson(url: string, body: unknown, method = "POST"): Promise<Response> {
  return fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

export async function saveStory(story: Story, saved: boolean): Promise<boolean> {
  if (IS_STATIC) {
    setSaved(story, saved);
    return true;
  }
  const res = await postJson("/api/saved", { articleId: story.leadArticleId, saved });
  return res.ok;
}

export function markRead(articleId: number, url: string) {
  if (IS_STATIC) {
    addRead(url);
    return;
  }
  try {
    const blob = new Blob([JSON.stringify({ articleId })], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/read", blob)) return;
  } catch {
    // fall through
  }
  void fetch("/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ articleId }), keepalive: true });
}

export async function savePrefs(patch: Partial<Prefs>): Promise<Prefs> {
  if (IS_STATIC) return setPrefs(patch);
  const res = await postJson("/api/settings", patch, "PUT");
  if (!res.ok) throw new Error("save failed");
  return (await res.json()) as Prefs;
}

export async function setSourceEnabled(id: string, enabled: boolean): Promise<unknown | null> {
  if (IS_STATIC) return null; // sources are managed by the automatic updater
  const res = await postJson("/api/sources", { id, enabled }, "PATCH");
  return res.ok ? res.json() : null;
}

/**
 * Server: start a feed refresh. Web edition: feeds refresh automatically, so this just
 * checks whether a newer snapshot has been published.
 */
export async function requestRefresh(): Promise<"started" | "too-soon" | "checked" | "error"> {
  if (IS_STATIC) {
    await loadStatusFile().catch(() => null);
    return "checked";
  }
  const res = await fetch("/api/refresh", { method: "POST" });
  if (res.status === 429) return "too-soon";
  return res.ok ? "started" : "error";
}
