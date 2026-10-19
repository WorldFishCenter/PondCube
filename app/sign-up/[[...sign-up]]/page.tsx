import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";

// SignUp reads the catch-all path, so it streams in after the static shell.
export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Suspense>
        <SignUp />
      </Suspense>
    </div>
  );
}
