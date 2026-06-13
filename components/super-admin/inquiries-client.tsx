"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ClipboardList, MessageCircle, Phone, ChevronDown, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn, formatDate } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { updateInquiryStatus, deleteInquiry } from "@/app/actions/website-inquiry";

// ─── Types ─────────────────────────────────────────────────────────────────────

type InquiryStatus = "new" | "contacted" | "converted";

export type Inquiry = {
  id: string;
  president_name: string;
  building_name: string;
  city: string | null;
  num_flats: number;
  package: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  contact_timing: string | null;
  starting_date: string | null;
  message: string | null;
  status: InquiryStatus;
  created_at: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<InquiryStatus, string> = {
  new:       "New",
  contacted: "Contacted",
  converted: "Converted",
};

const PACKAGE_LABEL: Record<string, string> = {
  starter: "Starter",
  growth:  "Growth",
  pro:     "Pro",
};

// Only digits, spaces, +, -, (, ) are safe in a tel/wa href
const SAFE_PHONE_RE = /^[\d\s+\-().]+$/;
const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safePhoneHref(raw: string): string | null {
  const trimmed = raw.trim();
  return SAFE_PHONE_RE.test(trimmed) ? `tel:${trimmed}` : null;
}

function safeWaHref(raw: string): string | null {
  let n = raw.replace(/[\s\-().+]/g, "");
  if (n.startsWith("0")) n = "92" + n.slice(1);
  // After normalising, must be all digits
  return /^\d+$/.test(n) ? `https://wa.me/${n}` : null;
}

function safeMailtoHref(raw: string): string | null {
  const trimmed = raw.trim();
  return SAFE_EMAIL_RE.test(trimmed) ? `mailto:${trimmed}` : null;
}

// ─── Status options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: InquiryStatus; label: string; pill: string; dot: string }[] = [
  { value: "new",       label: "New",       pill: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-400" },
  { value: "contacted", label: "Contacted", pill: "bg-blue-100  text-blue-800  border-blue-200",    dot: "bg-blue-400"   },
  { value: "converted", label: "Converted", pill: "bg-green-100 text-green-800 border-green-200",   dot: "bg-green-500"  },
];

// ─── Status cell (inline editable popover) ────────────────────────────────────

function StatusCell({ id, initial }: { id: string; initial: InquiryStatus }) {
  const [status, setStatus] = useState<InquiryStatus>(initial);
  const [open, setOpen] = useState(false);
  const [isPending, start] = useTransition();
  const { toast } = useToast();

  function handleSelect(s: InquiryStatus) {
    setOpen(false);
    if (s === status) return;
    start(async () => {
      try {
        await updateInquiryStatus(id, s);
        setStatus(s);
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Failed to update status",
          description: e instanceof Error ? e.message : "Please try again.",
        });
      }
    });
  }

  const current = STATUS_OPTIONS.find((o) => o.value === status)!;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={isPending}
          className={cn(
            "inline-flex items-center gap-1.5 h-7 rounded-full border px-2.5 text-xs font-semibold transition-opacity disabled:opacity-60",
            current.pill,
          )}
        >
          {isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", current.dot)} />
          }
          {current.label}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-36 p-1.5 space-y-0.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              opt.value === status
                ? cn(opt.pill, "border")
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", opt.dot)} />
            {opt.label}
            {opt.value === status && <Check className="w-3 h-3 ml-auto" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function InquiriesClient({
  inquiries,
  statusFilter,
}: {
  inquiries: Inquiry[];
  statusFilter: InquiryStatus | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const newCount       = inquiries.filter((i) => i.status === "new").length;
  const contactedCount = inquiries.filter((i) => i.status === "contacted").length;
  const convertedCount = inquiries.filter((i) => i.status === "converted").length;

  function handleDeleteConfirmed() {
    if (!confirmId) return;
    const id = confirmId;
    setConfirmId(null);
    setDeletingId(id);
    startDelete(async () => {
      try {
        await deleteInquiry(id);
        router.refresh();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Failed to delete inquiry",
          description: e instanceof Error ? e.message : "Please try again.",
        });
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            Website Inquiries
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Demo requests from the public pricing page.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total",     value: inquiries.length, color: "text-foreground" },
          { label: "New",       value: newCount,          color: "text-yellow-600" },
          { label: "Contacted", value: contactedCount,    color: "text-blue-600"   },
          { label: "Converted", value: convertedCount,    color: "text-green-600"  },
        ].map((s) => (
          <div key={s.label} className="bg-card border rounded-xl p-4">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {[
          { label: "All",       value: null },
          { label: "New",       value: "new"       as InquiryStatus },
          { label: "Contacted", value: "contacted" as InquiryStatus },
          { label: "Converted", value: "converted" as InquiryStatus },
        ].map(({ label, value }) => {
          const isActive = value === statusFilter;
          const href = value ? `/super-admin/inquiries?status=${value}` : "/super-admin/inquiries";
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      {inquiries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border rounded-xl bg-card">
          <ClipboardList className="w-12 h-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold text-foreground">No inquiries found</h3>
          <p className="text-muted-foreground mt-1 text-sm max-w-xs">
            {statusFilter
              ? `No "${STATUS_LABEL[statusFilter]}" inquiries yet.`
              : "No inquiries submitted yet."}
          </p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-x-auto bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Building</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">President</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Flats</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Package</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {inquiries.map((inq) => {
                const phoneHref   = safePhoneHref(inq.phone);
                const waHref      = inq.whatsapp && inq.whatsapp !== inq.phone
                  ? safeWaHref(inq.whatsapp)
                  : null;
                const emailHref   = inq.email ? safeMailtoHref(inq.email) : null;

                return (
                  <tr key={inq.id} className="hover:bg-secondary/20 transition-colors">
                    {/* Date */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(inq.created_at)}
                    </td>

                    {/* Building */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{inq.building_name}</p>
                      {inq.city && <p className="text-xs text-muted-foreground">{inq.city}</p>}
                    </td>

                    {/* President */}
                    <td className="px-4 py-3">
                      <p className="text-foreground">{inq.president_name}</p>
                      {inq.contact_timing && (
                        <p className="text-xs text-muted-foreground">{inq.contact_timing}</p>
                      )}
                    </td>

                    {/* Flats */}
                    <td className="px-4 py-3 font-mono text-foreground">
                      {inq.num_flats}
                    </td>

                    {/* Package */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {PACKAGE_LABEL[inq.package] ?? inq.package}
                    </td>

                    {/* Contact — hrefs only rendered when format is verified safe */}
                    <td className="px-4 py-3">
                      {phoneHref ? (
                        <a href={phoneHref} className="flex items-center gap-1 text-foreground hover:text-primary transition-colors text-xs">
                          <Phone className="w-3 h-3" />
                          {inq.phone}
                        </a>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          {inq.phone}
                        </span>
                      )}
                      {waHref ? (
                        <a
                          href={waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-green-600 transition-colors mt-0.5"
                        >
                          <MessageCircle className="w-3 h-3" />
                          {inq.whatsapp}
                        </a>
                      ) : inq.whatsapp && inq.whatsapp !== inq.phone ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <MessageCircle className="w-3 h-3" />
                          {inq.whatsapp}
                        </span>
                      ) : null}
                      {emailHref ? (
                        <a
                          href={emailHref}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors mt-0.5"
                        >
                          <span className="truncate max-w-[140px]">{inq.email}</span>
                        </a>
                      ) : inq.email ? (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <span className="truncate max-w-[140px]">{inq.email}</span>
                        </span>
                      ) : null}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusCell id={inq.id} initial={inq.status} />
                        <button
                          onClick={() => setConfirmId(inq.id)}
                          disabled={deletingId === inq.id}
                          className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={!!confirmId}
        title="Delete this inquiry?"
        description="This will permanently remove the inquiry. This cannot be undone."
        confirmLabel="Delete"
        loading={!!deletingId}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmId(null)}
      />
    </div>
  );
}
