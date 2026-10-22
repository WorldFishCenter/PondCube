import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { signedInAccess } from "@/lib/access";
import { getPonds } from "@/lib/data";
import { CollectionApp, CollectionSkeleton, Shell } from "@/components/collection/collection-app";
import { NotOnListCard } from "@/components/collection/not-on-list-card";
import { InstallPrompt } from "@/components/install-prompt";
import { APP_VERSION } from "@/lib/version";

// The access check reads the session, so it runs per request inside Suspense; the data reads are
// cached, so signed-in devices still skip Neon.
async function App() {
  const access = await signedInAccess();
  if (access === "signedOut")
    return (
      <Shell>
        {/* Hash routing keeps every sign-in step on this page. */}
        <SignIn
          routing="hash"
          withSignUp
          appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-none" } }}
        />
      </Shell>
    );
  if (access === "notOnList")
    return (
      <Shell>
        <NotOnListCard />
      </Shell>
    );
  return (
    <CollectionApp
      enumerator={access.operator}
      account={access.account}
      ponds={await getPonds()}
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
