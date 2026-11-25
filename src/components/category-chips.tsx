"use client";

import { DASHBOARD_CHIPS } from "@/lib/shared/taxonomy";
import { useUi } from "./providers";
import { CATEGORY_ICONS } from "./story-visuals";

/** Horizontally scrollable category chips, in the fixed dashboard order. */
export function CategoryChips({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { t, lang } = useUi();
  const active = value ?? "all";
  return (
    <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0" role="toolbar" aria-label={t("chips.label")}>
      <ul className="flex w-max gap-2 pb-1">
        {DASHBOARD_CHIPS.map((c) => {
          const Icon = CATEGORY_ICONS[c.id];
          const on = active === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onChange(c.id === "all" || on ? null : c.id)}
                className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-all duration-150 ${
                  on
                    ? "brand-gradient border-transparent text-white shadow-[0_8px_22px_-10px_rgba(113,59,255,0.8)]"
                    : "border-line bg-surface text-fg hover:-translate-y-px hover:border-line-strong hover:bg-surface-2"
                }`}
              >
                {Icon && <Icon className={`size-[18px] ${on ? "" : "text-accent"}`} aria-hidden />}
                {c[lang]}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
