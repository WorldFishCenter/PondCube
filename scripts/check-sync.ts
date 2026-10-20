// Airtable sync self-check (scripts/sync-airtable.ts) against in-memory Postgres (PGLite), with
// hand-made Airtable rows; no network. Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { prepareSync, type AirtableRows, type SyncTarget } from "./sync-airtable";

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

async function main() {
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }
  // Test adapter at the sync seam: a PGLite transaction (the CLI's uses a Neon batch).
  const target: SyncTarget = {
    db,
    writeAll: (build) =>
      db.transaction(async (tx) => {
        for (const query of build(tx)) await query;
      }),
  };
  const prepared = async (rows: AirtableRows) => {
    const sync = await prepareSync(rows, target);
    assert.ok(!("problems" in sync), `unexpected problems: ${"problems" in sync && sync.problems.join("; ")}`);
    return sync;
  };
  const synced = async (rows: AirtableRows) => (await prepared(rows)).write();
  const fails = async (rows: AirtableRows, pattern: RegExp) => {
    const sync = await prepareSync(rows, target);
    assert.ok(
      "problems" in sync && sync.problems.some((p) => pattern.test(p)),
      `expected a problem matching ${pattern}, got: ${JSON.stringify(sync)}`,
    );
  };
  const pondRow = async (code: string) =>
    (await db.select().from(schema.assets).where(eq(schema.assets.pondCode, code)))[0];
  const operator = async (name: string) =>
    (await db.select().from(schema.operators).where(eq(schema.operators.name, name)))[0];

  // --- Checks before anything is written ---
  await fails({ ponds: [pond("PEN-FT1-001", { display_name: undefined })] }, /display_name is empty/); // column renamed
  await fails({ operators: [{ name: "Ana" }, { name: "Ben" }] }, /none would be active/); // `active` renamed
  await fails({ operators: [{ name: "Ana", active: "yes" }] }, /active should be a checkbox/);
  await fails({ ponds: [pond("PEN-FT1-001", { latitude: "5,35" })] }, /latitude is not a number/);
  await fails({ ponds: [pond("PEN-FT1-001", { legacy_tank_id: 1.5 })] }, /legacy_tank_id is not a whole number/);
  await fails({ ponds: [pond("PEN-FT1-001", { commissioned_date: "Jan 2024" })] }, /commissioned_date is not a date/);
  await fails({ ponds: [pond("PEN FT1 001")] }, /should look like PEN-FT3-091/);
  await fails({ ponds: [pond("PEN-FT1-001"), pond("pen-ft1-001")] }, /duplicate of ponds row 1/);
  await fails({ operators: [{ name: "Ana", active: true }, { name: "ana " }] }, /duplicate of operators row 1/);
  await fails({ operators: [{ name: "Ana", active: true, email: "ana" }] }, /email is not an email address/);
  await fails(
    {
      operators: [
        { name: "Ana", active: true, email: "a@x.org" },
        { name: "Ben", email: "A@x.org" },
      ],
    },
    /same email/,
  );
  await fails({ ponds: [] }, /returned none/);
  await fails({ ponds: [{}] }, /returned none/); // only blank rows
  assert.equal((await db.select().from(schema.assets)).length, 0, "problems mean nothing is written");

  // --- Writing, against the real tables ---
  const first = await prepared({
    ponds: [pond(" pen-ft1-001 ", { status: " Active " }), pond("PEN-FT1-002", { latitude: "5.35" }), {}],
    operators: [{ name: "Ana", active: true, email: " Ana@X.org " }, { name: "Ben", active: true }, { name: "Cy" }],
  });
  assert.match(first.summary[0], /2 new, 0 updated, 0 retired/);
  await first.write();
  assert.equal((await db.select().from(schema.assets)).length, 2, "blank Airtable rows are skipped");
  assert.equal((await pondRow("PEN-FT1-001"))?.status, "active", "code upper-cased, status trimmed + lower-cased");
  assert.equal((await operator("Ana"))?.email, "ana@x.org");
  assert.equal((await operator("Cy"))?.active, false, "unticked = inactive");

  // A record references PEN-FT1-002; then it's removed from Airtable and Ben leaves.
  await db.insert(schema.mortalityEvents).values({
    pondCode: "PEN-FT1-002",
    recordedAt: new Date(),
    mortalityCount: 1,
    enumerator: "Ben",
    appVersion: "9.9.9",
  });
  const second = await prepared({ ponds: [pond("PEN-FT1-001")], operators: [{ name: "Ana", active: true }] });
  assert.match(second.summary[0], /1 retired \(PEN-FT1-002\)/);
  assert.match(second.summary[1], /1 deactivated \(Ben\)/);
  await second.write();
  assert.equal((await pondRow("PEN-FT1-002"))?.status, "retired", "retired, not deleted");
  assert.equal((await operator("Ben"))?.active, false);
  assert.equal((await operator("Ana"))?.email, null, "email cleared in Airtable = cleared here");
  assert.equal((await db.select().from(schema.mortalityEvents)).length, 1, "its records are untouched");

  // Back in Airtable: active again.
  await synced({ ponds: [pond("PEN-FT1-001"), pond("PEN-FT1-002")] });
  assert.equal((await pondRow("PEN-FT1-002"))?.status, "active");

  // Renamed in Airtable, same email: the new name takes the email, the old one is deactivated.
  await synced({ operators: [{ name: "Ana", active: true, email: "ana@x.org" }] });
  await synced({ operators: [{ name: "Ana Lim", active: true, email: "ana@x.org" }] });
  assert.equal((await operator("Ana Lim"))?.email, "ana@x.org");
  assert.deepEqual([(await operator("Ana"))?.active, (await operator("Ana"))?.email], [false, null]);

  // Two operators swap emails in one sync.
  await synced({
    operators: [
      { name: "Ana Lim", active: true, email: "ana@x.org" },
      { name: "Dee", active: true, email: "dee@x.org" },
    ],
  });
  await synced({
    operators: [
      { name: "Ana Lim", active: true, email: "dee@x.org" },
      { name: "Dee", active: true, email: "ana@x.org" },
    ],
  });
  assert.equal((await operator("Dee"))?.email, "ana@x.org");

  // All-or-nothing: if the operators step fails, the pond changes are rolled back too.
  const doomed = await prepared({ ponds: [pond("PEN-FT1-001")], operators: [{ name: "Ana", active: true }] });
  await client.exec("ALTER TABLE operators RENAME TO operators_off");
  await assert.rejects(doomed.write());
  await client.exec("ALTER TABLE operators_off RENAME TO operators");
  assert.equal((await pondRow("PEN-FT1-002"))?.status, "active", "pond not retired by a failed sync");

  await client.close();
  console.log("airtable sync OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
