"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import {
  addCustomUtilityType,
  deleteCustomUtilityType,
  type UtilityType,
} from "@/app/actions/utilities";

interface Props {
  types: UtilityType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageTypesDialog({ types, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const router = useRouter();

  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeCode, setNewTypeCode] = useState("");
  const [isAdding, startAddTransition] = useTransition();

  const [deleteTarget, setDeleteTarget] = useState<UtilityType | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const systemTypes = types.filter((t) => t.is_system);
  const customTypes = types.filter((t) => !t.is_system);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newTypeName.trim();
    if (!name) return;

    startAddTransition(async () => {
      try {
        await addCustomUtilityType(name, newTypeCode.trim() || undefined);
        toast({ title: "Type Added", description: `"${name}" has been added.` });
        setNewTypeName("");
        setNewTypeCode("");
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err, "Could not add utility type. Please try again."),
          variant: "destructive",
        });
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startDeleteTransition(async () => {
      try {
        await deleteCustomUtilityType(target.id);
        toast({ title: "Deleted", description: `"${target.name}" has been removed.` });
        setDeleteTarget(null);
        router.refresh();
      } catch (err) {
        toast({
          title: "Error",
          description: friendlyErrorMessage(err, "Could not delete utility type. Please try again."),
          variant: "destructive",
        });
        setDeleteTarget(null);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">Manage Utility Types</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* System Types */}
            <div>
              <h3 className="text-base font-semibold mb-2">System Types</h3>
              <div className="space-y-1">
                {systemTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No system types.</p>
                )}
                {systemTypes.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary"
                  >
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-base">
                        {t.name}
                        {t.code && (
                          <span className="ml-1 text-sm text-muted-foreground">
                            ({t.code})
                          </span>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Cannot be removed
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Types */}
            <div>
              <h3 className="text-base font-semibold mb-2">Custom Types</h3>
              {customTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground mb-3">
                  No custom types yet.
                </p>
              ) : (
                <div className="space-y-1 mb-3">
                  {customTypes.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-card"
                    >
                      <span className="text-base">
                        {t.name}
                        {t.code && (
                          <span className="ml-1 text-sm text-muted-foreground">
                            ({t.code})
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => setDeleteTarget(t)}
                        className="h-14 w-14 flex items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete type"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Custom Type Form */}
              <form onSubmit={handleAdd} className="space-y-3">
                <Label className="text-base">Add Custom Type</Label>
                <div className="flex gap-2">
                  <Input
                    required
                    disabled={isAdding}
                    value={newTypeName}
                    onChange={(e) => setNewTypeName(e.target.value)}
                    placeholder="Type name (e.g. Solar)"
                    className="h-12 text-base flex-1"
                  />
                  <Input
                    disabled={isAdding}
                    value={newTypeCode}
                    onChange={(e) => setNewTypeCode(e.target.value)}
                    placeholder="Code"
                    className="h-12 text-base w-28"
                  />
                  <Button
                    type="submit"
                    disabled={isAdding || !newTypeName.trim()}
                    className="btn-big shrink-0"
                  >
                    {isAdding ? "Adding..." : "Add"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Utility Type"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone. You must remove all accounts using this type first.`
            : "This cannot be undone."
        }
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
