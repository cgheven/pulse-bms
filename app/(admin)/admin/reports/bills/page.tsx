import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function BillsReportPage() {
  redirect("/admin/reports/spending?type=bills");
}
