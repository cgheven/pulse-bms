"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toIntlNoPlus } from "@/lib/phone";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  upsertMyService,
  deactivateService,
  type ServiceCard,
} from "@/app/actions/services";
import {
  SERVICE_CATEGORIES,
  type ServiceCategory,
} from "@/lib/service-categories";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Sparkles,
  Wrench,
  UtensilsCrossed,
  Hammer,
  GraduationCap,
  Scissors,
  Bike,
  PawPrint,
} from "lucide-react";

const CATEGORY_META: Record<
  ServiceCategory,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  tech_repair:     { label: "Tech & Repair",     icon: Wrench,          color: "text-[hsl(210_90%_70%)]" },
  food_cooking:    { label: "Food & Cooking",    icon: UtensilsCrossed, color: "text-[hsl(38_92%_65%)]" },
  home_services:   { label: "Home Services",     icon: Hammer,          color: "text-[hsl(151_70%_55%)]" },
  tutoring:        { label: "Tutoring",          icon: GraduationCap,   color: "text-[hsl(280_70%_70%)]" },
  beauty_wellness: { label: "Beauty & Wellness", icon: Scissors,        color: "text-[hsl(330_80%_70%)]" },
  transport:       { label: "Transport",         icon: Bike,            color: "text-[hsl(190_80%_65%)]" },
  pets:            { label: "Pets",              icon: PawPrint,        color: "text-[hsl(20_80%_65%)]" },
  other:           { label: "Other",             icon: Sparkles,        color: "text-muted-foreground" },
};

const ALL_CATS = SERVICE_CATEGORIES;

/* ──────────────────────────────────────────────────────────────────────────
 * Top-level panel. Owns:
 *   - which tab is active
 *   - the unified "publish/edit" dialog state (a single dialog used for both
 *     "create" and "edit" flows so the user never has to switch tabs)
 * ────────────────────────────────────────────────────────────────────────── */

type DialogState =
  | { kind: "closed" }
  | { kind: "create"; presetCategory: ServiceCategory | null }
  | { kind: "edit"; service: ServiceCard };

export function ServicesPanel({
  buildingName,
  myUserId,
  services,
}: {
  buildingName: string;
  myUserId: string;
  services: ServiceCard[];
}) {
  const mine = useMemo(
    () => services.filter((s) => s.profile_id === myUserId),
    [services, myUserId],
  );
  const others = useMemo(
    () => services.filter((s) => s.profile_id !== myUserId),
    [services, myUserId],
  );

  const [dialog, setDialog] = useState<DialogState>({ kind: "closed" });
  const openCreate = (presetCategory: ServiceCategory | null = null) =>
    setDialog({ kind: "create", presetCategory });
  const openEdit = (service: ServiceCard) =>
    setDialog({ kind: "edit", service });
  const closeDialog = () => setDialog({ kind: "closed" });

  return (
    <>
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1>Building Services</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Neighbors offering skills, food, and help in {buildingName}.
          </p>
        </div>
        {/* Always-visible publish CTA — one click from anywhere on the page */}
        <Button size="sm" onClick={() => openCreate()}>
          <Plus className="w-3.5 h-3.5" />
          Publish a service
        </Button>
      </header>

      <Tabs defaultValue="browse">
        <TabsList>
          <TabsTrigger value="browse">
            Browse
            <span className="ml-1.5 tabular-nums text-[10px] px-1.5 rounded-full bg-secondary">
              {others.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="mine">
            My Services
            <span className="ml-1.5 tabular-nums text-[10px] px-1.5 rounded-full bg-secondary">
              {mine.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-3">
          <BrowseTab
            buildingName={buildingName}
            services={others}
            onPublish={(cat) => openCreate(cat)}
          />
        </TabsContent>

        <TabsContent value="mine" className="mt-3">
          <MyServicesTab
            mine={mine}
            onPublish={() => openCreate()}
            onEdit={openEdit}
          />
        </TabsContent>
      </Tabs>

      {/* Unified create/edit dialog — same form, two entry paths */}
      <ServiceDialog state={dialog} onClose={closeDialog} />
    </>
  );
}

/* ─────────────  Browse  ───────────── */

function BrowseTab({
  buildingName,
  services,
  onPublish,
}: {
  buildingName: string;
  services: ServiceCard[];
  onPublish: (cat: ServiceCategory | null) => void;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<ServiceCategory | "all">("all");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return services.filter((sv) => {
      if (cat !== "all" && sv.category !== cat) return false;
      if (!s) return true;
      return (
        sv.title.toLowerCase().includes(s) ||
        (sv.description ?? "").toLowerCase().includes(s) ||
        (sv.seller_name ?? "").toLowerCase().includes(s) ||
        (sv.flat_number ?? "").toLowerCase().includes(s)
      );
    });
  }, [services, q, cat]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search service, neighbor, or flat…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 pl-9 text-sm"
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {filtered.length} of {services.length}
        </span>
      </div>

      {/* Category filter pills — horizontal scroll-snap so they stay one line on 360px */}
      <div className="-mx-4 sm:mx-0 px-4 sm:px-0 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-1.5 min-w-min snap-x snap-mandatory">
          <CatPill
            active={cat === "all"}
            onClick={() => setCat("all")}
            label="All"
          />
          {ALL_CATS.map((c) => {
            const meta = CATEGORY_META[c];
            const Icon = meta.icon;
            return (
              <CatPill
                key={c}
                active={cat === c}
                onClick={() => setCat(c)}
                label={meta.label}
                icon={<Icon className={cn("w-3 h-3", cat === c ? "" : meta.color)} />}
              />
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">
            {services.length === 0
              ? "No services yet — be the first to publish."
              : cat !== "all"
                ? `No ${CATEGORY_META[cat].label.toLowerCase()} services yet.`
                : "Nothing matches this search."}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {cat !== "all"
              ? `Offer ${CATEGORY_META[cat].label.toLowerCase()} to neighbors — they'll message you directly on WhatsApp.`
              : "Add your own skill — laptop repair, tutoring, home-cooked food. Neighbors message you on WhatsApp directly."}
          </p>
          <Button
            size="sm"
            onClick={() => onPublish(cat === "all" ? null : cat)}
          >
            <Plus className="w-3.5 h-3.5" />
            {cat === "all"
              ? "Publish your skill"
              : `Publish a ${CATEGORY_META[cat].label} service`}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <ServiceCardView
              key={s.id}
              service={s}
              buildingName={buildingName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CatPill({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors shrink-0 snap-start whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ServiceCardView({
  service,
  buildingName,
}: {
  service: ServiceCard;
  buildingName: string;
}) {
  const meta = CATEGORY_META[service.category];
  const Icon = meta.icon;
  const intl = service.seller_phone ? toIntlNoPlus(service.seller_phone) : null;

  const waMessage = `Assalam Alaikum ${service.seller_name},

I saw your "${service.title}" service on the ${buildingName} residents page.

Could you share more details and pricing?`;
  const waUrl = intl
    ? `https://wa.me/${intl}?text=${encodeURIComponent(waMessage)}`
    : null;

  return (
    <article className="rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors flex flex-col">
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/60 border border-border text-[10px] font-medium uppercase tracking-wider",
              meta.color,
            )}
          >
            <Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </div>

        <h3 className="text-base font-semibold tracking-tight line-clamp-2">
          {service.title}
        </h3>

        {service.description && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {service.description}
          </p>
        )}

        <div className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-foreground">
            {service.seller_name}
          </span>
          {service.flat_number && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">Flat {service.flat_number}</span>
            </>
          )}
        </div>

        {service.price_note && (
          <div className="mt-2 flex w-fit max-w-full items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25 text-[11px] text-primary">
            <Tag className="w-3 h-3 shrink-0" />
            <span className="truncate">{service.price_note}</span>
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 h-9 rounded-lg",
              "bg-[#25D366] text-white hover:bg-[#1da851] transition-colors shadow-sm",
              "text-sm font-semibold",
            )}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            Message on WhatsApp
          </a>
        ) : (
          <button
            disabled
            className="w-full h-9 rounded-lg border border-border bg-secondary/30 text-xs text-muted-foreground"
          >
            No contact number yet
          </button>
        )}
      </div>
    </article>
  );
}

/* ─────────────  My Services  ───────────── */

function MyServicesTab({
  mine,
  onPublish,
  onEdit,
}: {
  mine: ServiceCard[];
  onPublish: () => void;
  onEdit: (s: ServiceCard) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Publish a service to help your neighbors find you.
        </p>
        <Button onClick={onPublish} size="sm">
          <Plus className="w-3.5 h-3.5" />
          New service
        </Button>
      </div>

      {mine.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">You haven&rsquo;t listed anything yet.</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Click <span className="text-foreground font-medium">New service</span> —
            takes under a minute.
          </p>
          <Button size="sm" onClick={onPublish}>
            <Plus className="w-3.5 h-3.5" />
            Publish your first service
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mine.map((s) => (
            <MyServiceCard key={s.id} service={s} onEdit={() => onEdit(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MyServiceCard({
  service,
  onEdit,
}: {
  service: ServiceCard;
  onEdit: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const meta = CATEGORY_META[service.category];
  const Icon = meta.icon;

  function handleRemove() {
    start(async () => {
      try {
        await deactivateService(service.id);
        toast({ title: "Service removed" });
        setConfirming(false);
        router.refresh();
      } catch (err) {
        toast({
          title: "Could not remove",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <article className="rounded-lg border border-primary/30 bg-card p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/60 border border-border text-[10px] font-medium uppercase tracking-wider",
            meta.color,
          )}
        >
          <Icon className="w-3 h-3" />
          {meta.label}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onEdit}>
            <Pencil className="w-3 h-3" />
            Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="w-3 h-3" />
            Remove
          </Button>
        </div>
      </div>
      <h3 className="text-base font-semibold tracking-tight">{service.title}</h3>
      {service.description && (
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {service.description}
        </p>
      )}
      {service.price_note && (
        <div className="mt-2 flex w-fit max-w-full items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 border border-primary/25 text-[11px] text-primary">
          <Tag className="w-3 h-3 shrink-0" />
          <span className="truncate">{service.price_note}</span>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Remove "${service.title}"?`}
        description="It disappears from the residents page immediately. You can publish again any time."
        confirmLabel={pending ? "Removing…" : "Remove"}
        loading={pending}
        onConfirm={handleRemove}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}

/* ─────────────  Unified Publish/Edit Dialog  ─────────────
 * One Dialog for both create and edit. Mounted by the panel at the top level
 * — every "publish" button (header, browse empty-state, my-services empty-
 * state, +New service, Edit on card) just calls `setDialog(...)`. No tab
 * gymnastics, no setState-in-render hazards.
 * ──────────────────────────────────────────────────────── */

function ServiceDialog({
  state,
  onClose,
}: {
  state: DialogState;
  onClose: () => void;
}) {
  const open = state.kind !== "closed";
  const initial = state.kind === "edit" ? state.service : null;
  const presetCategory =
    state.kind === "create" ? state.presetCategory : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Edit "${initial.title}"` : "Publish a service"}
          </DialogTitle>
          <DialogDescription>
            {initial
              ? "Update what you offer. Neighbors message you on WhatsApp."
              : "Tell neighbors what you offer. They'll WhatsApp you directly."}
          </DialogDescription>
        </DialogHeader>
        {/* `key` forces fresh state when switching between create and a
            specific edit target. */}
        <ServiceForm
          key={initial?.id ?? `new-${presetCategory ?? "any"}`}
          initial={initial}
          presetCategory={presetCategory}
          onCancel={onClose}
          onSaved={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  initial,
  presetCategory,
  onCancel,
  onSaved,
}: {
  initial: ServiceCard | null;
  presetCategory: ServiceCategory | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<ServiceCategory>(
    initial?.category ?? presetCategory ?? "other",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceNote, setPriceNote] = useState(initial?.price_note ?? "");
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      toast({ title: "Title is too short", variant: "destructive" });
      return;
    }
    start(async () => {
      try {
        await upsertMyService({
          id: initial?.id,
          title: trimmedTitle,
          category,
          description: description.trim() || null,
          price_note: priceNote.trim() || null,
        });
        toast({
          title: initial ? "Service updated" : "Service published",
        });
        router.refresh();
        onSaved();
      } catch (err) {
        toast({
          title: "Could not save",
          description: friendlyErrorMessage(err),
          variant: "destructive",
        });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>What are you offering?</Label>
        <Input
          placeholder="e.g. Laptop repair and Windows install"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          className="h-11 text-base"
          autoFocus
          required
        />
        {title.length >= 80 && (
          <div className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">
            {title.length} / 100
          </div>
        )}
      </div>

      <div>
        <Label>Category</Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as ServiceCategory)}
        >
          <SelectTrigger className="h-11 text-base">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ALL_CATS.map((c) => {
              const m = CATEGORY_META[c];
              return (
                <SelectItem key={c} value={c}>
                  {m.label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Pricing note (optional)</Label>
        <Input
          placeholder="e.g. Starting Rs 500 · Negotiable · Rs 1500/hr"
          value={priceNote}
          onChange={(e) => setPriceNote(e.target.value)}
          maxLength={80}
          className="h-11 text-base"
        />
      </div>

      <div>
        <Label>Description (optional)</Label>
        <Textarea
          placeholder="A short note so neighbors know what you offer."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={3}
        />
        {description.length >= 300 && (
          <div className="text-[10px] text-muted-foreground text-right mt-1 tabular-nums">
            {description.length} / 500
          </div>
        )}
      </div>

      <DialogFooter className="pt-1">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Update" : "Publish"}
        </Button>
      </DialogFooter>
    </form>
  );
}
