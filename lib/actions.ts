"use server";

import { db } from "./db";
import { canSave, grantAccess } from "./access";
import { createRecordIntake, neonWriter, type RecordInput, type RecordKind } from "./intake";

// Every export here is a public endpoint: check access, then hand off to record intake, which
// re-validates (never trust the client) and writes atomically.

const intake = createRecordIntake(neonWriter(db));

type UnlockState = { error?: string };
// "locked": no valid site code (never saved); the client keeps the draft while the page asks for the code.
export type SaveOutcome = "saved" | "locked";

export async function unlock(_: UnlockState, formData: FormData): Promise<UnlockState> {
  return (await grantAccess(String(formData.get("code") ?? ""))) ? {} : { error: "That code isn't right." };
}

export async function saveRecord<K extends RecordKind>(kind: K, input: RecordInput<K>): Promise<SaveOutcome> {
  if (!(await canSave())) return "locked";
  await intake.save(kind, input);
  return "saved";
}
