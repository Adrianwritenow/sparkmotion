"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

interface OrgSettingsFormProps {
  orgId: string;
  name: string;
  slug: string;
  websiteUrl: string | null;
  contactEmail: string | null;
}

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function OrgSettingsForm({
  orgId,
  name: initialName,
  slug: initialSlug,
  websiteUrl: initialWebsiteUrl,
  contactEmail: initialContactEmail,
}: OrgSettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [websiteUrl, setWebsiteUrl] = useState(initialWebsiteUrl || "");
  const [contactEmail, setContactEmail] = useState(initialContactEmail || "");
  const [success, setSuccess] = useState(false);

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Slug check debounce
  const [slugToCheck, setSlugToCheck] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const utils = trpc.useUtils();

  const isDirty =
    name !== initialName ||
    slug !== initialSlug ||
    (websiteUrl || "") !== (initialWebsiteUrl || "") ||
    (contactEmail || "") !== (initialContactEmail || "");

  const updateOrg = trpc.organizations.update.useMutation({
    onSuccess: () => {
      setSuccess(true);
      utils.organizations.byId.invalidate({ id: orgId });
      setTimeout(() => setSuccess(false), 3000);
    },
  });

  const deleteOrg = trpc.organizations.delete.useMutation({
    onSuccess: () => {
      router.push("/organizations");
    },
  });

  // Debounced slug uniqueness check
  const slugCheckQuery = trpc.organizations.checkSlug.useQuery(
    { slug: slugToCheck, excludeOrgId: orgId },
    { enabled: !!slugToCheck && slugToCheck !== initialSlug },
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const normalized = normalizeSlug(slug);
    if (!normalized || normalized === initialSlug) {
      setSlugToCheck("");
      return;
    }
    debounceRef.current = setTimeout(() => {
      setSlugToCheck(normalized);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug, initialSlug]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrg.mutate({
      id: orgId,
      name: name.trim(),
      slug: normalizeSlug(slug),
      websiteUrl: websiteUrl.trim() || null,
      contactEmail: contactEmail.trim() || null,
    });
  };

  const handleDelete = () => {
    deleteOrg.mutate({ id: orgId });
  };

  const slugAvailable =
    normalizeSlug(slug) === initialSlug
      ? null
      : slugCheckQuery.data?.available ?? null;

  const canSave =
    isDirty &&
    !updateOrg.isPending &&
    name.trim().length > 0 &&
    normalizeSlug(slug).length > 0 &&
    slugAvailable !== false;

  return (
    <div className="space-y-8">
      {/* Settings Form */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h3 className="font-semibold text-foreground mb-6">Organization Settings</h3>
        <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
          {/* Name */}
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
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuccess(false);
              }}
              placeholder="Compassion International"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>

          {/* Slug */}
          <div>
            <label
              htmlFor="org-slug"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Slug
            </label>
            <input
              id="org-slug"
              type="text"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSuccess(false);
              }}
              onBlur={() => setSlug(normalizeSlug(slug))}
              placeholder="compassion-international"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
              required
            />
            <div className="flex items-center gap-2 mt-1.5">
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier (lowercase, hyphens only)
              </p>
              {slugCheckQuery.isFetching && (
                <span className="text-xs text-muted-foreground">Checking...</span>
              )}
              {!slugCheckQuery.isFetching && slugAvailable === true && (
                <span className="text-xs text-green-600 dark:text-green-400">
                  Available
                </span>
              )}
              {!slugCheckQuery.isFetching && slugAvailable === false && (
                <span className="text-xs text-red-600 dark:text-red-400">
                  Already taken
                </span>
              )}
            </div>
          </div>

          {/* Website URL */}
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
              onChange={(e) => {
                setWebsiteUrl(e.target.value);
                setSuccess(false);
              }}
              placeholder="https://compassion.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Fallback redirect URL for bands when this organization has no events
            </p>
          </div>

          {/* Contact Email */}
          <div>
            <label
              htmlFor="contact-email"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Contact Email
            </label>
            <input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => {
                setContactEmail(e.target.value);
                setSuccess(false);
              }}
              placeholder="contact@compassion.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Primary email for contacting this organization
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
              disabled={!canSave}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updateOrg.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Danger Zone */}
      <div className="border border-red-300 dark:border-red-800 rounded-lg p-6">
        <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">
          Danger Zone
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          This will permanently delete <strong>{initialName}</strong> and all its
          events, campaigns, bands, and tap data. Users will be detached from this
          organization.
        </p>
        <button
          type="button"
          onClick={() => setShowDeleteDialog(true)}
          className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Delete Organization
        </button>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => {
              setShowDeleteDialog(false);
              setDeleteConfirmText("");
            }}
          />
          <div className="relative bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Delete Organization
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              This action cannot be undone. This will permanently delete{" "}
              <strong>{initialName}</strong>, its events, campaigns, bands, and all
              tap data.
            </p>
            <p className="text-sm text-foreground mb-2">
              Type <strong>{initialName}</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={initialName}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-red-500/20 mb-4"
              autoFocus
            />

            {deleteOrg.error && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                {deleteOrg.error.message}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteConfirmText("");
                }}
                className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={
                  deleteConfirmText !== initialName || deleteOrg.isPending
                }
                className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteOrg.isPending ? "Deleting..." : "Delete Organization"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
