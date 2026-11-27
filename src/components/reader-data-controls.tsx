"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { mutate } from "swr";
import { applyImport, exportReaderData, prepareImport } from "@/lib/client/static-api";
import type { I18nKey } from "@/lib/shared/i18n";
import { MAX_IMPORT_BYTES } from "@/lib/shared/reader-data";
import { useUi } from "./providers";

/** Settings → Data (web edition): export this browser's reader data to JSON, or import a file. */
export function ReaderDataControls() {
  const { t, lang, setLang, theme, setTheme } = useUi();
  const input = useRef<HTMLInputElement>(null);
  // Kept as a key, so the message follows a language change made by the import itself.
  const [note, setNote] = useState<{ key: I18nKey; vars?: Record<string, number>; ok: boolean } | null>(null);

  async function onExport() {
    const data = await exportReaderData({ lang, theme });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `techpulse-backup-${data.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote({ key: "settings.exported", vars: { saved: data.saved.length, read: data.read.length }, ok: true });
  }

  async function onFile(file: File | undefined) {
    if (input.current) input.current.value = ""; // choosing the same file again still triggers a change
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setNote({ key: "settings.importTooLarge", ok: false });
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return setNote({ key: "settings.importInvalid", ok: false });
    }
    const prepared = await prepareImport(raw);
    if (!prepared) return setNote({ key: "settings.importInvalid", ok: false });
    if (!window.confirm(t("settings.importConfirm", { saved: prepared.addedSaved, read: prepared.addedRead }))) return;
    const result = applyImport(prepared.data);
    setLang(prepared.data.display.lang);
    setTheme(prepared.data.display.theme);
    await mutate(() => true); // settings, saved list, dashboard and feeds re-read the browser's data
    setNote({ key: "settings.imported", vars: { saved: result.addedSaved, read: result.addedRead }, ok: true });
  }

  const button = "inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-medium text-fg hover:bg-surface-2";
  return (
    <div className="space-y-2">
      <p className="font-medium text-fg">{t("settings.backup")}</p>
      <p className="text-sm text-muted">{t("settings.backupHint")}</p>
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onExport} className={button}>
          <Download className="size-4" aria-hidden />
          {t("settings.export")}
        </button>
        <button type="button" onClick={() => input.current?.click()} className={button}>
          <Upload className="size-4" aria-hidden />
          {t("settings.import")}
        </button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      <p role="status" className={`min-h-5 text-sm ${note?.ok === false ? "text-caution" : "text-ok"}`}>
        {note ? t(note.key, note.vars) : null}
      </p>
    </div>
  );
}
