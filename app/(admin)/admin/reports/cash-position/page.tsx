import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CashPositionPage() {
  redirect("/admin/reports/day-book");
}
