"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={handleSignOut} className="gap-2">
      <LogOut className="w-4 h-4" />
      <span className="hidden sm:inline">Sign out</span>
    </Button>
  );
}
