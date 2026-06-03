import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUtilityTypes } from "@/app/actions/utilities";
import { BillNumbersClient } from "@/components/resident/bill-numbers-client";

export const dynamic = "force-dynamic";

export default async function ResidentBillNumbersPage() {
  const { user } = await requireRole("resident");
  const supabase = await createClient();

  // Resolve the resident's active flat
  const { data: residentRow } = await supabase
    .from("bms_residents")
    .select("flat_id, building_id, bms_flats(flat_number)")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!residentRow) {
    return (
      <div className="space-y-5 animate-fade-up max-w-3xl">
        <header>
          <h1>My Utility Bill Numbers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Share your utility account numbers with building management.
          </p>
        </header>
        <div className="card-soft text-center py-10">
          <p className="text-base font-medium text-foreground">
            No active flat found.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Contact your building admin to get set up.
          </p>
        </div>
      </div>
    );
  }

  type FlatBasic = { flat_number: string };
  const flat = (
    Array.isArray(residentRow.bms_flats)
      ? residentRow.bms_flats[0]
      : residentRow.bms_flats
  ) as FlatBasic | null;

  const flatNumber = flat?.flat_number ?? "Your Flat";

  // Fetch utility types for the building
  const types = await getUtilityTypes(residentRow.building_id as string);

  // Fetch existing utility accounts for this flat
  // Defense-in-depth: filter by both flat_id AND building_id (do not rely solely on RLS)
  const { data: accounts } = await supabase
    .from("bms_utility_accounts")
    .select(
      "id, utility_type_id, account_number, account_holder_name, notes, submitted_by_resident, is_verified",
    )
    .eq("flat_id", residentRow.flat_id as string)
    .eq("building_id", residentRow.building_id as string)
    .eq("is_active", true);

  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <header>
        <h1>My Utility Bill Numbers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Flat {flatNumber} — add or update your account numbers below.
        </p>
      </header>

      <BillNumbersClient
        types={types}
        existingAccounts={(accounts ?? []) as {
          id: string;
          utility_type_id: string;
          account_number: string;
          account_holder_name: string | null;
          notes: string | null;
          submitted_by_resident: boolean;
          is_verified: boolean;
        }[]}
        flatNumber={flatNumber}
      />
    </div>
  );
}
