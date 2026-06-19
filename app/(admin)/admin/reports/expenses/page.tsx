import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function ExpensesReportPage() {
  redirect("/admin/reports/spending");
}
