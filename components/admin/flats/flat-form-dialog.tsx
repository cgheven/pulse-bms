"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createFlatWithPeople,
  updateFlat,
  type FlatInput,
  type CreatedLogin,
} from "@/app/actions/flats";
import { LoginShareModal } from "./login-share-modal";
import { User, UserCheck } from "lucide-react";

export type FlatFormValues = FlatInput & { id?: string };

type PersonForm = {
  full_name: string;
  phone: string;
  email: string;
};

const emptyPerson: PersonForm = { full_name: "", phone: "", email: "" };

export function FlatFormDialog({
  trigger,
  initial,
  open: controlledOpen,
  onOpenChange,
  buildingName,
}: {
  trigger?: React.ReactNode;
  initial?: FlatFormValues;
  open?: boolean;
  onOpenChange?: (b: boolean) => void;
  buildingName?: string;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const isEdit = Boolean(initial?.id);

  const [flat_number, setFlatNumber] = useState(initial?.flat_number ?? "");
  const [floor, setFloor] = useState<string>(
    initial?.floor != null ? String(initial.floor) : "",
  );
  const [block, setBlock] = useState(initial?.block ?? "");
  const [size_sqft, setSize] = useState<string>(
    initial?.size_sqft != null ? String(initial.size_sqft) : "",
  );
  const [monthly_fee, setMonthlyFee] = useState<string>(
    initial?.monthly_fee != null ? String(initial.monthly_fee) : "",
  );
  const [ownership_type, setOwnership] = useState<"owner" | "tenant" | "vacant">(
    initial?.ownership_type ?? "owner",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // People — only relevant on create. Edit mode hides these sections.
  const [owner, setOwner] = useState<PersonForm>(emptyPerson);
  const [tenant, setTenant] = useState<PersonForm>(emptyPerson);

  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  // After-create login share modal state
  const [logins, setLogins] = useState<CreatedLogin[] | null>(null);
  const [shareFlatNumber, setShareFlatNumber] = useState<string>("");

  const resetForm = () => {
    setFlatNumber("");
    setFloor("");
    setBlock("");
    setSize("");
    setMonthlyFee("");
    setOwnership("owner");
    setNotes("");
    setOwner(emptyPerson);
    setTenant(emptyPerson);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        const flatPayload: FlatInput = {
          flat_number,
          floor: floor ? Number(floor) : null,
          block: block || null,
          size_sqft: size_sqft ? Number(size_sqft) : null,
          monthly_fee: monthly_fee ? Number(monthly_fee) : null,
          ownership_type,
          notes: notes || null,
        };

        if (isEdit && initial?.id) {
          await updateFlat(initial.id, flatPayload);
          toast({ title: "Flat updated" });
          setOpen(false);
          router.refresh();
          return;
        }

        const result = await createFlatWithPeople({
          flat: flatPayload,
          owner: hasAny(owner) ? owner : null,
          tenant:
            ownership_type === "tenant" && hasAny(tenant) ? tenant : null,
        });

        toast({
          title: "Flat created",
          description:
            result.logins.length > 0
              ? `${result.logins.length} login${result.logins.length === 1 ? "" : "s"} ready to share`
              : "No login created (no contact info provided)",
        });

        // Close the form dialog. If we made logins, immediately open the share modal.
        setOpen(false);
        router.refresh();
        if (result.logins.length > 0) {
          setShareFlatNumber(flatPayload.flat_number);
          setLogins(result.logins);
        }
        resetForm();
      } catch (err) {
        toast({
          title: "Error",
          description: err instanceof Error ? err.message : "Could not save flat",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Flat" : "Add Flat"}</DialogTitle>
            {!isEdit && (
              <DialogDescription>
                Adding people is optional — leave blank to create just the flat.
                When you add a mobile or email we&rsquo;ll create their portal
                login right after and give you a ready-to-send welcome message.
              </DialogDescription>
            )}
          </DialogHeader>

          <form onSubmit={onSubmit} className="space-y-5">
            {/* ─────  Flat details  ───── */}
            <section className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Flat number *</Label>
                <Input
                  required
                  value={flat_number}
                  onChange={(e) => setFlatNumber(e.target.value)}
                  placeholder="A-101"
                />
              </div>
              <div>
                <Label>Floor</Label>
                <Input
                  type="number"
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                />
              </div>
              <div>
                <Label>Block</Label>
                <Input value={block} onChange={(e) => setBlock(e.target.value)} />
              </div>
              <div>
                <Label>Size (sqft)</Label>
                <Input
                  type="number"
                  value={size_sqft}
                  onChange={(e) => setSize(e.target.value)}
                />
              </div>
              <div>
                <Label>Monthly fee (PKR, optional)</Label>
                <Input
                  type="number"
                  value={monthly_fee}
                  onChange={(e) => setMonthlyFee(e.target.value)}
                  placeholder="Defaults to building fee"
                />
              </div>
              <div className="col-span-2">
                <Label>Status</Label>
                <Select
                  value={ownership_type}
                  onValueChange={(v) =>
                    setOwnership(v as "owner" | "tenant" | "vacant")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner-occupied</SelectItem>
                    <SelectItem value="tenant">Tenant-occupied (rented)</SelectItem>
                    <SelectItem value="vacant">Vacant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            {/* ─────  People sections (create mode only)  ───── */}
            {!isEdit && ownership_type !== "vacant" && (
              <>
                <PersonSection
                  title="Owner"
                  hint={
                    ownership_type === "tenant"
                      ? "The landlord. Gets contact + their own portal view."
                      : "Lives in this flat. Gets a portal login."
                  }
                  icon={<UserCheck className="w-4 h-4 text-primary" />}
                  person={owner}
                  setPerson={setOwner}
                />

                {ownership_type === "tenant" && (
                  <PersonSection
                    title="Tenant"
                    hint="The person actually living here. Gets a portal login."
                    icon={<User className="w-4 h-4 text-[hsl(210_90%_70%)]" />}
                    person={tenant}
                    setPerson={setTenant}
                  />
                )}
              </>
            )}

            {/* ─────  Notes  ───── */}
            <section>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </section>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving..." : isEdit ? "Save changes" : "Create flat"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {logins && (
        <LoginShareModal
          open={Boolean(logins)}
          onClose={() => setLogins(null)}
          logins={logins}
          flatNumber={shareFlatNumber}
          buildingName={buildingName}
        />
      )}
    </>
  );
}

function PersonSection({
  title,
  hint,
  icon,
  person,
  setPerson,
}: {
  title: string;
  hint: string;
  icon: React.ReactNode;
  person: PersonForm;
  setPerson: (p: PersonForm) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Full name</Label>
          <Input
            value={person.full_name}
            onChange={(e) => setPerson({ ...person, full_name: e.target.value })}
            placeholder="As shown on CNIC"
          />
        </div>
        <div>
          <Label>Mobile number</Label>
          <Input
            inputMode="tel"
            value={person.phone}
            onChange={(e) => setPerson({ ...person, phone: e.target.value })}
            placeholder="0331-1000006"
          />
        </div>
        <div>
          <Label>Email (optional)</Label>
          <Input
            type="email"
            value={person.email}
            onChange={(e) => setPerson({ ...person, email: e.target.value })}
            placeholder="name@example.com"
          />
        </div>
      </div>
    </section>
  );
}

function hasAny(p: PersonForm): boolean {
  return Boolean(p.full_name.trim() || p.phone.trim() || p.email.trim());
}
