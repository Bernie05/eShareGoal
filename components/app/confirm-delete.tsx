"use client";

import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Delete X?" with a red Delete. remove: does it; false when it could not be done (it shows its own error), which keeps the dialog open. */
export type Deleting = { name: string; note: string; remove: () => boolean };
interface ConfirmDeleteProps {
  item: Deleting;
  onClose: () => void;
}
export function ConfirmDelete({ item, onClose }: ConfirmDeleteProps) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete {item.name}?</DialogTitle><DialogDescription>{item.note}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={() => { if (item.remove()) { toast.success(`${item.name} deleted`); onClose(); } }}><Trash2 aria-hidden /> Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
