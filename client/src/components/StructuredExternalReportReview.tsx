import React, { type ReactNode } from "react";

export type StructuredExternalReportDocument = {
  version: 1;
  language: "en" | "ar" | "tr" | "und";
  blocks: Array<
    | { type: "heading"; level: 1 | 2 | 3; text: string }
    | { type: "paragraph"; text: string; label?: string }
    | { type: "list"; ordered: boolean; items: string[] }
    | { type: "table"; caption?: string; columns: string[]; rows: string[][]; sourceVerified: boolean }
    | { type: "callout"; label: string; text: string }
    | { type: "verbatim"; text: string; label?: string }
    | { type: "legacy_text"; text: string }
  >;
};

function BlockShell({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-border/70 bg-background p-3">{children}</div>;
}

/** Renders only already-validated persisted document blocks. No source values are derived or inferred here. */
export function StructuredExternalReportReview({ document }: { document: StructuredExternalReportDocument }) {
  const isRtl = document.language === "ar";
  return <div dir={isRtl ? "rtl" : "ltr"} className="space-y-3 text-sm" data-testid="structured-external-report-review">
    {document.blocks.map((block, index) => {
      if (block.type === "heading") {
        const classes = block.level === 1 ? "text-base font-bold" : block.level === 2 ? "text-sm font-semibold" : "text-sm font-medium";
        return <h5 key={index} className={classes}>{block.text}</h5>;
      }
      if (block.type === "paragraph" || block.type === "verbatim" || block.type === "legacy_text") {
        return <BlockShell key={index}>{"label" in block && block.label && <p className="mb-1 text-xs font-semibold text-muted-foreground">{block.label}</p>}<p className="whitespace-pre-wrap leading-6">{block.text}</p></BlockShell>;
      }
      if (block.type === "callout") {
        return <div key={index} className="rounded-md border border-blue-200 bg-blue-50/70 p-3 text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-50"><p className="mb-1 text-xs font-semibold">{block.label}</p><p className="leading-6">{block.text}</p></div>;
      }
      if (block.type === "list") {
        const List = block.ordered ? "ol" : "ul";
        return <BlockShell key={index}><List className={block.ordered ? "list-decimal space-y-1 ps-5" : "list-disc space-y-1 ps-5"}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</List></BlockShell>;
      }
      return <BlockShell key={index}><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-semibold">{block.caption ?? "Laboratory results"}</p>{block.sourceVerified && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Source-verified fields</span>}</div><div className="overflow-x-auto"><table className="w-full min-w-[520px] border-collapse text-xs"><thead><tr className="bg-muted/60">{block.columns.map((column, columnIndex) => <th key={columnIndex} scope="col" className="border border-border px-2 py-2 text-start font-semibold">{column}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-muted/20">{row.map((cell, cellIndex) => <td key={cellIndex} dir="auto" className="border border-border px-2 py-2 align-top [unicode-bidi:plaintext]">{cell}</td>)}</tr>)}</tbody></table></div></BlockShell>;
    })}
  </div>;
}
