import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ROLE_HOME } from "@/types";
import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export default async function Home() {
  const s = await getSession();
  if (s) redirect(ROLE_HOME[s.profile.role]);
  return <LandingPage />;
}
