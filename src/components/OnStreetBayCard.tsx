import React from "react";
import type { CanParkNow, OnStreetBay } from "../types";
import type { DriverReportSummary } from "../server/reports/logic";
import { DriverReportBar } from "./DriverReportBar";
import { ParkHereButton } from "./ParkHereButton";
import { IveParkedButton } from "./ParkingTimer";
import { factsFromBay, parkHereVerdict } from "../utils/parkHere";
import { ExternalLink, MapPin } from "lucide-react";

const STATUS_LABEL: Record<CanParkNow, { text: string; className: string }> = {
  pay: { text: "Pay to park now", className: "bg-amber-50 text-amber-900 border-amber-200" },
  restricted: { text: "Restriction in force", className: "bg-rose-50 text-rose-800 border-rose-200" },
  outside_hours: { text: "Controlled hours finished", className: "bg-sky-50 text-sky-900 border-sky-200" },
  unknown: { text: "Check the sign", className: "bg-slate-100 text-slate-700 border-slate-200" },
};

interface OnStreetBayCardProps {
  bay: OnStreetBay;
  selected: boolean;
  onSelect: () => void;
  report?: DriverReportSummary | null;
  onReportsChanged?: () => void;
}

export const OnStreetBayCard: React.FC<OnStreetBayCardProps> = ({ bay, selected, onSelect, report, onReportsChanged }) => {
  const status = STATUS_LABEL[bay.canParkNow] ?? STATUS_LABEL.unknown;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${bay.lat},${bay.lng}&travelmode=driving`;

  return (
    <article
      id={`card-onstreet-${bay.id}`}
      className={`rounded-2xl border p-3 text-left ${
        selected ? "border-teal-500 bg-teal-50/70 ring-2 ring-teal-500/20" : "border-slate-200 bg-white"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left" aria-pressed={selected}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-slate-900 truncate">{bay.roadName}</h4>
            <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {bay.borough}
                {bay.postcode ? ` · ${bay.postcode}` : ""}
                {bay.cpz ? ` · CPZ ${bay.cpz}` : ""}
                {bay.distanceMeters != null ? ` · ${bay.distanceMeters} m` : ""}
              </span>
            </p>
          </div>
          <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.className}`}>
            {status.text}
          </span>
        </div>
        <p className="text-xs text-slate-700 mt-2 leading-snug">{bay.summary}</p>
        <p className="text-[10px] text-slate-500 mt-1.5">
          {bay.capacity != null ? `Marked capacity ${bay.capacity} (not free spaces). ` : "Capacity not published. "}
          {bay.sourceLabel}
          {bay.timesOfOperation ? ` · ${bay.timesOfOperation}` : ""}
        </p>
      </button>
      <div className="mt-2 flex items-center gap-2">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Directions in Google Maps
        </a>
        <a
          href={bay.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-semibold text-slate-500 hover:underline"
        >
          Source
        </a>
      </div>
      <ParkHereButton facts={factsFromBay(bay)} />
      <IveParkedButton
        name={bay.roadName}
        lat={bay.lat}
        lng={bay.lng}
        suggestedMinutes={parkHereVerdict(factsFromBay(bay)).suggestedStayMinutes}
      />
      <DriverReportBar facilityId={bay.id} summary={report} onChanged={onReportsChanged} />
    </article>
  );
};
