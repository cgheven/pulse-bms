import { CheckCircle2, XCircle, MinusCircle, Users } from "lucide-react";

type Props = {
  approve: number;
  reject: number;
  abstain: number;
  total: number;
  votingRule: "majority" | "unanimous";
};

export function TallyPanel({ approve, reject, abstain, total, votingRule }: Props) {
  const cast = approve + reject + abstain;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  return (
    <div className="card-soft">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-bold">Live tally</h3>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="w-5 h-5" />
          <span>
            {cast} of {total} voted
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <TallyRow
          icon={<CheckCircle2 className="w-5 h-5 text-green-700" />}
          label="Approve"
          count={approve}
          pct={pct(approve)}
          color="bg-green-600"
        />
        <TallyRow
          icon={<XCircle className="w-5 h-5 text-red-700" />}
          label="Reject"
          count={reject}
          pct={pct(reject)}
          color="bg-red-600"
        />
        <TallyRow
          icon={<MinusCircle className="w-5 h-5 text-gray-700" />}
          label="Abstain"
          count={abstain}
          pct={pct(abstain)}
          color="bg-gray-500"
        />
      </div>

      <p className="text-sm text-muted-foreground mt-5">
        Voting rule:{" "}
        <span className="font-semibold text-foreground">
          {votingRule === "majority"
            ? "Majority — more than half of active members must approve"
            : "Unanimous — every active member must approve"}
        </span>
      </p>
    </div>
  );
}

function TallyRow({
  icon,
  label,
  count,
  pct,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <div className="text-sm font-semibold">
          {count} <span className="text-muted-foreground font-normal">({pct}%)</span>
        </div>
      </div>
      <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
