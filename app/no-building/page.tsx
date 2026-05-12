import Link from "next/link";
import { Building2 } from "lucide-react";
import { SignOutButton } from "@/components/layout/sign-out-button";

export default function NoBuildingPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-secondary p-4">
      <div className="card-soft max-w-md w-full text-center">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mx-auto mb-4">
          <Building2 className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold mb-2">No building assigned</h1>
        <p className="text-base text-muted-foreground mb-6">
          Your account is not linked to any building yet. Please ask your building admin to add you.
        </p>
        <SignOutButton />
      </div>
    </div>
  );
}
