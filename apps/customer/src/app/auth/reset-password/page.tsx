"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmLogotype } from "@/components/sm-logotype";
import { trpc } from "@/lib/trpc";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "Uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "Number", test: (v: string) => /[0-9]/.test(v) },
  { label: "Special character", test: (v: string) => /[^A-Za-z0-9]/.test(v) },
];

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session } = useSession();
  const token = searchParams.get("token");

  const isForceReset = !token && !!session?.user;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resetPassword = trpc.auth.resetPassword.useMutation({
    onSuccess: () => setSuccess(true),
    onError: (err) => setError(err.message),
  });

  const changePassword = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      await signOut({ redirect: false });
      router.push("/auth/signin");
    },
    onError: (err) => setError(err.message),
  });

  const isLoading = resetPassword.isLoading || changePassword.isLoading;
  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirm;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    if (isForceReset) {
      changePassword.mutate({ password });
    } else if (token) {
      resetPassword.mutate({ token, password });
    }
  };

  if (success) {
    return (
      <div className="max-w-sm w-full space-y-6 p-8 border rounded-lg text-center">
        <SmLogotype className="h-10 text-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Your password has been reset successfully.
        </p>
        <Button asChild className="w-full">
          <a href="/auth/signin">Sign in</a>
        </Button>
      </div>
    );
  }

  if (!token && !isForceReset) {
    return (
      <div className="max-w-sm w-full space-y-6 p-8 border rounded-lg text-center">
        <SmLogotype className="h-10 text-foreground mx-auto" />
        <p className="text-sm text-destructive">
          Invalid reset link. Please request a new one.
        </p>
        <Button asChild variant="outline" className="w-full">
          <a href="/auth/forgot-password">Request new link</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-sm w-full space-y-6 p-8 border rounded-lg">
      <div className="flex flex-col items-center gap-3">
        <SmLogotype className="h-10 text-foreground" />
        <p className="text-sm text-muted-foreground">Customer Portal</p>
      </div>

      <div className="text-center">
        <h2 className="text-lg font-semibold">
          {isForceReset ? "Set a new password" : "Reset your password"}
        </h2>
        {isForceReset && (
          <p className="text-sm text-muted-foreground mt-1">
            You must reset your password before continuing.
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {password && (
            <ul className="text-xs space-y-1 mt-2">
              {PASSWORD_RULES.map((rule) => (
                <li
                  key={rule.label}
                  className={
                    rule.test(password)
                      ? "text-green-600"
                      : "text-muted-foreground"
                  }
                >
                  {rule.test(password) ? "\u2713" : "\u2022"} {rule.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm Password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm && !passwordsMatch && (
            <p className="text-xs text-destructive">
              Passwords do not match
            </p>
          )}
        </div>

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isLoading || !allRulesPass || !passwordsMatch}
        >
          {isLoading ? "Resetting..." : "Reset password"}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
