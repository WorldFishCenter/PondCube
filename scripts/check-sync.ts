// Airtable sync self-check (scripts/sync-airtable.ts) against in-memory Postgres (PGLite), with
// hand-made Airtable rows; no network. Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { describeSync, planSync, syncQueries, type AirtableRows, type SyncPlan } from "./sync-airtable";

const pond = (code: string, extra: Record<string, unknown> = {}) => ({
  pond_code: code,
  display_name: `Pond ${code}`,
  site: "Penang HQ",
  site_code: "PEN",
  area: "Fish Tank 1",
  area_code: "FT1",
  zone: "Fish Tank 1",
  unit_type: "tank",
  status: "active",
  legacy_tank_id: 1,
  ...extra,
});
const ok = (rows: AirtableRows) => {
  const { plan, problems } = planSync(rows);
  assert.deepEqual(problems, []);
  return plan;
};
const fails = (rows: AirtableRows, pattern: RegExp) => {
  const { problems } = planSync(rows);
  assert.ok(
    problems.some((p) => pattern.test(p)),
    `expected a problem matching ${pattern}, got: ${JSON.stringify(problems)}`,
  );
};

async function main() {
  // --- Checks before anything is written ---
  const clean = ok({ ponds: [pond("PEN-FT1-001"), {}], operators: [{ name: "Ana", active: true }, { name: "Ben" }] });
  assert.equal(clean.ponds?.length, 1, "blank Airtable rows are skipped");
  assert.equal(clean.operators?.find((o) => o.name === "Ben")?.active, false, "unticked = inactive");
  assert.equal(ok({ ponds: [pond(" pen-ft1-001 ", { status: "Active" })] }).ponds?.[0].pondCode, "PEN-FT1-001");
  assert.equal(ok({ ponds: [pond("PEN-FT1-001", { status: " Active " })] }).ponds?.[0].status, "active");

  fails({ ponds: [pond("PEN-FT1-001", { display_name: undefined })] }, /display_name is empty/); // column renamed
  fails({ operators: [{ name: "Ana" }, { name: "Ben" }] }, /none would be active/); // `active` renamed
  fails({ operators: [{ name: "Ana", active: "yes" }] }, /active should be a checkbox/);
  fails({ ponds: [pond("PEN-FT1-001", { latitude: "5,35" })] }, /latitude is not a number/);
  fails({ ponds: [pond("PEN-FT1-001", { legacy_tank_id: 1.5 })] }, /legacy_tank_id is not a whole number/);
  fails({ ponds: [pond("PEN-FT1-001", { commissioned_date: "Jan 2024" })] }, /commissioned_date is not a date/);
  fails({ ponds: [pond("PEN FT1 001")] }, /should look like PEN-FT3-091/);
  fails({ ponds: [pond("PEN-FT1-001"), pond("pen-ft1-001")] }, /duplicate of ponds row 1/);
  fails({ operators: [{ name: "Ana", active: true }, { name: "ana " }] }, /duplicate of operators row 1/);
  assert.equal(
    ok({ operators: [{ name: "Ana", active: true, email: " Ana@X.org " }] }).operators?.[0].email,
    "ana@x.org",
  );
  fails({ operators: [{ name: "Ana", active: true, email: "ana" }] }, /email is not an email address/);
  fails(
    {
      operators: [
        { name: "Ana", active: true, email: "a@x.org" },
        { name: "Ben", email: "A@x.org" },
      ],
    },
    /same email/,
  );
  fails({ ponds: [] }, /returned none/);
  fails({ ponds: [{}] }, /returned none/); // only blank rows

  // --- Writing, against the real tables ---
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }
  const applySync = (plan: SyncPlan) =>
    db.transaction(async (tx) => {
      for (const query of syncQueries(tx, plan)) await query;
    });
  const status = async (code: string) =>
    (await db.select().from(schema.assets).where(eq(schema.assets.pondCode, code)))[0]?.status;
  const operator = async (name: string) =>
    (await db.select().from(schema.operators).where(eq(schema.operators.name, name)))[0];
  const isActive = async (name: string) => (await operator(name))?.active;

  const first = ok({
    ponds: [pond("PEN-FT1-001"), pond("PEN-FT1-002", { latitude: "5.35" })],
    operators: [
      { name: "Ana", active: true, email: "ana@x.org" },
      { name: "Ben", active: true },
    ],
  });
  assert.match((await describeSync(db, first))[0], /2 new, 0 updated, 0 retired/);
  await applySync(first);
  assert.equal((await db.select().from(schema.assets)).length, 2);
  assert.equal((await operator("Ana"))?.email, "ana@x.org");

  // A record references PEN-FT1-002; then it's removed from Airtable and Ben leaves.
  await db.insert(schema.mortalityEvents).values({
    pondCode: "PEN-FT1-002",
    recordedAt: new Date(),
    mortalityCount: 1,
    enumerator: "Ben",
  });
  const second = ok({ ponds: [pond("PEN-FT1-001")], operators: [{ name: "Ana", active: true }] });
  const summary = await describeSync(db, second);
  assert.match(summary[0], /1 retired \(PEN-FT1-002\)/);
  assert.match(summary[1], /1 deactivated \(Ben\)/);
  await applySync(second);
  assert.equal(await status("PEN-FT1-002"), "retired", "retired, not deleted");
  assert.equal(await isActive("Ben"), false);
  assert.equal((await operator("Ana"))?.email, null, "email cleared in Airtable = cleared here");
  assert.equal((await db.select().from(schema.mortalityEvents)).length, 1, "its records are untouched");

  // Back in Airtable: active again.
  await applySync(ok({ ponds: [pond("PEN-FT1-001"), pond("PEN-FT1-002")] }));
  assert.equal(await status("PEN-FT1-002"), "active");

  // All-or-nothing: if the operators step fails, the pond changes are rolled back too.
  await client.exec("ALTER TABLE operators RENAME TO operators_off");
  await assert.rejects(applySync(ok({ ponds: [pond("PEN-FT1-001")], operators: [{ name: "Ana", active: true }] })));
  await client.exec("ALTER TABLE operators_off RENAME TO operators");
  assert.equal(await status("PEN-FT1-002"), "active", "pond not retired by a failed sync");

  await client.close();
  console.log("airtable sync OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
