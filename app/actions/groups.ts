"use server";

import { revalidatePath } from "next/cache";
import { run } from "@/lib/server/action";
import * as svc from "@/lib/server/groups";

// Groups, members and invitations. Each action re-checks the signed-in user and their role (lib/server/groups.ts).
const done = <T,>(groupId?: string) => (r: T) => { revalidatePath("/", "layout"); if (groupId) revalidatePath(`/groups/${groupId}`); return r; };

interface CreateGroupActionInput {
  name: string;
  description?: string;
}
export async function createGroupAction(input: CreateGroupActionInput) { return run((v) => svc.createGroup(v, input).then(done())); }
interface UpdateGroupActionInput {
  name: string;
  description?: string;
}
export async function updateGroupAction(groupId: string, input: UpdateGroupActionInput) { return run((v) => svc.updateGroup(v, groupId, input).then(done(groupId))); }
export async function archiveGroupAction(groupId: string) { return run((v) => svc.archiveGroup(v, groupId).then(done())); }
export async function deleteGroupAction(groupId: string) { return run((v) => svc.deleteGroup(v, groupId).then(done())); }

interface InviteActionInput {
  groupId: string;
  userIds?: string[];
  emails?: string[];
  goalIds?: string[] | null;
}
export async function inviteAction(input: InviteActionInput) { return run((v) => svc.inviteToGroup(v, input).then(done(input.groupId))); }
export async function resendInviteAction(inviteId: string, groupId: string) { return run((v) => svc.resendInvite(v, inviteId).then(done(groupId))); }
export async function cancelInviteAction(inviteId: string, groupId: string) { return run((v) => svc.cancelInvite(v, inviteId).then(done(groupId))); }
export async function respondToInviteAction(inviteId: string, accept: boolean) { return run((v) => svc.respondToInvite(v, inviteId, accept).then(done())); }
export async function searchPeopleAction(groupId: string, q: string) { return run((v) => svc.searchPeople(v, groupId, q)); }

export async function leaveGroupAction(groupId: string) { return run((v) => svc.leaveGroup(v, groupId).then(done())); }
export async function removeMemberAction(groupId: string, userId: string) { return run((v) => svc.removeMember(v, groupId, userId).then(done(groupId))); }
export async function setMemberRoleAction(groupId: string, userId: string, role: "owner" | "member") { return run((v) => svc.setMemberRole(v, groupId, userId, role).then(done(groupId))); }
export async function setMemberGoalsAction(groupId: string, userId: string, goalIds: string[] | null) { return run((v) => svc.setMemberGoals(v, groupId, userId, goalIds).then(done(groupId))); }
