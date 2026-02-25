import { User } from "lucide-react";

import { OrgNameForm } from "@/components/settings/org-name-form";
import { OrgWebsiteUrlForm } from "@/components/settings/org-website-url-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { TimezoneSelector } from "@/components/settings/timezone-selector";
import { auth } from "@sparkmotion/auth";
import { db } from "@sparkmotion/database";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const userName = session?.user?.name || "User";
  const userEmail = session?.user?.email || "user@sparkmotion.io";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  // Fetch org data for websiteUrl
  const org = session?.user?.orgId
    ? await db.organization.findUnique({
        where: { id: session.user.orgId },
        select: { id: true, name: true, websiteUrl: true },
      })
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
        {/* Sidebar */}
        <nav className="space-y-1">
          {[
            { label: "General", icon: User, active: true },
          ].map((item) => (
            <button
              key={item.label}
              disabled
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted opacity-60 cursor-not-allowed"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Profile Information
            </h2>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FF9D1D] to-[#FF4220] flex items-center justify-center text-white text-xl font-bold">
                  {initials}
                </div>
                <button
                  disabled
                  className="px-3 py-1.5 text-sm font-medium border border-border rounded-md opacity-60 cursor-not-allowed"
                >
                  Change Avatar
                </button>
              </div>
              <ProfileForm
                currentName={userName}
                currentEmail={userEmail}
              />
            </div>
          </div>

          {/* Organization */}
          {org && (
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">
                Organization
              </h2>
              <div className="space-y-4">
                <OrgNameForm orgId={org.id} currentName={org.name} />
                <OrgWebsiteUrlForm
                  orgId={org.id}
                  currentWebsiteUrl={org.websiteUrl}
                />
              </div>
            </div>
          )}

          {/* Preferences */}
          <div className="bg-card border border-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Preferences
            </h2>
            <div className="space-y-6">
              {/* Working timezone preference */}
              <TimezoneSelector />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
