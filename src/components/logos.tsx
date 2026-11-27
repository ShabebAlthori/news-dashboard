"use client";

import { ChartColumnBig, Layers } from "lucide-react";
import { useState } from "react";
import { BRAND_MARKS } from "@/lib/shared/brand-marks";
import { companyById } from "@/lib/shared/taxonomy";
import type { Story } from "@/lib/shared/types";

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].length <= 4 && words[0] === words[0].toUpperCase() ? words[0].slice(0, 3) : words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** A neutral letter tile, used when no permitted logo is available. */
export function Monogram({ name, size = 36, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] border border-line bg-surface-2 font-semibold text-muted ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) }}
      lang="en"
    >
      {initials(name)}
    </span>
  );
}

function MarkTile({ path, size, className = "", title }: { path: string; size: number; className?: string; title?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[28%] border border-line bg-surface-2 text-fg ${className}`}
      style={{ width: size, height: size }}
      title={title}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" style={{ width: size * 0.56, height: size * 0.56 }} fill="currentColor">
        <path d={path} />
      </svg>
    </span>
  );
}

export function CompanyLogo({ id, size = 36, className = "" }: { id: string; size?: number; className?: string }) {
  const mark = BRAND_MARKS[id];
  const name = companyById(id)?.en ?? id;
  if (mark) return <MarkTile path={mark.path} size={size} className={className} />;
  return <Monogram name={name} size={size} className={className} />;
}

/** Logo of a Data Radar platform; generic icons where the project offers no permitted mark. */
export function PlatformLogo({ sourceId, platform, size = 40 }: { sourceId: string; platform: string; size?: number }) {
  const key = sourceId.startsWith("github-") ? "p:github" : `p:${sourceId}`;
  const mark = BRAND_MARKS[key];
  if (mark) return <MarkTile path={mark.path} size={size} />;
  const Icon = sourceId === "powerbi" ? ChartColumnBig : sourceId === "fabric" ? Layers : null;
  if (Icon) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center rounded-[28%] border border-line bg-surface-2 text-fg" style={{ width: size, height: size }} aria-hidden>
        <Icon style={{ width: size * 0.5, height: size * 0.5 }} />
      </span>
    );
  }
  return <Monogram name={platform} size={size} />;
}

/**
 * The publisher's own site icon. A letter avatar is shown until the icon has loaded with a usable
 * size, and stays when it fails (403 pages, empty files, hanging requests) — never a blank tile.
 */
export function SourceLogo({ source, size = 16 }: { source: Story["source"]; size?: number }) {
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  let icon: string | null = null;
  try {
    icon = source.homepage ? `${new URL(source.homepage).origin}/favicon.ico` : null;
  } catch {
    icon = null;
  }
  const fallback = <Monogram name={source.name} size={size} className="!rounded-[4px] !border-0" />;
  if (!icon || state === "failed") return fallback;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {state !== "ok" && <span className="absolute inset-0">{fallback}</span>}
      {/* eslint-disable-next-line @next/next/no-img-element -- publisher-hosted site icons from many domains */}
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={(e) => setState(e.currentTarget.naturalWidth >= 8 ? "ok" : "failed")}
        onError={() => setState("failed")}
        className={`rounded-[4px] object-contain transition-opacity ${state === "ok" ? "bg-white/90 opacity-100" : "opacity-0"}`}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
