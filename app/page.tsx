import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { signedInAccess } from "@/lib/access";
import { getPonds } from "@/lib/data";
import { CollectionApp, CollectionSkeleton, Shell } from "@/components/collection/collection-app";
import { NotOnListCard } from "@/components/collection/not-on-list-card";
import { APP_VERSION } from "@/lib/version";

// The access check reads the session, so it runs per request inside Suspense; the data reads are
// cached, so signed-in devices still skip Neon.
async function App() {
  const access = await signedInAccess();
  if (access === "signedOut")
    return (
      <Shell>
        {/* Hash routing keeps every sign-in step on this page. */}
        <SignIn routing="hash" appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-none" } }} />
      </Shell>
    );
  if (access === "notOnList")
    return (
      <Shell>
        <NotOnListCard />
      </Shell>
    );
  return <CollectionApp enumerator={access.operator} ponds={await getPonds()} version={APP_VERSION} />;
}

export default function Page() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <App />
    </Suspense>
  );
}
