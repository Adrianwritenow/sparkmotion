"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import { UsersTable } from "./users-table";
import { CreateUserDialog } from "./create-user-dialog";
import type { UserRow } from "@/app/(dashboard)/users/page";

interface UsersContentProps {
  data: UserRow[];
}

export function UsersContent({ data }: UsersContentProps) {
  const [tab, setTab] = useState<"ADMIN" | "CUSTOMER">("ADMIN");
  const [createOpen, setCreateOpen] = useState(false);

  const admins = useMemo(() => data.filter((u) => u.role === "ADMIN"), [data]);
  const customers = useMemo(() => data.filter((u) => u.role === "CUSTOMER"), [data]);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold">Users</h2>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "ADMIN" | "CUSTOMER")}>
        <TabsList>
          <TabsTrigger value="ADMIN">
            Admins ({admins.length})
          </TabsTrigger>
          <TabsTrigger value="CUSTOMER">
            Customers ({customers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ADMIN">
          <UsersTable data={admins} role="ADMIN" />
        </TabsContent>
        <TabsContent value="CUSTOMER">
          <UsersTable data={customers} role="CUSTOMER" />
        </TabsContent>
      </Tabs>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultRole={tab}
      />
    </>
  );
}
