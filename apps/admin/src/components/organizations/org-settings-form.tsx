"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface OrgSettingsFormProps {
  orgId: string;
  websiteUrl: string | null;
}

export function OrgSettingsForm({ orgId, websiteUrl: initialWebsiteUrl }: OrgSettingsFormProps) {
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl || "");
  const [isDirty, setIsDirty] = useState(false);
  const [success, setSuccess] = useState(false);

  const utils = trpc.useUtils();

  const updateOrg = trpc.organizations.update.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setIsDirty(false);
      utils.organizations.byId.invalidate({ id: orgId });
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleChange = (value: string) => {
    setWebsiteUrl(value);
    setIsDirty(value !== (initialWebsiteUrl || ""));
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrg.mutate({
      id: orgId,
      websiteUrl: websiteUrl.trim() || null,
    });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-6">
      <h3 className="font-semibold text-foreground mb-6">Organization Settings</h3>
      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        <div>
          <label
            htmlFor="website-url"
            className="block text-sm font-medium text-foreground mb-1.5"
          >
            Website URL
          </label>
          <input
            id="website-url"
            type="url"
            value={websiteUrl}
            onChange={(e) => handleChange(e.target.value)}
            placeholder="https://compassion.com"
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            Fallback redirect URL for bands when this organization has no events
          </p>
        </div>

        {updateOrg.error && (
          <p className="text-sm text-red-600 dark:text-red-400">
            {updateOrg.error.message}
          </p>
        )}

        {success && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Settings saved successfully
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!isDirty || updateOrg.isPending}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updateOrg.isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
