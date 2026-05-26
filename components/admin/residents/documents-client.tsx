"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  ImageIcon,
  Trash2,
  Upload,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { friendlyErrorMessage } from "@/lib/toast-error";
import { uploadResidentDocument, deleteResidentDocument } from "@/app/actions/documents";
import { DOC_TYPE_LABELS } from "@/lib/document-types";
import { formatDate } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  doc_type: string;
  label: string | null;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  href: string; // /api/docs/{id} — proxy route, never exposes Supabase URL
};

function formatBytes(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("image/"))
    return <ImageIcon className="w-4 h-4 text-blue-500" />;
  return <FileText className="w-4 h-4 text-red-500" />;
}

function DeleteButton({ docId }: { docId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        title="Delete"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-destructive font-medium">Delete?</span>
      <button
        onClick={() => {
          start(async () => {
            try {
              await deleteResidentDocument(docId);
              toast({ title: "Document deleted" });
              router.refresh();
            } catch (err) {
              setConfirm(false);
              toast({
                title: "Could not delete",
                description: friendlyErrorMessage(err, "Delete failed"),
                variant: "destructive",
              });
            }
          });
        }}
        disabled={pending}
        className="px-2 py-0.5 rounded text-[11px] font-medium bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
      >
        {pending ? "..." : "Yes"}
      </button>
      <button
        onClick={() => setConfirm(false)}
        className="px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-foreground hover:bg-secondary/80"
      >
        No
      </button>
    </div>
  );
}

function UploadForm({ residentId }: { residentId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [docType, setDocType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setDocType("");
    setFile(null);
    setLabel("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !docType) return;
    const fd = new FormData();
    fd.append("resident_id", residentId);
    fd.append("doc_type", docType);
    fd.append("file", file);
    if (docType === "other" && label) fd.append("label", label);

    start(async () => {
      try {
        await uploadResidentDocument(fd);
        toast({ title: "Document uploaded" });
        reset();
        router.refresh();
      } catch (err) {
        toast({
          title: "Upload failed",
          description: friendlyErrorMessage(err, "Could not upload document"),
          variant: "destructive",
        });
      }
    });
  }

  const canSubmit = !!file && !!docType && (docType !== "other" || !!label.trim());

  return (
    <form onSubmit={submit} className="rounded-lg border border-dashed border-border bg-secondary/30 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Upload document
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="doc-type" className="text-sm mb-1 block">
            Document type
          </Label>
          <Select value={docType} onValueChange={setDocType}>
            <SelectTrigger id="doc-type" className="h-11">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DOC_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="doc-file" className="text-sm mb-1 block">
            File <span className="text-muted-foreground font-normal">(PDF, JPG, PNG — max 10 MB)</span>
          </Label>
          <Input
            ref={fileRef}
            id="doc-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="h-11 cursor-pointer"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      {docType === "other" && (
        <div>
          <Label htmlFor="doc-label" className="text-sm mb-1 block">
            Document label
          </Label>
          <Input
            id="doc-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. NOC Letter, Employment Proof"
            className="h-11"
            maxLength={80}
          />
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={pending || !canSubmit}
          className="btn-big gap-2"
        >
          <Upload className="w-4 h-4" />
          {pending ? "Uploading..." : "Upload"}
        </Button>
      </div>
    </form>
  );
}

export function DocumentsClient({
  residentId,
  docs,
}: {
  residentId: string;
  docs: DocumentRow[];
}) {
  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          No documents uploaded yet.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">File</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Uploaded</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <DocIcon mimeType={d.mime_type} />
                      <div>
                        <div className="font-medium text-sm">
                          {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                        </div>
                        {d.label && (
                          <div className="text-[11px] text-muted-foreground">{d.label}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">
                    {d.file_name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatBytes(d.file_size)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <a
                        href={d.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Open / Download"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                      <DeleteButton docId={d.id} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UploadForm residentId={residentId} />
    </div>
  );
}
