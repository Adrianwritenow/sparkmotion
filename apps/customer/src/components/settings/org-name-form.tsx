"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface OrgNameFormProps {
  orgId: string;
  currentName: string;
}

export function OrgNameForm({ orgId, currentName }: OrgNameFormProps) {
  const [name, setName] = useState(currentName);
  const [isDirty, setIsDirty] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateName = trpc.organizations.updateName.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const handleChange = (value: string) => {
    setName(value);
    setIsDirty(value !== currentName);
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateName.mutate({ orgId, name: name.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label
          htmlFor="org-name"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Organization Name
        </label>
        <input
          id="org-name"
          type="text"
          value={name}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {updateName.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {updateName.error.message}
        </p>
      )}

      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Organization name saved successfully
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={!isDirty || updateName.isPending}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateName.isPending ? "Saving..." : "Save Organization Name"}
        </button>
      </div>
    </form>
  );
}
