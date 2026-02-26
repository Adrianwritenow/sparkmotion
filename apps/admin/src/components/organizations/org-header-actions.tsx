"use client";

import { useState } from "react";
import Link from "next/link";
import { ContactOrgDialog } from "./contact-org-dialog";

interface OrgHeaderActionsProps {
  orgId: string;
  orgName: string;
  contactEmail: string | null;
}

export function OrgHeaderActions({ orgId, orgName, contactEmail }: OrgHeaderActionsProps) {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <div className="flex gap-3">
        <Link
          href={`/organizations/${orgId}?tab=settings`}
          className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
        >
          Edit Profile
        </Link>
        <button
          disabled={!contactEmail}
          onClick={() => setContactOpen(true)}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Contact Org
        </button>
      </div>
      <ContactOrgDialog
        orgId={orgId}
        orgName={orgName}
        contactEmail={contactEmail}
        open={contactOpen}
        onOpenChange={setContactOpen}
      />
    </>
  );
}
