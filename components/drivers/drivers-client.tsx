"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { formatPhone, formatCNIC } from "@/lib/utils";
import {
  addDriver,
  updateDriver,
  deleteDriver,
  setDriverStatus,
} from "@/app/actions/drivers";
import {
  Plus,
  Phone,
  IdCard,
  Camera,
  Pencil,
  Trash2,
  UserRound,
  Check,
  RotateCcw,
} from "lucide-react";

export type DriverRow = {
  id: string;
  full_name: string;
  phone: string | null;
  cnic: string | null;
  status: string;
  has_photo: boolean;
};

export function DriversClient({ drivers }: { drivers: DriverRow[] }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DriverRow | null>(null);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(d: DriverRow) {
    setEditing(d);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1>My Drivers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Keep a record of the drivers you employ. This helps building
            management if a driver leaves and an issue comes up later.
          </p>
        </div>
        <Button onClick={openAdd} className="btn-big gap-2">
          <Plus className="w-4 h-4" />
          Add Driver
        </Button>
      </header>

      {drivers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto">
            <UserRound className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No drivers added yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add the drivers you employ so building management has a record.
            </p>
          </div>
          <button
            onClick={openAdd}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Add your first driver
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {drivers.map((d) => (
            <DriverCard key={d.id} driver={d} onEdit={() => openEdit(d)} />
          ))}
        </div>
      )}

      <DriverDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        driver={editing}
      />
    </div>
  );
}

function DriverCard({
  driver,
  onEdit,
}: {
  driver: DriverRow;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isLeft = driver.status === "left";

  function run(fn: () => Promise<void>, okMsg: string) {
    start(async () => {
      try {
        await fn();
        toast({ title: okMsg });
        router.refresh();
      } catch (err) {
        toast({
          title: "Something went wrong",
          description: friendlyErrorMessage(err, "Please try again"),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="group rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all duration-150 flex flex-col">
      {/* Top: avatar + identity */}
      <div className="flex items-start gap-3">
        {driver.has_photo ? (
          <Image
            src={`/api/driver-photo/${driver.id}`}
            alt={driver.full_name}
            width={64}
            height={64}
            unoptimized
            className="w-16 h-16 rounded-xl object-cover border border-border shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <UserRound className="w-7 h-7 text-muted-foreground/50" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-foreground truncate">{driver.full_name}</p>
            <StatusPill left={isLeft} />
          </div>
          <div className="mt-2 space-y-1">
            {driver.phone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{formatPhone(driver.phone)}</span>
              </p>
            )}
            {driver.cnic && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <IdCard className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate tabular-nums">{formatCNIC(driver.cnic)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5">
        <button
          onClick={onEdit}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        <button
          onClick={() =>
            run(
              () => setDriverStatus(driver.id, isLeft ? "active" : "left"),
              isLeft ? "Marked active" : "Marked as left",
            )
          }
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
        >
          {isLeft ? <RotateCcw className="w-3 h-3" /> : <Check className="w-3 h-3" />}
          {isLeft ? "Mark active" : "Mark left"}
        </button>
        {confirmDelete ? (
          <span className="inline-flex items-center gap-1 ml-auto">
            <span className="text-[11px] text-destructive font-medium">Delete?</span>
            <button
              onClick={() => run(() => deleteDriver(driver.id), "Driver removed")}
              disabled={pending}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-foreground hover:bg-secondary/80"
            >
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="ml-auto p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ left }: { left: boolean }) {
  // Token strings copied from the app's status-pill palette (already compiled).
  const cls = left
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : "bg-[hsl(151_70%_55%/0.12)] text-[hsl(151_70%_55%)] border-[hsl(151_70%_55%/0.30)]";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}
    >
      {left ? "Left" : "Active"}
    </span>
  );
}

function DriverDialog({
  open,
  onClose,
  driver,
}: {
  open: boolean;
  onClose: () => void;
  driver: DriverRow | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const isEdit = !!driver;

  function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPhotoPreview(f ? URL.createObjectURL(f) : null);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        if (isEdit) await updateDriver(driver!.id, fd);
        else await addDriver(fd);
        toast({ title: isEdit ? "Driver updated" : "Driver added" });
        setPhotoPreview(null);
        if (fileRef.current) fileRef.current.value = "";
        onClose();
        router.refresh();
      } catch (err) {
        toast({
          title: isEdit ? "Could not update" : "Could not add",
          description: friendlyErrorMessage(err, "Please try again"),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Driver" : "Add Driver"}</DialogTitle>
        </DialogHeader>

        {/* key forces fresh defaultValues when switching between add/edit/records */}
        <form key={driver?.id ?? "new"} onSubmit={submit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="d-name">Driver name *</Label>
            <Input
              id="d-name"
              name="full_name"
              required
              maxLength={80}
              placeholder="e.g. Muhammad Aslam"
              defaultValue={driver?.full_name ?? ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-phone">Phone number *</Label>
            <Input
              id="d-phone"
              name="phone"
              type="tel"
              required
              placeholder="0300-1234567"
              defaultValue={driver?.phone ?? ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-cnic">
              CNIC <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="d-cnic"
              name="cnic"
              inputMode="numeric"
              placeholder="42101-1234567-1"
              defaultValue={driver?.cnic ?? ""}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d-photo">
              Photo <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="flex items-center gap-3">
              {photoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-14 h-14 rounded-lg object-cover border border-border"
                />
              ) : isEdit && driver?.has_photo ? (
                <Image
                  src={`/api/driver-photo/${driver.id}`}
                  alt="Current"
                  width={56}
                  height={56}
                  unoptimized
                  className="w-14 h-14 rounded-lg object-cover border border-border"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                  <Camera className="w-5 h-5 text-muted-foreground/60" />
                </div>
              )}
              <Input
                ref={fileRef}
                id="d-photo"
                name="photo"
                type="file"
                accept="image/*"
                className="cursor-pointer"
                onChange={onPhotoChange}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              On mobile you can take a photo directly with the camera.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save Changes" : "Add Driver"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
