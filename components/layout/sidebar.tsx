"use client";
import { memo, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  X,
  Building2,
  Home,
  Receipt,
  ClipboardList,
  UserCog,
  Wallet,
  Wrench,
  Megaphone,
  Vote,
  CalendarDays,
  Shield,
  ScrollText,
  LineChart,
  MessageSquareWarning,
  Eye,
  Settings,
  Tag,
  Sparkles,
  Car,
  Coins,
  HandCoins,
  FileSpreadsheet,
  Plug,
  Target,
  FolderOpen,
  CalendarCheck,
  Archive,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavGroup = { label: string; items: NavItem[] };

const NAV_BY_ROLE: Record<Role, NavGroup[]> = {
  super_admin: [
    {
      label: "Overview",
      items: [
        { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/super-admin/buildings", label: "Buildings",    icon: Building2 },
        { href: "/super-admin/admins",    label: "Admins",       icon: Shield },
        { href: "/super-admin/teams",     label: "Team Members", icon: Users },
        { href: "/super-admin/leads",     label: "Leads",        icon: Target },
        { href: "/super-admin/audit",     label: "Audit Log",    icon: ScrollText },
      ],
    },
  ],
  // Sales-team members see ONLY the Leads CRM. Every other route under
  // /super-admin/* will redirect them back here via requireRole().
  sales: [
    {
      label: "Sales CRM",
      items: [
        { href: "/super-admin/leads", label: "Leads", icon: Target },
      ],
    },
  ],
  admin: [
    {
      label: "Overview",
      items: [
        { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      ],
    },
    {
      label: "Building",
      items: [
        { href: "/admin/flats",     label: "Flats",     icon: Home },
        { href: "/admin/residents", label: "Residents", icon: Users },
        { href: "/admin/vehicles",  label: "Vehicles",  icon: Car },
      ],
    },
    {
      label: "Finance",
      items: [
        { href: "/admin/maintenance",  label: "Maintenance",  icon: Receipt },
        { href: "/admin/other-income", label: "Other Income", icon: Coins },
        { href: "/admin/projects",     label: "Projects",     icon: Sparkles },
        { href: "/admin/bill-accounts",label: "Bill Accounts",icon: Plug },
        { href: "/admin/expenses",     label: "Expenses",     icon: Wallet },
        { href: "/admin/reports",      label: "Reports",      icon: FileSpreadsheet },
      ],
    },
    {
      label: "Settings",
      items: [
        { href: "/admin/settings", label: "Settings", icon: Settings },
      ],
    },
    {
      label: "People",
      items: [
        { href: "/admin/staff", label: "Staff", icon: UserCog },
        { href: "/admin/union", label: "Union", icon: Vote },
      ],
    },
    {
      label: "Operations",
      items: [
        { href: "/admin/facility",   label: "Facility",   icon: Wrench },
        { href: "/admin/notices",    label: "Notices",    icon: Megaphone },
        { href: "/admin/inventory",  label: "Inventory",  icon: Archive },
        { href: "/admin/utilities",  label: "Utilities",  icon: Zap },
      ],
    },
  ],
  union: [
    {
      label: "Overview",
      items: [
        { href: "/union", label: "Dashboard", icon: LayoutDashboard },
        { href: "/union/collections", label: "Collections", icon: HandCoins },
        { href: "/union/projects", label: "Projects", icon: Sparkles },
        { href: "/admin/reports", label: "Reports", icon: FileSpreadsheet },
      ],
    },
    {
      label: "Decisions",
      items: [
        { href: "/union/proposals", label: "Proposals", icon: Vote },
        { href: "/union/meetings",  label: "Meetings",  icon: CalendarDays },
      ],
    },
    {
      label: "Building",
      items: [
        { href: "/union/staff",    label: "Staff",    icon: UserCog },
        { href: "/union/expenses", label: "Expenses", icon: Receipt },
        { href: "/union/facility", label: "Facility", icon: Wrench },
        { href: "/union/vehicles", label: "Vehicles", icon: Car },
      ],
    },
    {
      label: "Communication",
      items: [
        { href: "/union/notices", label: "Notices", icon: Megaphone },
      ],
    },
    {
      label: "Configuration",
      items: [
        { href: "/union/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
  resident: [
    {
      label: "Overview",
      items: [
        { href: "/resident", label: "Home", icon: Home },
      ],
    },
    {
      label: "Marketplace",
      items: [
        { href: "/resident/services", label: "Services", icon: Sparkles },
        { href: "/resident/listings", label: "Flat Listings", icon: Tag },
      ],
    },
    {
      label: "My Account",
      items: [
        { href: "/resident/dues",       label: "Dues",       icon: Wallet },
        { href: "/resident/payments",   label: "Payments",   icon: CreditCard },
        { href: "/resident/vehicles",   label: "Vehicles",   icon: Car },
        { href: "/resident/visitors",   label: "Visitors",   icon: CalendarCheck },
        { href: "/resident/complaints",   label: "Complaints",  icon: MessageSquareWarning },
        { href: "/resident/bill-numbers", label: "Bill Numbers", icon: Zap },
        { href: "/resident/documents",    label: "Documents",    icon: FolderOpen },
      ],
    },
    {
      label: "Building",
      items: [
        { href: "/resident/projects",     label: "Projects",     icon: Sparkles },
        { href: "/resident/transparency", label: "Transparency", icon: Eye },
        { href: "/resident/notices",      label: "Notices",      icon: Megaphone },
      ],
    },
  ],
  guard: [
    {
      label: "Security",
      items: [
        { href: "/guard", label: "Vehicle Lookup", icon: Car },
      ],
    },
  ],
};

const ROLE_HOME: Record<Role, string> = {
  super_admin: "/super-admin",
  admin:       "/admin",
  union:       "/union",
  resident:    "/resident",
  sales:       "/super-admin/leads",
  guard:       "/guard",
};

interface NavLinkProps {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
  onClose: () => void;
  isHome: boolean;
}

const NavLink = memo(function NavLink({
  href,
  label,
  icon: Icon,
  pathname,
  onClose,
  isHome,
}: NavLinkProps) {
  // Home/dashboard routes only match exactly; nested routes match by prefix.
  const active = isHome ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onClose}
      prefetch={true}
      className={cn(
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
        active
          ? "bg-sidebar-accent/10 text-primary"
          : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-primary" />
      )}
      <Icon
        className={cn(
          "w-4 h-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span>{label}</span>
    </Link>
  );
});

interface SidebarProps {
  role: Role;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ role, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const home = ROLE_HOME[role];

  const groups = useMemo(() => NAV_BY_ROLE[role] ?? [], [role]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between px-4 h-16 border-b border-sidebar-border">
          <Link
            href={home}
            className="flex items-center gap-2.5 group"
            onClick={onClose}
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/15 border border-primary/25 transition-all group-hover:bg-primary/20">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-foreground font-bold text-base tracking-tight leading-none">
                Pulse
              </p>
              <p className="text-primary/60 text-[10px] mt-1 font-semibold tracking-[0.15em] uppercase">
                Pulse of your Building
              </p>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-4 scrollbar-hide">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest px-3 mb-1.5">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.href}
                    {...item}
                    pathname={pathname}
                    onClose={onClose}
                    isHome={item.href === home}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-2 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            <p className="text-xs text-muted-foreground">Pulse is online</p>
          </div>
        </div>
      </aside>
    </>
  );
}
