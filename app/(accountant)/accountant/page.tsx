import Link from "next/link";
import { CreditCard, FileSpreadsheet } from "lucide-react";
import { requireRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AccountantPage() {
  await requireRole("accountant");

  return (
    <div className="space-y-6 animate-fade-up max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Select an action below to get started.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Record Payment */}
        <Link
          href="/admin/maintenance?tab=payments"
          className="card-soft flex flex-col gap-4 p-6 hover:shadow-md transition-shadow group min-h-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xl font-semibold text-foreground leading-tight">
              Record Payment
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Log a maintenance fee or other payment received from a resident.
            </p>
          </div>
        </Link>

        {/* View Reports */}
        <Link
          href="/admin/reports"
          className="card-soft flex flex-col gap-4 p-6 hover:shadow-md transition-shadow group min-h-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
        >
          <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xl font-semibold text-foreground leading-tight">
              View Reports
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Review income, expenses, and financial summaries for the building.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
