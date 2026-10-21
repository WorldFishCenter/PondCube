// Operator access self-check (lib/operators.ts): fake Clerk accounts, the real operator lookup on
// in-memory Postgres (PGLite). Run: npm run check
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../lib/schema";
import { accessFor, findOperator } from "../lib/operators";

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
    { name: "Ana", email: "ana@x.org", active: true },
    { name: "Ben", email: "ben@x.org", active: false },
  ]);
  const access = (a: Parameters<typeof accessFor>[0]) => accessFor(a, (email) => findOperator(db, email));

  assert.equal(await access(null), "signedOut");
  const ana = { operator: "Ana", account: "user_1" };
  assert.deepEqual(await access(account("ana@x.org")), ana, "the match names the Enumerator and the account");
  assert.deepEqual(await access(account(" Ana@X.org ")), ana, "emails compare normalised");
  assert.equal(await access(account("ana@x.org", "unverified")), "notOnList", "only a verified email counts");
  assert.equal(await access({ id: "user_2", primaryEmailAddress: null }), "notOnList");
  assert.equal(await access(account("ben@x.org")), "notOnList", "a deactivated operator can't record");
  assert.equal(await access(account("someone@x.org")), "notOnList");

  await client.close();
  console.log("operator access OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
