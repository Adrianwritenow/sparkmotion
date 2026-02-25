"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface ProfileFormProps {
  currentName: string;
  currentEmail: string;
}

export function ProfileForm({ currentName, currentEmail }: ProfileFormProps) {
  const nameParts = currentName.split(" ");
  const [firstName, setFirstName] = useState(nameParts[0] || "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" ") || "");
  const [email, setEmail] = useState(currentEmail);
  const [isDirty, setIsDirty] = useState(false);
  const [success, setSuccess] = useState(false);

  const updateProfile = trpc.users.updateProfile.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setIsDirty(false);
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const checkDirty = (newFirst: string, newLast: string, newEmail: string) => {
    const newName = `${newFirst} ${newLast}`.trim();
    setIsDirty(newName !== currentName || newEmail !== currentEmail);
    setSuccess(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = `${firstName} ${lastName}`.trim();
    updateProfile.mutate({ name, email });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="profile-first-name"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            First Name
          </label>
          <input
            id="profile-first-name"
            type="text"
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              checkDirty(e.target.value, lastName, email);
            }}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div>
          <label
            htmlFor="profile-last-name"
            className="block text-sm font-medium text-muted-foreground mb-1"
          >
            Last Name
          </label>
          <input
            id="profile-last-name"
            type="text"
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              checkDirty(firstName, e.target.value, email);
            }}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="profile-email"
          className="block text-sm font-medium text-muted-foreground mb-1"
        >
          Email Address
        </label>
        <input
          id="profile-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            checkDirty(firstName, lastName, e.target.value);
          }}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {updateProfile.error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {updateProfile.error.message}
        </p>
      )}

      {success && (
        <p className="text-sm text-green-600 dark:text-green-400">
          Profile saved successfully
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={!isDirty || updateProfile.isPending}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {updateProfile.isPending ? "Saving..." : "Save Profile"}
        </button>
      </div>
    </form>
  );
}
