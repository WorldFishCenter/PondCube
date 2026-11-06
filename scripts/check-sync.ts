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
  site: ["recPEN"],
  area: "Fish Tank 1",
  area_code: "FT1",
  zone: "Fish Tank 1",
  unit_type: "tank",
  status: "active",
  legacy_tank_id: 1,
  ...extra,
});
// An active Airtable operators row at Penang.
const op = (name: string, extra: Record<string, unknown> = {}) => ({ name, active: true, site: ["recPEN"], ...extra });

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
  // Airtable's sites table comes with every sync (ponds and operators link to it).
  const pen = { id: "recPEN", site: "pen", name_site: "Batu Maung", timezone: "Asia/Kuala_Lumpur" };
  const withSites = (rows: AirtableRows) => ({ sites: [pen], ...rows });
  const prepared = async (rows: AirtableRows) => {
    const sync = await prepareSync(withSites(rows), target);
    assert.ok(!("problems" in sync), `unexpected problems: ${"problems" in sync && sync.problems.join("; ")}`);
    return sync;
  };
  const synced = async (rows: AirtableRows) => (await prepared(rows)).write();
  const fails = async (rows: AirtableRows, pattern: RegExp) => {
    const sync = await prepareSync(withSites(rows), target);
    assert.ok(
      "problems" in sync && sync.problems.some((p) => pattern.test(p)),
      `expected a problem matching ${pattern}, got: ${JSON.stringify(sync)}`,
    );
  };
  const pondRow = async (code: string) =>
    (await db.select().from(schema.pond).where(eq(schema.pond.pondCode, code)))[0];
  const operator = async (name: string) =>
    (await db.select().from(schema.operators).where(eq(schema.operators.name, name)))[0];

  // --- Checks before anything is written ---
  await fails({ ponds: [pond("PEN-FT1-001", { display_name: undefined })] }, /display_name is empty/); // column renamed
  await fails({ operators: [{ name: "Ana" }, { name: "Ben" }] }, /none would be active/); // `active` renamed
  await fails({ operators: [{ name: "Ana", active: "yes" }] }, /active should be a checkbox/);
  await fails({ ponds: [pond("PEN-FT1-001", { lat_pond: "5,35" })] }, /lat_pond is not a number/);
  await fails({ ponds: [pond("PEN-FT1-001", { legacy_tank_id: 1.5 })] }, /legacy_tank_id is not a whole number/);
  await fails({ ponds: [pond("PEN-FT1-001", { commissioned_date: "Jan 2024" })] }, /commissioned_date is not a date/);
  await fails({ ponds: [pond("PEN FT1 001")] }, /should look like TAL_01/);
  await fails({ ponds: [pond("PEN-FT1-001"), pond("pen-ft1-001")] }, /duplicate of ponds row 1/);
  await fails({ operators: [op("Ana"), { name: "ana " }] }, /duplicate of operators row 1/);
  await fails({ operators: [op("Ana", { email: "ana" })] }, /email is not an email address/);
  await fails(
    {
      operators: [op("Ana", { email: "a@x.org" }), { name: "Ben", email: "A@x.org" }],
    },
    /same email/,
  );
  await fails({ ponds: [] }, /returned none/);
  await fails({ ponds: [{}] }, /returned none/); // only blank rows
  const nile = { id: "recON", species: "on", species_latin: "Oreochromis niloticus" };
  await fails({ species: [{ ...nile, species: "ONI" }] }, /should be two letters/);
  await fails(
    { species: [nile], ponds: [pond("PEN-FT1-001", { species: ["recXX"] })] },
    /should link to rows of species/,
  );
  await fails({ sites: [{ ...pen, site: "PENA" }] }, /should be three letters/);
  // The export turns instants into the site's local DATE and TIME.
  await fails({ sites: [{ ...pen, timezone: undefined }] }, /timezone is empty/);
  await fails({ sites: [{ ...pen, timezone: "Penang" }] }, /timezone is not an IANA time zone/);
  await fails({ sites: [{ ...pen, timezone: "+08:00" }] }, /timezone is not an IANA time zone/); // Postgres flips the sign
  await fails({ ponds: [pond("PEN-FT1-001", { site: ["recXX"] })] }, /should link to one row of sites/);
  await fails({ operators: [op("Ana", { site: ["recXX"] })] }, /should link to rows of sites/);
  await fails({ operators: [{ name: "Ana", active: true }] }, /Ana has no site/); // would see no ponds
  assert.equal((await db.select().from(schema.pond)).length, 0, "problems mean nothing is written");

  // --- Writing, against the real tables ---
  const first = await prepared({
    ponds: [pond(" pen-ft1-001 ", { status: " Active " }), pond("PEN-FT1-002", { lat_pond: "5.35" }), {}],
    operators: [op("Ana", { email: " Ana@X.org " }), op("Ben"), { name: "Cy" }],
  });
  assert.match(first.summary[0], /2 new, 0 updated, 0 retired/);
  await first.write();
  assert.equal((await db.select().from(schema.pond)).length, 2, "blank Airtable rows are skipped");
  assert.equal((await pondRow("PEN-FT1-001"))?.status, "active", "code upper-cased, status trimmed + lower-cased");
  assert.equal((await operator("Ana"))?.email, "ana@x.org");
  assert.equal((await operator("Cy"))?.active, false, "unticked = inactive");
  assert.equal((await pondRow("PEN-FT1-001"))?.site, "PEN", "site link resolved to the code, upper-cased");
  assert.deepEqual((await operator("Ana"))?.sites, ["PEN"]);
  assert.equal((await db.select().from(schema.site))[0]?.timezone, "Asia/Kuala_Lumpur");

  // A record references PEN-FT1-002; then it's removed from Airtable and Ben leaves.
  await db.insert(schema.mortalityEvents).values({
    pondCode: "PEN-FT1-002",
    recordedAt: new Date(),
    mortalityCount: 1,
    person: "Ben",
    appVersion: "9.9.9",
  });
  const second = await prepared({
    ponds: [pond("PEN-FT1-001")],
    operators: [op("Ana")],
  });
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

  // A pond's species are links to species rows (blank ones skipped), several in polyculture; Neon keeps the codes.
  const catla = { id: "recCC", species: "CC", species_latin: "Catla catla" };
  await synced({
    species: [nile, catla, { id: "recBlank" }],
    ponds: [pond("PEN-FT1-001", { species: ["recON", "recCC"] }), pond("PEN-FT1-002")],
  });
  assert.deepEqual((await pondRow("PEN-FT1-001"))?.species, ["ON", "CC"], "links resolved to codes, upper-cased");
  assert.deepEqual((await pondRow("PEN-FT1-002"))?.species, [], "no species: empty list");
  assert.equal((await db.select().from(schema.species)).length, 2);

  // A DMS pond code (SITE_POND), without Penang's area code and zone.
  await synced({
    ponds: [pond("PEN-FT1-001"), pond("PEN-FT1-002"), pond("PEN_07", { area_code: undefined, zone: undefined })],
  });
  assert.equal((await pondRow("PEN_07"))?.zone, null);

  // Renamed in Airtable, same email: the new name takes the email, the old one is deactivated.
  await synced({ operators: [op("Ana", { email: "ana@x.org" })] });
  await synced({ operators: [op("Ana Lim", { email: "ana@x.org" })] });
  assert.equal((await operator("Ana Lim"))?.email, "ana@x.org");
  assert.deepEqual([(await operator("Ana"))?.active, (await operator("Ana"))?.email], [false, null]);

  // Two operators swap emails in one sync.
  await synced({
    operators: [op("Ana Lim", { email: "ana@x.org" }), op("Dee", { email: "dee@x.org" })],
  });
  await synced({
    operators: [op("Ana Lim", { email: "dee@x.org" }), op("Dee", { email: "ana@x.org" })],
  });
  assert.equal((await operator("Dee"))?.email, "ana@x.org");

  // All-or-nothing: if the operators step fails, the pond changes are rolled back too.
  const doomed = await prepared({
    ponds: [pond("PEN-FT1-001")],
    operators: [op("Ana")],
  });
  await client.exec("ALTER TABLE operators RENAME TO operators_off");
  await assert.rejects(doomed.write());
  await client.exec("ALTER TABLE operators_off RENAME TO operators");
  assert.equal((await pondRow("PEN-FT1-002"))?.status, "active", "pond not retired by a failed sync");

  // Some people work at several sites.
  const tal = { id: "recTAL", site: "TAL", name_site: "Talbaria", timezone: "Asia/Dhaka" };
  await synced({ sites: [pen, tal], operators: [{ name: "Dee", active: true, site: ["recPEN", "recTAL"] }] });
  assert.deepEqual((await operator("Dee"))?.sites, ["PEN", "TAL"]);

  // Feeds (DMS FEED, three characters) link to the sites that use them; one removed from Airtable is offered nowhere.
  const feedRow = async (code: string) => (await db.select().from(schema.feed).where(eq(schema.feed.feed, code)))[0];
  await fails({ feeds: [{ feed: "SUPP", site: ["recPEN"] }] }, /should be three characters/);
  await fails({ feeds: [{ feed: "SUP", site: ["recXX"] }] }, /should link to rows of sites/);
  await synced({
    feeds: [
      { feed: "NAT", site: ["recPEN"] },
      { feed: "SUP", note_feed: "Supplementary", site: ["recPEN"] },
    ],
  });
  assert.deepEqual((await feedRow("SUP"))?.sites, ["PEN"]);
  await synced({ feeds: [{ feed: "NAT", site: ["recPEN"] }] });
  assert.deepEqual((await feedRow("SUP"))?.sites, [], "removed from Airtable: kept, offered nowhere");

  await client.close();
  console.log("airtable sync OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
