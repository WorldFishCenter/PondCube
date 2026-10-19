import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { signedInOperator } from "@/lib/access";
import { getPonds } from "@/lib/data";
import { CollectionApp, CollectionSkeleton, Shell } from "@/components/collection/collection-app";
import { NotOnListCard } from "@/components/collection/not-on-list-card";

// The access check reads the session, so it runs per request inside Suspense; the data reads are
// cached, so signed-in devices still skip Neon.
async function App() {
  if (!(await auth()).userId)
    return (
      <Shell>
        {/* Hash routing keeps every sign-in step on this page. */}
        <SignIn routing="hash" appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-none" } }} />
      </Shell>
    );
  const enumerator = await signedInOperator();
  if (!enumerator)
    return (
      <Shell>
        <NotOnListCard />
      </Shell>
    );
  return <CollectionApp enumerator={enumerator} ponds={await getPonds()} />;
}

export default function Page() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <App />
    </Suspense>
  );
}
