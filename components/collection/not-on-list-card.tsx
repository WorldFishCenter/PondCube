"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

// Signed in, but the account's email isn't on the operator list.
export function NotOnListCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>This account isn&apos;t on the operator list</CardTitle>
        <CardDescription>
          Ask your supervisor to add the email you signed in with, then reload this page. Or sign out and use another
          account.
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
