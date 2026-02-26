"use client";

import { useState } from "react";
import { MoreHorizontal, Mail, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactOrgDialog } from "./contact-org-dialog";
import { DeleteOrgDialog } from "./delete-org-dialog";

interface OrgActionsProps {
  orgId: string;
  orgName: string;
  contactEmail: string | null;
}

export function OrgActions({ orgId, orgName, contactEmail }: OrgActionsProps) {
  const [contactOpen, setContactOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={!contactEmail} onClick={() => setContactOpen(true)}>
            <Mail className="mr-2 h-4 w-4" />
            Contact
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContactOrgDialog
        orgId={orgId}
        orgName={orgName}
        contactEmail={contactEmail}
        open={contactOpen}
        onOpenChange={setContactOpen}
      />

      <DeleteOrgDialog
        orgId={orgId}
        orgName={orgName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
