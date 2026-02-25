"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AddOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddOrganizationDialog({
  open,
  onOpenChange,
}: AddOrgDialogProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [name, setName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createOrg = trpc.organizations.create.useMutation({
    onSuccess: () => {
      utils.organizations.list.invalidate();
      setName("");
      setWebsiteUrl("");
      setError(null);
      onOpenChange(false);
      router.refresh();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createOrg.mutate({
      name: name.trim(),
      ...(websiteUrl.trim() && { websiteUrl: websiteUrl.trim() }),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setError(null);
          setName("");
          setWebsiteUrl("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Organization</DialogTitle>
          <DialogDescription>
            Create a new client organization. A URL slug will be generated
            automatically from the name.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="org-name"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Organization Name
            </label>
            <input
              id="org-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Compassion International"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label
              htmlFor="org-website"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Website URL (Optional)
            </label>
            <input
              id="org-website"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://compassion.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Fallback redirect URL when no events exist for this organization
            </p>
          </div>

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
              disabled={createOrg.isPending}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createOrg.isPending ? "Creating..." : "Create Organization"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
