import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type Role } from "@/types";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("bms_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  redirect(ROLE_HOME[(profile?.role ?? "resident") as Role]);
}
