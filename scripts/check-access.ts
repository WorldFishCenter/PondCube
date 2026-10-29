// Operator access self-check (lib/operators.ts): fake Clerk accounts, the real operator and pond lookups on
// in-memory Postgres (PGLite). Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { accessFor, findOperator, refusal } from "../lib/operators";

const account = (emailAddress: string, status = "verified") => ({
  id: "user_1",
  primaryEmailAddress: { emailAddress, verification: { status } },
});

async function main() {
  const client = new PGlite();
  const db = drizzle(client);
  for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) {
    await client.exec(statement);
  }
  // Stored the way the Airtable sync stores them: normalised.
  await db.insert(schema.operators).values([
    { name: "Ana", email: "ana@x.org", active: true, sites: ["PEN", "TAL"] },
    { name: "Ben", email: "ben@x.org", active: false, sites: [] },
  ]);
  const access = (a: Parameters<typeof accessFor>[0]) => accessFor(a, (email) => findOperator(db, email));

  assert.equal(await access(null), "signedOut");
  const ana = { operator: "Ana", account: "user_1", sites: ["PEN", "TAL"] };
  assert.deepEqual(await access(account("ana@x.org")), ana, "the match names the Person, the account and the sites");
  assert.deepEqual(await access(account(" Ana@X.org ")), ana, "emails compare normalised");
  assert.equal(await access(account("ana@x.org", "unverified")), "notOnList", "only a verified email counts");
  assert.equal(await access({ id: "user_2", primaryEmailAddress: null }), "notOnList");
  assert.equal(await access(account("ben@x.org")), "notOnList", "a deactivated operator can't record");
  assert.equal(await access(account("someone@x.org")), "notOnList");

  // An Operator records only the ponds of their sites, with a feed used there.
  await db.insert(schema.site).values([
    { site: "PEN", nameSite: "Batu Maung" },
    { site: "TAL", nameSite: "Talbaria" },
    { site: "KOT", nameSite: "Kotalipara" },
  ]);
  const pond = { displayName: "1", area: "A", areaCode: "A", zone: "A", unitType: "tank" };
  await db.insert(schema.pond).values([
    { ...pond, pondCode: "PEN-FT1-001", site: "PEN" },
    { ...pond, pondCode: "KOT-PND-001", site: "KOT" },
  ]);
  await db.insert(schema.feed).values([
    { feed: "SUP", sites: ["PEN"] },
    { feed: "NAT", sites: ["TAL"] },
  ]);
  const refused = (record: object) => refusal(db, ana.sites, record);
  assert.equal(await refused({ pondCode: "PEN-FT1-001" }), null);
  assert.equal(await refused({ pondCode: "KOT-PND-001" }), "Pond KOT-PND-001 isn't at your site");
  assert.equal(await refused({ pondCode: "PEN-XXX-999" }), "Pond PEN-XXX-999 isn't at your site");
  assert.equal(await refused({ pondCode: "PEN-FT1-001", feed: "SUP" }), null);
  assert.equal(await refused({ pondCode: "PEN-FT1-001" }), null, "the feed is optional");
  assert.equal(await refused({ pondCode: "PEN-FT1-001", feed: "XYZ" }), "Feed XYZ isn't used at this pond's site");
  assert.equal(
    await refused({ pondCode: "PEN-FT1-001", feed: "NAT" }),
    "Feed NAT isn't used at this pond's site",
    "a feed of another of the Operator's sites",
  );

  await client.close();
  console.log("operator access OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
