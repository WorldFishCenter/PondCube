"use client";

import { useActionState } from "react";
import { unlock } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// On success the action sets the access cookie and Next re-renders the page into the app.
export function UnlockCard() {
  const [state, action, pending] = useActionState(unlock, {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter the site code</CardTitle>
        <CardDescription>Ask your supervisor. You only need it once on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <form id="unlock-form" action={action}>
          <FieldGroup>
            <Field data-invalid={!!state.error}>
              <FieldLabel htmlFor="code">Site code</FieldLabel>
              <Input
                id="code"
                name="code"
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={!!state.error}
              />
              <FieldError>{state.error}</FieldError>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form="unlock-form" className="w-full" disabled={pending}>
          {pending && <Spinner data-icon="inline-start" />}
          Unlock
        </Button>
      </CardFooter>
    </Card>
  );
}
