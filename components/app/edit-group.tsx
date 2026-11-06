"use client";

import { useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/app/primitives";
import { LoanDetailsCard } from "@/components/app/loan-details";
import { useCreatedGoals } from "@/components/app/view-as";
import { EditGoalForm } from "@/components/screens/goal-page";
import type { CreatedGoal } from "@/lib/created-goals";
import type { Goal } from "@/lib/demo-data";
import { CAR_CREDIT } from "@/lib/constants";

/** A goal the Edit group dialog can open: one made in the preview (its details form), or a sample goal. */
export type GroupGoal = { id: string; name: string; members: string[] } & ({ created: CreatedGoal } | { sample: Goal });
const GROUP = "__group";

interface EditGroupDialogProps {
  groupName: string;
  goals: GroupGoal[];
  group?: (done: () => void) => ReactNode;
}
// Edit group: pick what to edit first (a goal, or the group's own name and description when `group` is given),
// then its details show below to update. Car Credit opens its loan details; goals made here open their goal form.
export function EditGroupDialog({ groupName, goals, group }: EditGroupDialogProps) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState("");
  const live = useCreatedGoals(); // the latest saved version of goals made here
  const close = () => { setOpen(false); setPicked(""); };
  const target = goals.find((x) => x.id === picked);
  const created = target && "created" in target ? live.find((x) => x.id === target.id) ?? target.created : undefined;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil aria-hidden /> Edit group</Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit {groupName}</DialogTitle>
            <DialogDescription>Choose what to edit. Its details show below; members see the changes right away.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="edit-target">What do you want to edit?</Label>
            <NativeSelect id="edit-target" value={picked} onChange={(e) => setPicked(e.target.value)}>
              <option value="" disabled>Choose a goal…</option>
              {group && <option value={GROUP}>Group name and description</option>}
              {goals.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </NativeSelect>
            {!goals.length && <p className="text-xs text-muted-foreground">This group has no goals yet.</p>}
          </div>
          {picked === GROUP && group?.(close)}
          {created && <EditGoalForm key={created.id} g={created} members={target!.members} onDone={close} />}
          {target && "sample" in target && (target.sample.id === CAR_CREDIT ? <LoanDetailsCard /> : <SampleGoalDetails g={target.sample} />)}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SampleGoalDetailsProps {
  g: Goal;
}
/** A sample goal's details. Its figures come from the sample data, so they are shown but cannot be changed here. */
function SampleGoalDetails({ g }: SampleGoalDetailsProps) {
  const rows: [string, ReactNode][] = [["Goal name", g.name], ["Status", <StatusBadge key="s" status={g.status} />], ["Progress", `${g.metric} (${g.progress}%)`], ["Last update", g.last]];
  if (g.info) rows.push(["About", g.info.about], ["Target", g.info.target]);
  return (
    <div className="space-y-2">
      <dl className="divide-y rounded-lg border text-sm">{rows.map(([k, v]) => (
        <div key={k} className="flex flex-wrap justify-between gap-2 px-3 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
      ))}</dl>
      <p className="text-xs text-muted-foreground">Sample goal: its details are fixed in the preview. Car Credit and goals you create in this group can be edited.</p>
    </div>
  );
}
