import { Bell, Globe, Lock, Mail, Shield, User } from "lucide-react";

import { TimezoneSelector } from "@/components/settings/timezone-selector";
import { auth } from "@sparkmotion/auth";

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

      {/* Coming Soon Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <div className="font-medium text-blue-900 dark:text-blue-100">
              More settings coming soon
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Profile editing, notifications, and security settings will be available in an upcoming release. Timezone preference is available now.
            </div>
          </div>
        </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    disabled
                    defaultValue={userName.split(" ")[0] || "Admin"}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md opacity-60 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    disabled
                    defaultValue={userName.split(" ")[1] || "User"}
                    className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md opacity-60 cursor-not-allowed"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  disabled
                  defaultValue={userEmail}
                  className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md opacity-60 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

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

          <div className="flex justify-end gap-3">
            <button
              disabled
              className="px-4 py-2 text-sm font-medium text-muted-foreground opacity-60 cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              disabled
              className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary/50 rounded-md cursor-not-allowed"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
