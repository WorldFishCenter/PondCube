import { Suspense } from "react";
import { hasAccess } from "@/lib/access";
import { getOperators, getPonds } from "@/lib/data";
import { CollectionApp, CollectionSkeleton, Shell } from "@/components/collection/collection-app";
import { UnlockCard } from "@/components/collection/unlock-card";

// The access check reads a cookie, so it runs per request inside Suspense; the data reads are
// cached, so unlocked devices still skip Neon.
async function App() {
  if (!(await hasAccess()))
    return (
      <Shell>
        <UnlockCard />
      </Shell>
    );
  const [operators, ponds] = await Promise.all([getOperators(), getPonds()]);
  return <CollectionApp operators={operators} ponds={ponds} />;
}

export default function Page() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <App />
    </Suspense>
  );
}
