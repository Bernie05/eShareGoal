"use client";

import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { CreditCard, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listStore } from "./local-list";
import { KNOWN_CARDS_DONE, MAX_STORED_CARDS, STORAGE } from "@/lib/constants";
import { cardError, cardLabel, cardsOf, isUserCard, sharedWith, type UserCard } from "@/lib/user-cards";

// Kept in this browser in the preview, like the other lists; it moves to the database with the Users screen.
const store = listStore<UserCard>(STORAGE.userCards, (v) => v.filter(isUserCard), MAX_STORED_CARDS);
// Cards known from real bank alerts. Added once to each browser, then they are ordinary cards that can be removed.
const KNOWN_CARDS: UserCard[] = [{ user: "Babylyn", last4: "091" }];
function addKnownCards() {
  try {
    if (localStorage.getItem(KNOWN_CARDS_DONE)) return;
    const saved = store.current();
    if (store.save([...saved, ...KNOWN_CARDS.filter((k) => !saved.some((c) => c.user === k.user && c.last4 === k.last4))])) localStorage.setItem(KNOWN_CARDS_DONE, "1");
  } catch { /* storage is blocked: nothing to keep it in */ }
}
export function useUserCards() {
  useEffect(addKnownCards, []);
  return store.useList();
}

interface CardEditorProps {
  user: string;
  /** System Admin: names who else has the same ending. A person editing their own cards never sees that. */
  admin?: boolean;
  /** Told what changed, for the person's history. */
  onChange?: (line: string) => void;
}
/** One person's transfer cards: add as many as they use, last 4 digits only. */
export function CardEditor({ user, admin, onChange }: CardEditorProps) {
  const all = useUserCards();
  const id = useId();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mine = cardsOf(all, user);

  const save = (next: UserCard[]) => { if (store.save(next)) return true; toast.error("This browser could not save the card."); return false; };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = cardError(all, user, digits);
    setError(problem);
    if (problem || !save([...all, { user, last4: digits }])) return;
    onChange?.(`Card ${cardLabel(digits)} added`);
    setDigits("");
  };
  const remove = (last4: string) => { if (save(all.filter((c) => !(c.user === user && c.last4 === last4)))) onChange?.(`Card ${cardLabel(last4)} removed`); };

  return (
    <div className="space-y-2">
      {mine.length > 0 ? (
        <ul className="divide-y rounded-lg border">{mine.map((last4) => {
          const others = admin ? sharedWith(all, user, last4) : [];
          return (
            <li key={last4} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
              <CreditCard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="num flex-1 font-medium">{cardLabel(last4)}</span>
              {others.length > 0 && <span className="text-xs text-warning">Same ending: {others.join(", ")}</span>}
              <Button variant="ghost" size="icon-xs" aria-label={`Remove card ending ${last4}`} onClick={() => remove(last4)}><X aria-hidden /></Button>
            </li>
          );
        })}</ul>
      ) : <p className="text-sm text-muted-foreground">No cards yet.</p>}
      <form onSubmit={add} noValidate className="space-y-1.5">
        <Label htmlFor={id}>Last digits</Label>
        <div className="flex gap-2">
          <Input id={id} className="num w-28" inputMode="numeric" autoComplete="off" maxLength={4} placeholder="091" value={digits} aria-invalid={!!error} aria-describedby={`${id}-hint`}
            onChange={(e) => { setDigits(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(null); }} />
          <Button type="submit" variant="outline"><Plus aria-hidden /> Add card</Button>
        </div>
        {error ? <p id={`${id}-hint`} role="alert" className="text-xs text-destructive">{error}</p>
          : <p id={`${id}-hint`} className="text-xs text-muted-foreground">Never the full number. Bank alerts show these digits, so transfers can be matched to the right person.</p>}
      </form>
    </div>
  );
}
