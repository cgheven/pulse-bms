"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Copy, Check, MessageCircle, CheckCircle2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { createTeamMember, type TeamRole } from "@/app/actions/teams";
import { buildWhatsappLink } from "@/lib/whatsapp-templates";
import { displayPkPhone } from "@/lib/pk-phone";

// Cryptographically-random password generator using Web Crypto. Avoids
// ambiguous chars (0/O, 1/l/I) so super_admin can dictate over the phone
// without errors.
function generatePassword(length = 12) {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let pw = "";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) pw += chars[arr[i] % chars.length];
  return pw;
}

type JustCreated = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
  synthesized_email: boolean;
};

export function AddTeamMemberButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="btn-big" onClick={() => setOpen(true)}>
        + Add Team Member
      </Button>
      <AddTeamMemberDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function AddTeamMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<TeamRole>("sales");
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [justCreated, setJustCreated] = useState<JustCreated | null>(null);

  // Auto-generate password the moment the dialog opens for a fresh
  // create. Salesperson can still click "Generate" again or edit by
  // hand — the auto-fill removes a click on the happy path.
  useEffect(() => {
    if (open && !justCreated && !password) {
      setPassword(generatePassword());
    }
  }, [open, justCreated, password]);

  function reset() {
    setFullName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setCopied(false);
    setRole("sales");
    setJustCreated(null);
  }

  async function copyCredentials() {
    const target = justCreated;
    if (!target) return;
    const lines = [
      `Pulse BMS team-member login`,
      `Sign in: ${window.location.origin}/login`,
      `Email: ${target.email}`,
      `Password: ${target.password}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Could not copy",
        description: "Copy the credentials manually before closing.",
        variant: "destructive",
      });
    }
  }

  function sendCredentialsOnWhatsapp() {
    if (!justCreated) return;
    const url = buildWhatsappLink(justCreated.phone, "team_credentials", {
      contact_name: justCreated.full_name,
      owner_name: "Pulse Team",
      login_email: justCreated.email,
      login_password: justCreated.password,
    });
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleOpenChange(o: boolean) {
    onOpenChange(o);
    if (!o) {
      // small delay so closing animation doesn't show stale form
      setTimeout(reset, 200);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast({ title: "Full name is required", variant: "destructive" });
      return;
    }
    if (!phone.trim()) {
      toast({ title: "Mobile number is required", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    // Capture the password in scope BEFORE the server call — the action
    // doesn't return the plaintext (Supabase Auth hashes it before
    // store), so we keep it client-side for the WhatsApp send step.
    const passwordSnapshot = password;

    startTransition(async () => {
      try {
        const created = await createTeamMember({
          full_name: fullName,
          email: email || null,
          phone,
          password: passwordSnapshot,
          role,
        });
        toast({ title: "Team member created" });
        router.refresh();
        setJustCreated({
          id: created.id,
          full_name: created.full_name,
          email: created.email,
          phone: created.phone,
          password: passwordSnapshot,
          synthesized_email: created.synthesized_email,
        });
      } catch (err) {
        toast({
          title: "Could not create team member",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  // ── Post-create success view ─────────────────────────────────────
  if (justCreated) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-success" />
              <DialogTitle>Team member created</DialogTitle>
            </div>
            <DialogDescription>
              {justCreated.full_name} can sign in now. Send their login on
              WhatsApp ({displayPkPhone(justCreated.phone)}) in one click.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-secondary/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Credentials
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={copyCredentials}
                className="h-8 text-xs gap-1"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs font-mono break-all">{justCreated.email}</p>
            <p className="text-xs font-mono break-all">{justCreated.password}</p>
            {justCreated.synthesized_email && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Email auto-generated from mobile — used as internal login
                handle.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="h-11"
            >
              Done
            </Button>
            <Button
              type="button"
              onClick={() => {
                sendCredentialsOnWhatsapp();
                handleOpenChange(false);
              }}
              className="btn-big bg-success hover:bg-success/90 text-white"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Send via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Create form ──────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Create a sales-team account. They&rsquo;ll only see the Leads CRM &mdash;
            nothing about real customer buildings, finance, or residents.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name" className="text-base">
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="full_name"
              required
              placeholder="Tariq Khatri"
              className="h-12 text-base"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-base">
              Mobile Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              required
              type="tel"
              placeholder="0333-1231231"
              className="h-12 text-base"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used for WhatsApp delivery of their credentials. We accept
              0333… or +92 333… format.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-base">
              Email{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="tariq.khatri@gmail.com"
              className="h-12 text-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank and we&rsquo;ll auto-generate an internal login
              email from the mobile number.
            </p>
          </div>

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
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                className="h-12 px-4"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPassword(true);
                }}
              >
                Regenerate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Auto-generated. They can change it after first sign-in.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
              <SelectTrigger className="h-12 text-base">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales (Leads CRM only)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-12 px-6 text-base"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="btn-big">
              {isPending ? "Creating..." : "Create Team Member"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
