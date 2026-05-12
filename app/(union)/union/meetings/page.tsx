import { MapPin, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { MeetingForm } from "@/components/union/meeting-form";
import { MeetingDeleteButton } from "@/components/union/meeting-delete-button";

export const dynamic = "force-dynamic";

type Meeting = {
  id: string;
  title: string;
  scheduled_at: string;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  status: string;
};

export default async function MeetingsPage() {
  const { profile } = await requireRole("union");
  if (!profile.building_id) {
    return (
      <div className="card-soft">
        <h1>Meetings</h1>
        <p className="text-muted-foreground mt-2">No building assigned.</p>
      </div>
    );
  }
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("bms_meetings")
    .select("id, title, scheduled_at, location, agenda, minutes, status")
    .eq("building_id", profile.building_id)
    .order("scheduled_at", { ascending: false });

  const now = new Date();
  const upcoming = (meetings ?? []).filter(
    (m) => new Date(m.scheduled_at) >= now && m.status !== "cancelled"
  );
  const past = (meetings ?? []).filter(
    (m) => new Date(m.scheduled_at) < now || m.status === "completed"
  );

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1>Meetings</h1>
          <p className="text-muted-foreground mt-1">
            Schedule committee meetings, capture agendas, and save minutes.
          </p>
        </div>
        <MeetingForm mode="create" />
      </header>

      <section>
        <h2 className="mb-3">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="card-soft text-muted-foreground">No upcoming meetings.</div>
        ) : (
          <div className="space-y-3">
            {upcoming.map((m) => (
              <MeetingCard key={m.id} meeting={m as Meeting} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3">Past</h2>
        {past.length === 0 ? (
          <div className="card-soft text-muted-foreground">No past meetings yet.</div>
        ) : (
          <div className="space-y-3">
            {past.map((m) => (
              <MeetingCard key={m.id} meeting={m as Meeting} past />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MeetingCard({ meeting, past }: { meeting: Meeting; past?: boolean }) {
  const when = new Date(meeting.scheduled_at);
  const time = when.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="card-soft">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xl font-bold">{meeting.title}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatDate(meeting.scheduled_at)} · {time}
            </span>
            {meeting.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {meeting.location}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-secondary">
              {meeting.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {past && <MeetingForm mode="edit-minutes" meeting={meeting} />}
          <MeetingDeleteButton id={meeting.id} />
        </div>
      </div>

      {meeting.agenda && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Agenda
          </div>
          <p className="whitespace-pre-wrap">{meeting.agenda}</p>
        </div>
      )}

      {meeting.minutes && (
        <div className="mt-4 border-t border-border pt-3">
          <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Minutes
          </div>
          <p className="whitespace-pre-wrap">{meeting.minutes}</p>
        </div>
      )}
    </div>
  );
}
