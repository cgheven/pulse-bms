"use client";

import { useTransition, useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { updateInquiryStatus, deleteInquiry } from "@/app/actions/website-inquiry";

type InquiryStatus = "new" | "contacted" | "converted";

interface InquiryRowActionsProps {
  id: string;
  currentStatus: InquiryStatus;
}

export function InquiryRowActions({ id, currentStatus }: InquiryRowActionsProps) {
  const [isPendingStatus, startStatusTransition] = useTransition();
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<InquiryStatus>(currentStatus);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function handleStatusChange(newStatus: InquiryStatus) {
    if (newStatus === localStatus) return;
    setErrorMsg(null);
    startStatusTransition(async () => {
      try {
        await updateInquiryStatus(id, newStatus);
        setLocalStatus(newStatus);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to update status");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this inquiry? This cannot be undone.")) return;
    setErrorMsg(null);
    startDeleteTransition(async () => {
      try {
        await deleteInquiry(id);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to delete");
      }
    });
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <select
        value={localStatus}
        onChange={(e) => handleStatusChange(e.target.value as InquiryStatus)}
        disabled={isPendingStatus || isPendingDelete}
        className="h-8 text-xs rounded-md border border-gray-300 bg-white px-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
        aria-label="Change inquiry status"
      >
        <option value="new">New</option>
        <option value="contacted">Contacted</option>
        <option value="converted">Converted</option>
      </select>

      {isPendingStatus && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0" />}

      <button
        onClick={handleDelete}
        disabled={isPendingDelete || isPendingStatus}
        className="flex items-center justify-center w-8 h-8 rounded-md text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
        aria-label="Delete inquiry"
      >
        {isPendingDelete ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Trash2 className="w-3.5 h-3.5" />
        )}
      </button>

      {errorMsg && (
        <span className="text-xs text-red-600 max-w-[120px] truncate" title={errorMsg}>
          {errorMsg}
        </span>
      )}
    </div>
  );
}
