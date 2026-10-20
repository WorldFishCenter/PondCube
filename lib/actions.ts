"use server";

import { db } from "./db";
import { operatorForSave } from "./access";
import { createRecordIntake, neonWriter } from "./intake";
import type { RecordKind } from "./validation";

// Every export here is a public endpoint: check access, then hand off to record intake, which
// re-validates (never trust the client) and writes atomically.

const intake = createRecordIntake(neonWriter(db));

// "locked": no signed-in operator (never saved); the client keeps the draft while the page asks to sign in.
export type SaveOutcome = "saved" | "locked";

export async function saveRecord(kind: RecordKind, input: unknown): Promise<SaveOutcome> {
  const enumerator = await operatorForSave();
  if (!enumerator) return "locked";
  await intake.save(kind, input, enumerator);
  return "saved";
}
