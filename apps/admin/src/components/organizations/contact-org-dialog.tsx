"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

interface ContactOrgDialogProps {
  orgId: string;
  orgName: string;
  contactEmail: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactOrgDialog({
  orgId,
  orgName,
  contactEmail,
  open,
  onOpenChange,
}: ContactOrgDialogProps) {
  const [to, setTo] = useState(contactEmail || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [success, setSuccess] = useState(false);

  const sendEmail = trpc.organizations.sendContactEmail.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setTo(contactEmail || "");
        setSubject("");
        setBody("");
        onOpenChange(false);
      }, 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendEmail.mutate({
      orgId,
      to: to.trim(),
      subject: subject.trim(),
      body: body.trim(),
    });
  };

  const handleClose = () => {
    if (!sendEmail.isPending) {
      setSuccess(false);
      setTo(contactEmail || "");
      setSubject("");
      setBody("");
      onOpenChange(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-card border border-border rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Contact {orgName}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Send an email to the organization contact.
        </p>

        {success ? (
          <div className="py-8 text-center">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Email sent successfully!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="contact-to"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                To
              </label>
              <input
                id="contact-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="org@example.com"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div>
              <label
                htmlFor="contact-subject"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Subject
              </label>
              <input
                id="contact-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Regarding your upcoming event..."
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>

            <div>
              <label
                htmlFor="contact-body"
                className="block text-sm font-medium text-foreground mb-1.5"
              >
                Message
              </label>
              <textarea
                id="contact-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your message..."
                rows={5}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                required
              />
            </div>

            {sendEmail.error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {sendEmail.error.message}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium border border-border rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendEmail.isPending || !to.trim() || !subject.trim() || !body.trim()}
                className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sendEmail.isPending ? "Sending..." : "Send Email"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
