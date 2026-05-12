"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

export function AuditFilters({
  buildings,
  entities,
}: {
  buildings: { id: string; name: string }[];
  entities: string[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(form: HTMLFormElement) {
    const data = new FormData(form);
    const sp = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      const value = String(v).trim();
      if (value && value !== ALL) sp.set(k, value);
    }
    startTransition(() => {
      router.push(`/super-admin/audit${sp.toString() ? `?${sp.toString()}` : ""}`);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    update(e.currentTarget);
  }

  function clear() {
    startTransition(() => router.push("/super-admin/audit"));
  }

  const buildingId = params.get("building") || ALL;
  const entity = params.get("entity") || ALL;
  const actor = params.get("actor") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  return (
    <form onSubmit={onSubmit} className="card-soft space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="building" className="text-sm">Building</Label>
          <Select name="building" defaultValue={buildingId} key={`b-${buildingId}`}>
            <SelectTrigger id="building" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All buildings</SelectItem>
              {buildings.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="entity" className="text-sm">Entity</Label>
          <Select name="entity" defaultValue={entity} key={`e-${entity}`}>
            <SelectTrigger id="entity" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All entities</SelectItem>
              {entities.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="actor" className="text-sm">Actor email</Label>
          <Input
            id="actor"
            name="actor"
            defaultValue={actor}
            placeholder="search by email"
            className="h-11"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-sm">From</Label>
          <Input id="from" name="from" type="date" defaultValue={from} className="h-11" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-sm">To</Label>
          <Input id="to" name="to" type="date" defaultValue={to} className="h-11" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button type="button" variant="outline" onClick={clear} disabled={isPending}>
          Clear
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Filtering..." : "Apply Filters"}
        </Button>
      </div>
    </form>
  );
}
