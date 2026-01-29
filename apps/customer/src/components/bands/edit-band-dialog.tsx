"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Band } from "@sparkmotion/database";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const editBandSchema = z.object({
  bandId: z.string().min(1).regex(/^[A-Za-z0-9-]+$/),
  status: z.enum(["ACTIVE", "DISABLED", "LOST"]),
});

type EditBandForm = z.infer<typeof editBandSchema>;

export function EditBandDialog({ band }: { band: Band }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const updateBand = trpc.bands.update.useMutation({
    onSuccess: () => {
      utils.bands.list.invalidate();
      setOpen(false);
    },
  });

  const form = useForm<EditBandForm>({
    resolver: zodResolver(editBandSchema),
    defaultValues: { bandId: band.bandId, status: band.status },
  });

  const onSubmit = (data: EditBandForm) => {
    updateBand.mutate({ id: band.id, ...data });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Band</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Band ID</label>
            <Input {...form.register("bandId")} />
            {form.formState.errors.bandId && (
              <p className="text-sm text-destructive">{form.formState.errors.bandId.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select
              value={form.watch("status")}
              onValueChange={(v) => form.setValue("status", v as EditBandForm["status"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="DISABLED">Disabled</SelectItem>
                <SelectItem value="LOST">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={updateBand.isPending}>
              {updateBand.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
