import React, { useState } from "react";
import { ParkingFacility, AppUser } from "../types";
import {
  X,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Zap,
  Accessibility,
  TrendingUp,
  MapPin,
  Building,
  Plus,
  Minus,
} from "lucide-react";

interface UpdateLiveSpacesModalProps {
  isOpen: boolean;
  facility: ParkingFacility | null;
  user: AppUser | null;
  onClose: () => void;
  onSubmitUpdate: (
    facilityId: string,
    newAvailableSpaces: number,
    extra: {
      evBaysAvailable?: number;
      disabledBaysAvailable?: number;
      notes?: string;
    }
  ) => void;
}

export const UpdateLiveSpacesModal: React.FC<UpdateLiveSpacesModalProps> = ({
  isOpen,
  facility,
  user,
  onClose,
  onSubmitUpdate,
}) => {
  if (!isOpen || !facility) return null;

  const [availableCount, setAvailableCount] = useState<number | null>(null);
  const [evCount, setEvCount] = useState<number>(
    Math.min(facility.evChargingBays ?? 0, Math.max(0, (facility.evChargingBays ?? 0) > 0 ? 1 : 0))
  );
  const [disabledCount, setDisabledCount] = useState<number>(
    Math.min(facility.disabledBays ?? 0, Math.max(0, (facility.disabledBays ?? 0) > 0 ? 1 : 0))
  );
  const [notes, setNotes] = useState<string>("");
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  const handleAdjust = (delta: number) => {
    setAvailableCount((prev) => {
      const next = (prev ?? 0) + delta;
      if (facility.totalSpaces != null) {
        return Math.max(0, Math.min(facility.totalSpaces, next));
      }
      return Math.max(0, next);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (availableCount == null) return;
    const countToSubmit = availableCount;

    setIsSuccess(true);
    setTimeout(() => {
      onSubmitUpdate(facility.id, countToSubmit, {
        evBaysAvailable: (facility.evChargingBays ?? 0) > 0 ? evCount : undefined,
        disabledBaysAvailable: (facility.disabledBays ?? 0) > 0 ? disabledCount : undefined,
        notes: notes.trim() || undefined,
      });
      setIsSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/40 flex items-center justify-center text-blue-300">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Add a note about spaces</h3>
              <p className="text-[11px] text-blue-200">Community Note · This Device Only</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safe Storage Emphasis Banner */}
        <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              Logged in as <strong>{user?.name || "Verified Driver"}</strong> · Stored safely on this device
            </span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-200 font-bold text-emerald-900 uppercase">
            Local Note
          </span>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Facility Overview Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-slate-900">{facility.name}</h4>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{facility.address} ({facility.postcode})</span>
                </p>
              </div>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 shrink-0">
                {facility.totalSpaces != null ? `Total: ${facility.totalSpaces} bays` : "Capacity unknown"}
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Live Available Spaces Stepper */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Observed Available Spaces
                </label>
                {availableCount !== null && (
                  <span className="text-xs font-bold text-blue-600">
                    {availableCount} {facility.totalSpaces != null ? `/ ${facility.totalSpaces}` : ""} spaces
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAdjust(-5)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition active:scale-95"
                  title="Minus 5 spaces"
                >
                  -5
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjust(-1)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95"
                  title="Minus 1 space"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <div className="flex-1 relative">
                  <input
                    type="number"
                    min={0}
                    max={facility.totalSpaces != null ? facility.totalSpaces : undefined}
                    value={availableCount ?? ""}
                    placeholder="Enter count"
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setAvailableCount(isNaN(val) ? null : Math.max(0, val));
                    }}
                    className="w-full text-center py-2 text-xl font-extrabold text-blue-700 bg-blue-50/50 border-2 border-blue-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-blue-500 pointer-events-none">
                    bays
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjust(1)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 flex items-center justify-center transition active:scale-95"
                  title="Add 1 space"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjust(5)}
                  className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center transition active:scale-95"
                  title="Add 5 spaces"
                >
                  +5
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setAvailableCount(0)}
                  className="py-1 px-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold transition"
                >
                  🔴 Full (0)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAvailableCount(
                      facility.totalSpaces != null ? Math.min(facility.totalSpaces, 2) : 2
                    )
                  }
                  className="py-1 px-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold transition"
                >
                  🟠 Low (2)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAvailableCount(
                      facility.totalSpaces != null
                        ? Math.min(facility.totalSpaces, Math.max(5, Math.round(facility.totalSpaces * 0.3)))
                        : 10
                    )
                  }
                  className="py-1 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-[11px] font-bold transition"
                >
                  🟡 Moderate
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAvailableCount(
                      facility.totalSpaces != null
                        ? Math.min(facility.totalSpaces, Math.max(10, Math.round(facility.totalSpaces * 0.7)))
                        : 25
                    )
                  }
                  className="py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold transition"
                >
                  🟢 Plenty
                </button>
              </div>
            </div>

            {/* Extra Bays Info (EV / Disabled) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {(facility.evChargingBays ?? 0) > 0 ? (
                <div className="p-2.5 bg-amber-50/60 border border-amber-200 rounded-xl">
                  <label className="text-[11px] font-bold text-amber-900 flex items-center gap-1 mb-1">
                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                    <span>EV Bays Open</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={facility.evChargingBays ?? 0}
                      value={evCount}
                      onChange={(e) => setEvCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-16 text-center font-bold text-xs py-1 bg-white border border-amber-300 rounded-lg"
                    />
                    <span className="text-[11px] text-amber-700">of {facility.evChargingBays}</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-400">
                  <span>No EV chargers at this site</span>
                </div>
              )}

              {(facility.disabledBays ?? 0) > 0 ? (
                <div className="p-2.5 bg-blue-50/60 border border-blue-200 rounded-xl">
                  <label className="text-[11px] font-bold text-blue-900 flex items-center gap-1 mb-1">
                    <Accessibility className="w-3.5 h-3.5 text-blue-600" />
                    <span>Disabled Bays Open</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      max={facility.disabledBays ?? 0}
                      value={disabledCount}
                      onChange={(e) =>
                        setDisabledCount(Math.max(0, parseInt(e.target.value, 10) || 0))
                      }
                      className="w-16 text-center font-bold text-xs py-1 bg-white border border-blue-300 rounded-lg"
                    />
                    <span className="text-[11px] text-blue-700">of {facility.disabledBays}</span>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-400">
                  <span>No dedicated disabled bays</span>
                </div>
              )}
            </div>

            {/* Optional Observation Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                On-site Observations (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Barrier open, lower level has empty spots, rapid charger working"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            {/* Submission Safety Notice */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Your note will be saved locally on this device as a personal reference.
              </span>
            </div>

            {/* Submit Actions */}
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSuccess || availableCount == null}
                className="flex-[2] py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    <span>Note Saved!</span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    <span>Save Note</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
