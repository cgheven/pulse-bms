"use client";

import { useState, useTransition } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { addProposalComment } from "@/app/actions/proposals";
import { friendlyErrorMessage } from "@/lib/toast-error";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_name: string | null;
};

export function CommentsThread({
  proposalId,
  comments,
}: {
  proposalId: string;
  comments: Comment[];
}) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      try {
        await addProposalComment(proposalId, body);
        setBody("");
      } catch (e) {
        const msg = friendlyErrorMessage(e, "Failed to post comment");
        toast({ title: "Could not post", description: msg, variant: "destructive" });
      }
    });
  }

  return (
    <div className="card-soft">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-5 h-5 text-muted-foreground" />
        <h3 className="text-2xl font-bold">Discussion ({comments.length})</h3>
      </div>

      <div className="space-y-4 mb-6">
        {comments.length === 0 ? (
          <p className="text-muted-foreground">No comments yet. Start the discussion.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="border-l-4 border-primary/30 pl-4 py-2">
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <div className="font-semibold">{c.author_name ?? "Unknown"}</div>
                <div className="text-xs text-muted-foreground">{formatDate(c.created_at)}</div>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-3">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
        />
        <Button onClick={submit} disabled={pending || !body.trim()}>
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Posting…
            </>
          ) : (
            "Post comment"
          )}
        </Button>
      </div>
    </div>
  );
}
