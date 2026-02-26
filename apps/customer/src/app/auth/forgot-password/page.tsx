"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmLogotype } from "@/components/sm-logotype";
import { trpc } from "@/lib/trpc";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const requestReset = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSubmitted(true),
    onError: () => setSubmitted(true), // Don't reveal errors
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    requestReset.mutate({ email });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-sm w-full space-y-6 p-8 border rounded-lg">
        <div className="flex flex-col items-center gap-3">
          <SmLogotype className="h-10 text-foreground" />
          <p className="text-sm text-muted-foreground">Customer Portal</p>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              If an account exists for <strong>{email}</strong>, we&apos;ve sent
              a password reset link. Check your inbox.
            </p>
            <Link
              href="/auth/signin"
              className="text-sm text-primary hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-lg font-semibold">Forgot your password?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={requestReset.isLoading}
              >
                {requestReset.isLoading ? "Sending..." : "Send reset link"}
              </Button>
            </form>

            <div className="text-center">
              <Link
                href="/auth/signin"
                className="text-sm text-muted-foreground hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
