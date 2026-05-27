"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StaffForm } from "./staff-form";
import { deleteStaff } from "@/app/actions/staff";
import {
  createGuardAccountForStaff,
  revokeGuardAccountForStaff,
} from "@/app/actions/guard-accounts";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { Eye, Pencil, Trash2, ShieldCheck, ShieldOff, ShieldPlus, EyeOff, RefreshCw, MessageCircle, CheckCircle2 } from "lucide-react";
import type { StaffRole } from "@/types";
import { buildSlug } from "@/lib/slug";
import { normalizePhone, toIntlNoPlus, displayPhone } from "@/lib/phone";

type StaffRow = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  cnic: string | null;
  monthly_salary: number;
  join_date: string | null;
  exit_date: string | null;
  is_active: boolean | null;
  notes: string | null;
  profile_id: string | null;
};

/* ── CreateLoginDialog ────────────────────────────────────────────────── */

function generatePassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function CreateLoginDialog({
  staff,
  open,
  onOpenChange,
}: {
  staff: StaffRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState(staff.phone ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [created, setCreated] = useState<{ phone: string; password: string } | null>(null);

  function reset() {
    setPhone(staff.phone ?? "");
    setPassword("");
    setShowPassword(false);
    setCreated(null);
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function handleGenerate() {
    const pwd = generatePassword();
    setPassword(pwd);
    setShowPassword(true);
  }

  function handleSendWhatsApp() {
    if (!created) return;
    const canonical = normalizePhone(created.phone) ?? created.phone;
    const intl = toIntlNoPlus(canonical);
    if (!intl) return;
    const display = displayPhone(canonical) || canonical;
    const msg = `Assalam-o-Alaikum ${staff.full_name}!\n\nYour gate guard login details:\n📱 Mobile: ${display}\n🔑 Password: ${created.password}\n\nPlease keep these confidential.`;
    window.open(`https://wa.me/${intl}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const result = await createGuardAccountForStaff(staff.id, { phone, password });
        setCreated({ phone: result.phone, password });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not create login",
          description: friendlyErrorMessage(err, "Creation failed. Please try again."),
          variant: "destructive",
        });
      }
    });
  }

  const phoneDigits = phone.replace(/\D/g, "");
  const canSubmit = (phoneDigits.length === 11 || phoneDigits.length === 10) && password.length >= 8;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Guard Login</DialogTitle>
        </DialogHeader>

        {created ? (
          /* ── Success state ── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-[hsl(151_70%_45%)]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Login created for <span className="font-semibold">{staff.full_name}</span></span>
            </div>

            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mobile</span>
                <span className="font-medium tabular-nums">{displayPhone(normalizePhone(created.phone) ?? created.phone) || created.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Password</span>
                <span className="font-medium font-mono">{created.password}</span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Share these credentials with the guard. They can sign in at the login page using their mobile number.
            </p>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                type="button"
                onClick={handleSendWhatsApp}
                className="gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white w-full sm:w-auto"
              >
                <MessageCircle className="w-4 h-4" />
                Send via WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <p className="text-sm text-muted-foreground -mt-2">
              Create a login for{" "}
              <span className="font-semibold text-foreground">{staff.full_name}</span>.
              They will sign in using their mobile number and password.
            </p>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label htmlFor="guard-login-phone" className="text-sm mb-1.5 block">
                  Mobile Number
                </Label>
                <Input
                  id="guard-login-phone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0300-1234567"
                  className="h-11"
                  autoFocus={!staff.phone}
                  disabled={pending}
                />
              </div>

              <div>
                <Label htmlFor="guard-login-password" className="text-sm mb-1.5 block">
                  Password{" "}
                  <span className="text-muted-foreground font-normal">(min. 8 characters)</span>
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      id="guard-login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Set a secure password"
                      className="h-11 pr-10"
                      minLength={8}
                      disabled={pending}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={handleGenerate}
                    disabled={pending}
                    title="Generate password"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={pending || !canSubmit}
                  className="gap-2"
                >
                  <ShieldPlus className="w-4 h-4" />
                  {pending ? "Creating..." : "Create Guard Login"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── RevokeLoginButton ────────────────────────────────────────────────── */

function RevokeLoginButton({ staff }: { staff: StaffRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  const onRevoke = () => {
    start(async () => {
      try {
        await revokeGuardAccountForStaff(staff.id);
        setConfirm(false);
        toast({ title: "Guard login revoked", description: `${staff.full_name} can no longer log in.` });
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not revoke login",
          description: friendlyErrorMessage(err, "Revoke failed. Please try again."),
          variant: "destructive",
        });
      }
    });
  };

  return (
    <>
      {/* Login Active badge */}
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_45%)] border border-[hsl(151_70%_32%/0.3)]">
        <ShieldCheck className="w-3 h-3" />
        Login Active
      </span>

      {/* Revoke button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirm(true)}
        className="text-destructive hover:text-destructive gap-1"
        title="Revoke guard login"
      >
        <ShieldOff className="w-4 h-4" />
        Revoke
      </Button>

      <ConfirmDialog
        open={confirm}
        title="Revoke guard login?"
        description={`${staff.full_name} will no longer be able to sign in as a guard. You can create a new login for them at any time.`}
        confirmLabel={pending ? "Revoking..." : "Revoke Login"}
        onCancel={() => setConfirm(false)}
        onConfirm={onRevoke}
      />
    </>
  );
}

/* ── StaffRowActions ──────────────────────────────────────────────────── */

export function StaffRowActions({ staff }: { staff: StaffRow }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);
  const [createLogin, setCreateLogin] = useState(false);
  const [pending, start] = useTransition();

  const onDelete = () => {
    start(async () => {
      try {
        await deleteStaff(staff.id);
        setDel(false);
        router.refresh();
      } catch (e) {
        alert(friendlyErrorMessage(e, "Could not delete staff"));
      }
    });
  };

  const isChowkidar = staff.role === "chowkidar";

  return (
    <div className="flex items-center gap-2 justify-end flex-wrap">
      {/* Guard login controls — only for chowkidars */}
      {isChowkidar && (
        <>
          {staff.profile_id ? (
            <RevokeLoginButton staff={staff} />
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateLogin(true)}
              className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
            >
              <ShieldPlus className="w-4 h-4" />
              Create Login
            </Button>
          )}
        </>
      )}

      <Link href={`/admin/staff/${buildSlug(staff.full_name, staff.id)}`}>
        <Button variant="ghost" size="sm">
          <Eye className="w-4 h-4 mr-1" /> View
        </Button>
      </Link>
      <Button variant="ghost" size="sm" onClick={() => setEdit(true)}>
        <Pencil className="w-4 h-4 mr-1" /> Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDel(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="w-4 h-4" />
      </Button>

      <StaffForm open={edit} onOpenChange={setEdit} staff={staff} />

      {isChowkidar && (
        <CreateLoginDialog
          staff={staff}
          open={createLogin}
          onOpenChange={setCreateLogin}
        />
      )}

      <ConfirmDialog
        open={del}
        title="Delete staff?"
        description={`Permanently remove ${staff.full_name}. Attendance and salary records will remain.`}
        confirmLabel={pending ? "Deleting..." : "Delete"}
        onCancel={() => setDel(false)}
        onConfirm={onDelete}
      />
    </div>
  );
}
