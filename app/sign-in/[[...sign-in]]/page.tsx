import { Suspense } from "react";
import { Shell } from "@/components/collection/collection-app";
import { SignInCard } from "@/components/sign-in-card";

// SignIn reads the catch-all path, so it streams in after the static shell.
export default function SignInPage() {
  return (
    <Shell>
      <Suspense>
        <SignInCard />
      </Suspense>
    </Shell>
  );
}
