import { Suspense } from "react";
import { signedInAccess } from "@/lib/access";
import { getFeeds, getFerts, getPonds, getSpecies, getTreatments } from "@/lib/data";
import { CollectionApp, CollectionSkeleton, Shell } from "@/components/collection/collection-app";
import { NotOnListCard } from "@/components/collection/not-on-list-card";
import { InstallPrompt } from "@/components/install-prompt";
import { SignInCard } from "@/components/sign-in-card";
import { APP_VERSION } from "@/lib/version";

// The access check reads the session, so it runs per request inside Suspense; the data reads are
// cached, so signed-in devices still skip Neon.
async function App() {
  const access = await signedInAccess();
  if (access === "signedOut")
    return (
      <Shell>
        {/* Hash routing keeps every sign-in step on this page. */}
        <SignInCard routing="hash" />
      </Shell>
    );
  if (access === "notOnList")
    return (
      <Shell>
        <NotOnListCard />
      </Shell>
    );
  const [ponds, feeds, ferts, treatments, species] = await Promise.all([
    getPonds(access.sites),
    getFeeds(access.sites),
    getFerts(access.sites),
    getTreatments(access.sites),
    getSpecies(),
  ]);
  return (
    <CollectionApp
      person={access.operator}
      account={access.account}
      sites={access.sites}
      ponds={ponds}
      feeds={feeds}
      ferts={ferts}
      treatments={treatments}
      species={species}
      version={APP_VERSION}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<CollectionSkeleton />}>
      <App />
      {/* Inside the boundary, so its drawer hydrates with the page it covers; one mount across sign-in. */}
      <InstallPrompt />
    </Suspense>
  );
}
