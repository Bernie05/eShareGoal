"use client";

import { ImageUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface FilePickerProps {
  id: string; fileName?: string; placeholder?: string; accept?: string; invalid?: boolean; describedBy?: string; onPick: (file?: File) => void;
}
/** File input styled like Input: the chosen file's name on the left, an upload icon on the right.
 *  The real input stays in the tab order (visually hidden), so keyboard and screen readers work as usual. */
export function FilePicker({ id, fileName, placeholder = "Choose an image…", accept = "image/*", invalid, describedBy, onPick }: FilePickerProps) {
  return (
    <label className={cn(
      "flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-accent/40 dark:bg-input/30",
      "focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
      invalid && "border-destructive ring-3 ring-destructive/20",
    )}>
      <span className={cn("min-w-0 flex-1 truncate", !fileName && "text-muted-foreground")} title={fileName}>{fileName || placeholder}</span>
      <ImageUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <input id={id} type="file" accept={accept} className="sr-only" aria-invalid={invalid} aria-describedby={describedBy} onChange={(e) => onPick(e.target.files?.[0])} />
    </label>
  );
}
