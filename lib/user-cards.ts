import { MAX_USER_CARDS } from "./constants";

// The cards or accounts a person transfers from. One person can have many. Only the last digits are ever kept: a full
// card number is never asked for or stored. Bank alerts show 3 or 4 of them (XXXX-XXX-091), so either is accepted.
// user: the person's name, as group rosters and payer rules know them in the preview.
export type UserCard = { user: string; last4: string };
export const LAST4 = /^\d{3,4}$/;

export const isUserCard = (c: unknown): c is UserCard => typeof (c as UserCard)?.user === "string" && LAST4.test(String((c as UserCard)?.last4));
export const cardLabel = (last4: string) => `•••• ${last4}`;
export const cardsOf = (all: UserCard[], user: string) => all.filter((c) => c.user === user).map((c) => c.last4);
/** Everyone else with the same digits. Allowed, since endings are not unique, but it matters for matching. */
export const sharedWith = (all: UserCard[], user: string, last4: string) => all.filter((c) => c.last4 === last4 && c.user !== user).map((c) => c.user);

/** Why these digits cannot be added to this person, or null. */
export function cardError(all: UserCard[], user: string, last4: string) {
  if (!LAST4.test(last4)) return "Enter the last 3 or 4 digits, as your bank alerts show them.";
  const mine = cardsOf(all, user);
  if (mine.includes(last4)) return "This card is already added.";
  return mine.length >= MAX_USER_CARDS ? `Up to ${MAX_USER_CARDS} cards per person. Remove one first.` : null;
}

export interface CardMatch {
  cards: UserCard[];
  /** The goal's members: a card only counts for people in this goal. */
  members: string[];
  /** The email fields that hold a card or account ending. */
  fields: string[];
}
/** Who paid, going by their cards. Null unless exactly one member fits: when two members share an ending it never guesses,
 *  and the email is left for an Owner to map. A card and an alert may show 3 or 4 digits, so it compares the endings both ways. */
export function memberByCard({ cards, members, fields }: CardMatch, json: Record<string, unknown>) {
  const seen = fields.map((k) => json[k]).filter((v) => v != null).map(String).filter((v) => /^\d{3,4}$/.test(v));
  const holders = new Set(cards.filter((c) => members.includes(c.user) && seen.some((v) => c.last4.endsWith(v) || v.endsWith(c.last4))).map((c) => c.user));
  return holders.size === 1 ? [...holders][0] : null;
}
