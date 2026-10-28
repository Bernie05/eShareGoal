"use client";

import { useEffect } from "react";
import { writeRecords } from "./records";
import { useCreatedGoals, useCreatedGroups, useSaveCreatedGoals, useSaveCreatedGroups } from "./view-as";
import { walkingGoal, walkingGroup, walkingRecords } from "@/lib/walking-demo";

const SEEDED = "esg-walking-seeded";

/** Adds the Walking Club demo once per browser, so every role sees it without looking for a button.
 *  After that it is ordinary data: deleting it sticks, and "Load walking demo" on My Groups brings it back. */
export function DemoSeeder() {
  const groups = useCreatedGroups();
  const goals = useCreatedGoals();
  const saveGroups = useSaveCreatedGroups();
  const saveGoals = useSaveCreatedGoals();
  useEffect(() => {
    try { if (localStorage.getItem(SEEDED)) return; localStorage.setItem(SEEDED, "1"); } catch { return; }
    if (goals.some((g) => g.id === walkingGoal.id)) return;
    writeRecords(walkingGoal.id, walkingRecords);
    if (!groups.some((g) => g.id === walkingGroup.id)) saveGroups([...groups, walkingGroup]);
    saveGoals([...goals, walkingGoal]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on first load
  return null;
}
