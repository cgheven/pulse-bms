"use client";

import { useState, useTransition } from "react";
import { Trash2, KeyRound, Copy, Check, Phone, Mail, MoreHorizontal, MessageCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { removeUnionMember, resetUnionMemberLogin, type UnionLoginResult } from "@/app/actions/union";

type ProfileLite = { email: string | null; phone: string | null } | null;

type Member = {
  id: string;
  full_name: string;
  position: string | null;
  term_start: string;
  term_end: string;
  is_active: boolean | null;
  profile_id: string;
  bms_profiles: ProfileLite | ProfileLite[];
};

const POSITION_LABEL: Record<string, string> = {
  president: "President",
  vp:        "Vice President",
  secretary: "Secretary",
  treasurer: "Treasurer",
  member:    "Member",
};

const POSITION_TONE: Record<string, string> = {
  president: "bg-[hsl(38_92%_55%/0.18)] text-[hsl(38_92%_70%)] border border-[hsl(38_92%_55%/0.35)]",
  vp:        "bg-[hsl(38_92%_55%/0.10)] text-[hsl(38_92%_60%)] border border-[hsl(38_92%_55%/0.20)]",
  treasurer: "bg-[hsl(151_70%_32%/0.15)] text-[hsl(151_70%_50%)] border border-[hsl(151_70%_32%/0.3)]",
  secretary: "bg-[hsl(191_100%_50%/0.12)] text-[hsl(191_100%_60%)] border border-[hsl(191_100%_50%/0.25)]",
  member:    "bg-secondary text-muted-foreground border border-border",
};

function initials(name: string) {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function formatTerm(start: string, end: string) {
  const fmt = (d: Date) =>
    d.toLocaleString("en-PK", { month: "short", year: "numeric" });
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`;
}

function resolveProfile(raw: ProfileLite | ProfileLite[]): ProfileLite {
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

/* ── Credentials modal ───────────────────────────────────────────────────── */

function CredentialsModal({
  open,
  loading,
  creds,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  creds: UnionLoginResult | null;
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<"username" | "password" | null>(null);

  function copy(text: string, field: "username" | "password") {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    });
  }

  function shareOnWhatsApp() {
    if (!creds) return;
    const phone = creds.username_kind === "phone"
      ? creds.username.replace(/\D/g, "")
      : null;
    const msg = [
      `*Union Portal Login*`,
      `Name: ${creds.full_name}`,
      creds.username_kind === "phone"
        ? `Mobile: ${creds.username}`
        : `Email: ${creds.username}`,
      `Password: ${creds.password}`,
      ``,
      `Login at: https://bms.yourpulse.io/login`,
    ].join("\n");
    const encoded = encodeURIComponent(msg);
    const url = phone
      ? `https://wa.me/92${phone.replace(/^0/, "")}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;
    window.open(url, "_blank");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !loading && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            {loading ? "Generating credentials…" : `Login — ${creds?.full_name}`}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
          </div>
        ) : creds ? (
          <div className="space-y-3 py-1">
            {/* Username */}
            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground flex items-center gap-1">
                  {creds.username_kind === "phone"
                    ? <><Phone className="w-3 h-3" /> Mobile</>
                    : <><Mail className="w-3 h-3" /> Email</>}
                </span>
                <button
                  onClick={() => copy(creds.username, "username")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy username"
                >
                  {copiedField === "username"
                    ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-base font-mono font-semibold">{creds.username}</p>
            </div>

            {/* Password */}
            <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                  Password
                </span>
                <button
                  onClick={() => copy(creds.password, "password")}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy password"
                >
                  {copiedField === "password"
                    ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-base font-mono font-semibold tracking-widest">{creds.password}</p>
            </div>

            <p className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
              Save this password — it won&apos;t be shown again.
            </p>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={shareOnWhatsApp}
                className="flex-1 h-11 bg-[#25D366] hover:bg-[#20bd5a] text-white gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Share on WhatsApp
              </Button>
              <Button variant="outline" onClick={onClose} className="flex-1 h-11">
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */

export function MembersTab({ members }: { members: Member[] }) {
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [credsOpen, setCredsOpen] = useState(false);
  const [credentials, setCredentials] = useState<UnionLoginResult | null>(null);

  function confirmRemove() {
    if (!removeTarget) return;
    startRemove(async () => {
      try {
        await removeUnionMember(removeTarget);
        toast({ title: "Union member removed" });
        setRemoveTarget(null);
      } catch (e) {
        toast({ title: "Could not remove", description: friendlyErrorMessage(e), variant: "destructive" });
      }
    });
  }

  function handleResetLogin(memberId: string) {
    // Open the modal immediately with a loading spinner — no waiting for the
    // server round-trip before showing UI.
    setCredentials(null);
    setCredsOpen(true);
    startReset(async () => {
      try {
        const result = await resetUnionMemberLogin(memberId);
        setCredentials(result);
      } catch (e) {
        setCredsOpen(false);
        toast({ title: "Could not reset login", description: friendlyErrorMessage(e), variant: "destructive" });
      }
    });
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Member
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Position
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Term
                </th>
                <th className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Login
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                    No union members yet. Click{" "}
                    <span className="text-foreground font-medium">Add Member</span> to start —
                    adding a resident here promotes them to the Union role.
                  </td>
                </tr>
              ) : (
                members.map((m) => {
                  const pos = (m.position ?? "member") as keyof typeof POSITION_TONE;
                  const tone = POSITION_TONE[pos] ?? POSITION_TONE.member;
                  const isActive = Boolean(m.is_active);
                  const profileRow = resolveProfile(m.bms_profiles);
                  const loginId = profileRow?.phone ?? profileRow?.email ?? null;
                  const loginKind = profileRow?.phone ? "phone" : "email";

                  return (
                    <tr
                      key={m.id}
                      className={`border-b border-border last:border-0 hover:bg-secondary/40 transition-colors ${
                        isActive ? "" : "opacity-55"
                      }`}
                    >
                      {/* Member */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${tone}`}>
                            {initials(m.full_name)}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate leading-tight">
                              {m.full_name}
                            </div>
                            {!isActive && (
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                                Inactive
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Position */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${tone}`}>
                          {POSITION_LABEL[pos] ?? m.position}
                        </span>
                      </td>

                      {/* Term */}
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums text-xs">
                        {formatTerm(m.term_start, m.term_end)}
                      </td>

                      {/* Login */}
                      <td className="px-3 py-2.5">
                        {loginId ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {loginKind === "phone"
                              ? <Phone className="w-3 h-3 shrink-0" />
                              : <Mail className="w-3 h-3 shrink-0" />}
                            <span className="font-mono">{loginId}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50 italic">No login</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2.5 text-right">
                        {isActive && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                disabled={removePending || resetPending}
                                aria-label="Member actions"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleResetLogin(m.id)}>
                                <KeyRound className="w-3.5 h-3.5" />
                                {loginId ? "Reset login" : "Create login"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem destructive onClick={() => setRemoveTarget(m.id)}>
                                <Trash2 className="w-3.5 h-3.5" />
                                Remove member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove this member?"
        description="They will be deactivated and their role reverted to Resident."
        confirmLabel="Remove"
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      <CredentialsModal
        open={credsOpen}
        loading={resetPending}
        creds={credentials}
        onClose={() => { setCredsOpen(false); setCredentials(null); }}
      />
    </>
  );
}
