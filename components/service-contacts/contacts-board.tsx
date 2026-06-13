"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Plus, PhoneCall, Zap, Droplets, Hammer, Paintbrush, Gauge,
  ArrowUpDown, Bug, SprayCan, ShieldCheck, Wind, Layers, Wrench,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContactCard } from "./contact-card";
import { ContactFormDialog } from "./contact-form-dialog";
import { deleteServiceContact } from "@/app/actions/service-contacts";
import { TRADES, TRADE_KEYS, getTrade, type ServiceContact } from "@/lib/trade-contacts";

const TRADE_ICONS: Record<string, React.ElementType> = {
  electrician:    Zap,
  plumber:        Droplets,
  carpenter:      Hammer,
  painter:        Paintbrush,
  generator_tech: Gauge,
  lift_tech:      ArrowUpDown,
  pest_control:   Bug,
  cleaner:        SprayCan,
  security:       ShieldCheck,
  hvac:           Wind,
  mason:          Layers,
  other:          Wrench,
};

interface ContactsBoardProps {
  contacts: ServiceContact[];
  isAdmin?: boolean;
  buildingName?: string;
}

export function ContactsBoard({ contacts, isAdmin, buildingName }: ContactsBoardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceContact | null>(null);
  const [defaultTrade, setDefaultTrade] = useState<string | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [templatesExpanded, setTemplatesExpanded] = useState(contacts.length === 0);

  // Sync when contacts go from 0→1 or 1→0 after server revalidation.
  // useState initialiser only runs at mount; prop changes don't re-init it.
  useEffect(() => {
    setTemplatesExpanded((prev) => (contacts.length === 0 ? true : prev));
  }, [contacts.length]);
  const [pending, startTransition] = useTransition();

  function openAdd(trade?: string) {
    setEditing(null);
    setDefaultTrade(trade);
    setDialogOpen(true);
  }

  function openEdit(contact: ServiceContact) {
    setEditing(contact);
    setDefaultTrade(undefined);
    setDialogOpen(true);
  }

  function handleDelete(id: string) {
    if (!confirm("Remove this contact from the directory?")) return;
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteServiceContact(id);
      } finally {
        setDeletingId(null);
      }
    });
  }

  // Count how many contacts exist per trade key
  const tradeCounts = new Map<string, number>();
  for (const c of contacts) {
    tradeCounts.set(c.trade, (tradeCounts.get(c.trade) ?? 0) + 1);
  }

  const available = contacts.filter((c) => c.is_available);
  const unavailable = contacts.filter((c) => !c.is_available);

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1>Service Contacts</h1>
          {buildingName && (
            <p className="text-muted-foreground mt-1">
              {buildingName} — dedicated tradespeople residents can call directly
            </p>
          )}
        </div>
        {isAdmin && (
          <Button onClick={() => openAdd()} className="shrink-0">
            <Plus className="w-4 h-4 mr-1.5" />
            Add Contact
          </Button>
        )}
      </div>

      {/* ── Quick-add templates (admin only) ── */}
      {isAdmin && (
        <section className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Collapsible header */}
          <button
            type="button"
            onClick={() => setTemplatesExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-semibold text-foreground">Quick Add Templates</span>
              <span className="text-xs text-muted-foreground font-normal">
                — click a trade to add a contact instantly
              </span>
            </div>
            {templatesExpanded
              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>

          {templatesExpanded && (
            <div className="border-t border-border px-5 py-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                {TRADE_KEYS.map((key) => {
                  const trade = TRADES[key];
                  const Icon = TRADE_ICONS[key] ?? Wrench;
                  const count = tradeCounts.get(key) ?? 0;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openAdd(key)}
                      className={cn(
                        "relative flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all",
                        "hover:shadow-md hover:scale-[1.03] active:scale-[0.98]",
                        count > 0
                          ? "border-border bg-secondary/40"
                          : "border-dashed border-border bg-card hover:border-primary/40",
                      )}
                    >
                      {/* Trade icon */}
                      <div
                        className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center",
                          trade.colorBg,
                        )}
                      >
                        <Icon className={cn("w-6 h-6", trade.colorText)} />
                      </div>

                      {/* Trade label */}
                      <span className="text-xs font-semibold text-center text-foreground leading-tight">
                        {trade.label}
                      </span>

                      {/* Count badge or Add indicator */}
                      {count > 0 ? (
                        <span
                          className={cn(
                            "text-[10px] font-medium px-2 py-0.5 rounded-full",
                            trade.colorBg,
                            trade.colorText,
                          )}
                        >
                          {count} added
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          Tap to add
                        </span>
                      )}

                      {/* Plus icon overlay */}
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-3 h-3 text-primary" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Empty state (no contacts at all) ── */}
      {contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <PhoneCall className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            {isAdmin ? "No contacts yet — use a template above!" : "No contacts yet"}
          </h2>
          <p className="text-muted-foreground max-w-xs">
            {isAdmin
              ? "Click any trade card above to add your first contact in seconds."
              : "Your building admin hasn't added any service contacts yet."}
          </p>
        </div>
      )}

      {/* ── Available contacts ── */}
      {available.length > 0 && (
        <section className="space-y-3">
          {unavailable.length > 0 && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
              Available Now
            </h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {available.map((c) => (
              <div
                key={c.id}
                className={deletingId === c.id ? "opacity-40 pointer-events-none" : ""}
              >
                <ContactCard
                  contact={c}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Unavailable contacts ── */}
      {unavailable.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            Currently Unavailable
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-70">
            {unavailable.map((c) => (
              <div
                key={c.id}
                className={deletingId === c.id ? "opacity-40 pointer-events-none" : ""}
              >
                <ContactCard
                  contact={c}
                  isAdmin={isAdmin}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Form dialog (admin only) */}
      {isAdmin && (
        <ContactFormDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          contact={editing}
          defaultTrade={defaultTrade}
        />
      )}
    </>
  );
}
