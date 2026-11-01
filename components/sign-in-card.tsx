import * as React from "react";
import { SignIn } from "@clerk/nextjs";

// As wide as the app's column, with its 44px touch size.
export function SignInCard(props: React.ComponentProps<typeof SignIn>) {
  return (
    <SignIn
      withSignUp
      appearance={{
        elements: {
          rootBox: "w-full",
          cardBox: "w-full max-w-none",
          formButtonPrimary: "min-h-11",
          formFieldInput: "min-h-11",
        },
      }}
      {...props}
    />
  );
}
