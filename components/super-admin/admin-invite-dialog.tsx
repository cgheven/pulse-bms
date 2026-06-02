"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { createAdminWithBuildings } from "@/app/actions/super-admin";

type BuildingOption = { id: string; name: string };

function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

export function AdminInviteButton({ buildings }: { buildings: BuildingOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big" onClick={() => setOpen(true)}>
        + Create Admin
      </Button>
      <AdminInviteDialog buildings={buildings} open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AdminInviteDialog({
  buildings,
  open,
  onOpenChange,
}: {
  buildings: BuildingOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  type BuildingRow = { name: string; total_flats: string };
  const [newBuildings, setNewBuildings] = useState<BuildingRow[]>([{ name: "", total_flats: "" }]);
  const lastInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function addRow() {
    setNewBuildings((prev) => [...prev, { name: "", total_flats: "" }]);
    setTimeout(() => lastInputRef.current?.focus(), 50);
  }

  function updateRow(i: number, field: keyof BuildingRow, val: string) {
    setNewBuildings((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  function removeRow(i: number) {
    setNewBuildings((prev) =>
      prev.length === 1 ? [{ name: "", total_flats: "" }] : prev.filter((_, idx) => idx !== i)
    );
  }

  function reset() {
    setEmail(""); setFullName(""); setPhone("");
    setPassword(""); setNewBuildings([{ name: "", total_flats: "" }]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const validBuildings = newBuildings.filter((b) => b.name.trim());
    if (!email.trim()) {
      toast({ title: "Email is required", variant: "destructive" }); return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" }); return;
    }
    if (validBuildings.length === 0) {
      toast({ title: "Add at least one building name", variant: "destructive" }); return;
    }

    startTransition(async () => {
      try {
        const res = await createAdminWithBuildings({
          email,
          password,
          full_name: fullName,
          phone,
          building_names: validBuildings.map((b) => ({
            name: b.name.trim(),
            total_flats: Number(b.total_flats) || 0,
          })),
        });
        toast({
          title: res.createdNew ? "Admin account created" : "Admin updated",
          description: `${validBuildings.length} building${validBuildings.length > 1 ? "s" : ""} created and assigned. ${email} can sign in now.`,
        });
        reset();
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not create admin",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Admin Account</DialogTitle>
          <DialogDescription>
            Set up the admin and add all their buildings in one go. Buildings are created and assigned immediately.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              required
              placeholder="admin@example.com"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-base">
              Password <span className="text-destructive">*</span>
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                  className="h-12 text-base pr-12"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-2"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 px-4"
                onClick={() => { setPassword(generatePassword()); setShowPassword(true); }}
              >
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The admin can change this themselves after first sign-in.
            </p>
          </div>

          {/* Name + Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-base">Full Name</Label>
              <Input
                id="full_name"
                className="h-12 text-base"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-base">Phone</Label>
              <Input
                id="phone"
                className="h-12 text-base"
                placeholder="0300-1234567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Buildings — type names inline */}
          <div className="space-y-2">
            <Label className="text-base">
              Buildings <span className="text-destructive">*</span>
            </Label>
            {/* Column headers */}
            <div className="flex gap-2 px-0.5">
              <span className="flex-1 text-xs text-muted-foreground">Building Name</span>
              <span className="w-24 text-xs text-muted-foreground">Total Flats</span>
              <span className="w-8" />
            </div>
            <div className="space-y-2">
              {newBuildings.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    ref={i === newBuildings.length - 1 ? lastInputRef : undefined}
                    className="h-12 text-base flex-1"
                    placeholder={i === 0 ? "e.g. Sunrise Apartments" : "e.g. Al-Madina Heights"}
                    value={row.name}
                    onChange={(e) => updateRow(i, "name", e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRow(); } }}
                  />
                  <Input
                    className="h-12 text-base w-24"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={row.total_flats}
                    onChange={(e) => updateRow(i, "total_flats", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors shrink-0 w-8"
                    aria-label="Remove"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors pt-1"
            >
              <Plus className="w-4 h-4" />
              Add another building
            </button>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="btn-big">
              {isPending ? "Creating..." : "Create Admin"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
