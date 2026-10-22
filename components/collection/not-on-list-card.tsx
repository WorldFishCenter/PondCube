"use client";

import { SignOutButton, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Signed in, but the account's email isn't on the operator list.
export function NotOnListCard() {
  const email = useUser().user?.primaryEmailAddress?.emailAddress; // the one lib/operators.ts matches
  return (
    <Card>
      <CardHeader>
        <CardTitle>This account isn&apos;t on the operator list</CardTitle>
        <CardDescription>
          Ask your supervisor to add {email ? <strong>{email}</strong> : "the email you signed in with"} to the operator
          list, then reload this page. Or sign out and use another email.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <SignOutButton>
          <Button variant="outline" className="w-full">
            Sign out
          </Button>
        </SignOutButton>
      </CardFooter>
    </Card>
  );
}
