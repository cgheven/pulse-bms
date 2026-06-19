import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MaintenanceCollectionPage() {
  redirect("/admin/reports/overall-collection");
}
