import React, { useState } from "react";
import { parkHereVerdict, type ParkHereFacts, type ParkHereVerdict } from "../utils/parkHere";

const TONE: Record<ParkHereVerdict["state"], string> = {
  yes: "border-emerald-200 bg-emerald-50 text-emerald-950",
  not_now: "border-rose-200 bg-rose-50 text-rose-950",
  unsure: "border-slate-200 bg-slate-50 text-slate-800",
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <p className="text-[11px] leading-snug">
      <span className="font-semibold">{label}: </span>
      {value}
    </p>
  );
}

export const ParkHereCard: React.FC<{ verdict: ParkHereVerdict }> = ({ verdict }) => (
  <div className={`mt-1.5 rounded-xl border px-2 py-1.5 ${TONE[verdict.state]}`} role="status">
    <p className="text-xs font-bold leading-snug">{verdict.headline}</p>
    <div className="mt-0.5 space-y-0">
      <Row label="Max stay" value={verdict.maxStay} />
      <Row label="No return" value={verdict.noReturn} />
      <Row label="Until" value={verdict.until} />
      <Row label="Next restriction" value={verdict.nextRestriction} />
      <Row label="Tariff" value={verdict.tariff} />
      <Row label="Zone" value={verdict.zone ? `CPZ ${verdict.zone}` : null} />
    </div>
    <p className="mt-1 text-[10px] leading-snug">
      Source: {verdict.source}. {verdict.disclaimer}.
    </p>
  </div>
);

export const ParkHereButton: React.FC<{ facts: ParkHereFacts }> = ({ facts }) => {
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<ParkHereVerdict | null>(null);

  return (
    <div className="mt-1.5" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="min-h-11 w-full rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-950"
        onClick={() => {
          setVerdict(parkHereVerdict(facts, new Date()));
          setOpen((current) => !current);
        }}
      >
        Can I park here now?
      </button>
      {open && verdict && <ParkHereCard verdict={verdict} />}
    </div>
  );
};
