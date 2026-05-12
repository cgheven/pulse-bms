import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSession();
  if (!s) redirect("/login");
  redirect(ROLE_HOME[s.profile.role]);
}
