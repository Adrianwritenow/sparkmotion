"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddOrganizationDialog } from "./add-org-dialog";

interface AddOrgButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function AddOrgButton({ className, children }: AddOrgButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        {children ?? (
          <>
            <Plus className="w-4 h-4" />
            Add Organization
          </>
        )}
      </button>
      <AddOrganizationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
