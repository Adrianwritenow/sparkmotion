"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface OrgWebsiteUrlFormProps {
  orgId: string;
  currentWebsiteUrl: string | null;
}

export function OrgWebsiteUrlForm({ orgId, currentWebsiteUrl }: OrgWebsiteUrlFormProps) {
  const [websiteUrl, setWebsiteUrl] = useState(currentWebsiteUrl || "");
  const [isDirty, setIsDirty] = useState(false);
  const [success, setSuccess] = useState(false);

  const utils = trpc.useUtils();

  const updateWebsiteUrl = trpc.organizations.updateWebsiteUrl.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleChange = (value: string) => {
    setWebsiteUrl(value);
    setIsDirty(value !== (currentWebsiteUrl || ""));
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateWebsiteUrl.mutate({
      orgId,
      websiteUrl: websiteUrl.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="org-website-url"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Website URL
        </label>
        <input
          id="org-website-url"
          type="url"
          value={websiteUrl}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="https://compassion.com"
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <p className="text-xs text-muted-foreground mt-1.5">
          Redirect URL for NFC taps when your organization has no active events
        </p>
      </div>

      {updateWebsiteUrl.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {updateWebsiteUrl.error.message}
        </p>
      )}

      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Website URL saved successfully
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={!isDirty || updateWebsiteUrl.isPending}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateWebsiteUrl.isPending ? "Saving..." : "Save Website URL"}
        </button>
      </div>
    </form>
  );
}
