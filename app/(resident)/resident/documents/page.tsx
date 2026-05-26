import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TableSkeleton } from "@/components/layout/table-skeleton";
import { DOC_TYPE_LABELS } from "@/lib/document-types";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  ImageIcon,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default function ResidentDocumentsPage() {
  return (
    <div className="space-y-5 animate-fade-up max-w-3xl">
      <header>
        <h1>My Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Documents uploaded by building management for your record.
        </p>
      </header>
      <Suspense fallback={<TableSkeleton rows={3} />}>
        <DocumentsList />
      </Suspense>
    </div>
  );
}

async function DocumentsList() {
  const { profile } = await requireRole("resident");
  if (!profile.building_id) {
    return (
      <div className="card-soft text-sm text-muted-foreground">
        No building assigned to your account.
      </div>
    );
  }

  const supabase = await createClient();

  // Find resident record(s) linked to this auth user
  const { data: myResidents } = await supabase
    .from("bms_residents")
    .select("id")
    .eq("profile_id", profile.id)
    .eq("building_id", profile.building_id);

  const residentIds = (myResidents ?? []).map((r) => r.id);

  if (residentIds.length === 0) {
    return (
      <div className="card-soft text-sm text-muted-foreground flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 shrink-0" />
        No resident record found. Contact your building admin.
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("bms_resident_documents")
    .select("id, doc_type, label, file_name, file_size, mime_type, created_at")
    .in("resident_id", residentIds)
    .order("created_at", { ascending: false });

  if (!rows || rows.length === 0) {
    return (
      <div className="card-soft text-sm text-muted-foreground flex items-center gap-2">
        <FileText className="w-4 h-4 shrink-0" />
        No documents uploaded yet. Your building admin will add them here.
      </div>
    );
  }

  // Proxy route handles auth + streaming server-side — Supabase URL never reaches client.
  const docs = rows.map((r) => ({ ...r, href: `/api/docs/${r.id}` }));

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Document</th>
              <th className="px-4 py-2.5 font-medium">File</th>
              <th className="px-4 py-2.5 font-medium">Uploaded</th>
              <th className="px-4 py-2.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const isImage = d.mime_type?.startsWith("image/");
              return (
                <tr key={d.id} className="border-t border-border hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {isImage ? (
                        <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-red-500 shrink-0" />
                      )}
                      <div>
                        <div className="font-medium">
                          {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                        </div>
                        {d.label && (
                          <div className="text-[11px] text-muted-foreground">{d.label}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate">
                    {d.file_name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                    {formatDate(d.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={d.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-medium hover:bg-secondary transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 px-1">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        Download links expire after 1 hour. Refresh this page to get new links.
      </p>
    </div>
  );
}
