"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRole: "ADMIN" | "CUSTOMER";
}

export function CreateUserDialog({
  open,
  onOpenChange,
  defaultRole,
}: CreateUserDialogProps) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"ADMIN" | "CUSTOMER">(defaultRole);
  const [orgId, setOrgId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: orgs } = trpc.organizations.list.useQuery(undefined, {
    enabled: open && role === "CUSTOMER",
  });

  const createUser = trpc.users.createUser.useMutation({
    onSuccess: (data) => {
      toast.success(`Created user ${data.name}`);
      resetForm();
      onOpenChange(false);
      router.refresh();
    },
    onError: (err) => setError(err.message),
  });

  function resetForm() {
    setName("");
    setEmail("");
    setRole(defaultRole);
    setOrgId("");
    setError(null);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createUser.mutate({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      ...(role === "CUSTOMER" && orgId ? { orgId } : {}),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>
            Create a new user account. They won&apos;t receive an email until you
            send an invite.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="user-name"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Name
            </label>
            <input
              id="user-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="user-email"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Email
            </label>
            <input
              id="user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as "ADMIN" | "CUSTOMER")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="CUSTOMER">Customer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === "CUSTOMER" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Organization
              </label>
              <Select value={orgId} onValueChange={setOrgId} required>
                <SelectTrigger>
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  {orgs?.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createUser.isLoading}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createUser.isLoading ? "Creating..." : "Create User"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
