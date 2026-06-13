import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { InquiriesClient, type Inquiry } from "@/components/super-admin/inquiries-client";

export const dynamic = "force-dynamic";

type InquiryStatus = "new" | "contacted" | "converted";
const VALID_STATUS_FILTERS = ["new", "contacted", "converted"] as const;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireRole(["super_admin"]);
  const supabase = await createClient();
  const sp = await searchParams;

  const statusFilter =
    typeof sp.status === "string" &&
    (VALID_STATUS_FILTERS as readonly string[]).includes(sp.status)
      ? (sp.status as InquiryStatus)
      : null;

  let query = supabase
    .from("bms_website_inquiries")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[InquiriesPage] fetch failed:", error.message);
    return (
      <div className="p-6 text-red-600 bg-red-50 border border-red-200 rounded-lg">
        Failed to load inquiries. Please refresh the page or contact support.
      </div>
    );
  }

  return (
    <InquiriesClient
      inquiries={(data ?? []) as Inquiry[]}
      statusFilter={statusFilter}
    />
  );
}
