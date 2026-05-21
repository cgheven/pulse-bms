import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * /admin/reports no longer renders a card hub — tabs sit at the top of each
 * report page instead. Land users directly on the Expenses tab; switching to
 * the other four is one click via the tab strip.
 */
export default function ReportsIndex() {
  // Income Register is the default landing — what committee wants to see
  // first when they open Reports: "what came in this month?"
  redirect("/admin/reports/overall-collection");
}
