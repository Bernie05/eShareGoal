"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { writeRecords } from "./records";
import { useCreatedGoals, useCreatedGroups, useMe, useSaveCreatedGoals, useSaveCreatedGroups } from "./view-as";
import { walkingGoal, walkingGroup, walkingRecords } from "@/lib/walking-demo";

/** Loads the Walking Club demo (4 dummy members, a 10,000 km-each goal with records), or opens it if already loaded. */
export function WalkingDemoButton() {
  const router = useRouter();
  const groups = useCreatedGroups();
  const goals = useCreatedGoals();
  const saveGroups = useSaveCreatedGroups();
  const saveGoals = useSaveCreatedGoals();
  const href = `/design-preview/my-goal?goal=${walkingGoal.id}`;
  const loaded = goals.some((g) => g.id === walkingGoal.id);
  const me = useMe();
  const load = () => {
    if (loaded) return router.push(href);
    writeRecords(walkingGoal.id, walkingRecords);
    if (!groups.some((g) => g.id === walkingGroup.id)) saveGroups([...groups, walkingGroup]);
    saveGoals([...goals, walkingGoal], href);
    toast.success("Walking Club demo loaded", { description: "You and 4 dummy members, each walking toward 10,000 km." });
  };
  if (me !== walkingGroup.by) return null; // the demo group belongs to Bernz (User 1)
  return <Button variant="outline" onClick={load}><Footprints aria-hidden /> {loaded ? "Open walking demo" : "Load walking demo"}</Button>;
}
