import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

// SignIn reads the catch-all path, so it streams in after the static shell.
export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense>
        <SignIn />
      </Suspense>
    </div>
  );
}
