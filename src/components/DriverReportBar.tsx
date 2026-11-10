import React, { useState } from "react";
import type { DriverReportSummary, ReportStatus } from "../server/reports/logic";
import { REPORT_LABELS } from "../server/reports/logic";
import { getAnonymousDeviceId } from "../utils/deviceId";

const CHOICES: ReportStatus[] = ["spaces_available", "filling_up", "full", "closed"];

interface DriverReportBarProps {
  facilityId: string;
  summary?: DriverReportSummary | null;
  onChanged?: () => void;
}

export const DriverReportBar: React.FC<DriverReportBarProps> = ({ facilityId, summary, onChanged }) => {
  const [message, setMessage] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (status: ReportStatus) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ facilityId, status, deviceId: getAnonymousDeviceId() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setUndoId(null);
        setMessage(typeof data?.message === "string" ? data.message : "Report could not be saved.");
        return;
      }
      setUndoId(typeof data.reportId === "string" ? data.reportId : null);
      setMessage("Thanks, report added");
      onChanged?.();
      window.setTimeout(() => {
        setUndoId((current) => (current === data.reportId ? null : current));
      }, 10000);
    } catch {
      setMessage("Report could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!undoId) return;
    const id = undoId;
    setUndoId(null);
    await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: getAnonymousDeviceId() }),
    }).catch(() => null);
    setMessage("Report removed");
    onChanged?.();
  };

  return (
    <div className="mt-2 space-y-2" onClick={(event) => event.stopPropagation()}>
      {summary ? (
        <p className={`text-[11px] font-semibold leading-snug ${summary.faded ? "text-slate-400" : "text-slate-700"}`}>
          {summary.text}
          <span className="block font-normal text-slate-500">Driver report, not a live sensor count.</span>
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">Availability not confirmed</p>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {CHOICES.map((status) => (
          <button
            key={status}
            type="button"
            disabled={busy}
            onClick={() => submit(status)}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {REPORT_LABELS[status]}
          </button>
        ))}
      </div>
      {message && (
        <p className="text-[11px] text-emerald-800" role="status">
          {message}
          {undoId && message === "Thanks, report added" && (
            <button type="button" onClick={undo} className="ml-2 min-h-11 px-2 font-bold text-blue-700 underline">
              Undo
            </button>
          )}
        </p>
      )}
    </div>
  );
};
