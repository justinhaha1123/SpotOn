import React, { useState } from "react";
import { VehicleProfile } from "../types";
import {
  X,
  Car,
  Zap,
  Shield,
  Accessibility,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";

interface VehicleProfileModalProps {
  currentProfile: VehicleProfile;
  onSaveProfile: (profile: VehicleProfile) => void;
  onClose: () => void;
}

export const VehicleProfileModal: React.FC<VehicleProfileModalProps> = ({
  currentProfile,
  onSaveProfile,
  onClose,
}) => {
  const [vehicleType, setVehicleType] = useState<VehicleProfile["vehicleType"]>(
    currentProfile.vehicleType
  );
  const [registrationPlate, setRegistrationPlate] = useState(
    currentProfile.registrationPlate
  );
  const [heightMeters, setHeightMeters] = useState<number>(
    currentProfile.heightMeters
  );
  const [isBlueBadgeHolder, setIsBlueBadgeHolder] = useState(
    currentProfile.isBlueBadgeHolder
  );

  const vehicleOptions = [
    {
      id: "ev" as const,
      label: "Electric Vehicle (EV)",
      icon: "⚡",
      desc: "Highlight EV charging bays & 7kW/22kW/50kW fast chargers",
      defaultHeight: 1.65,
    },
    {
      id: "hybrid" as const,
      label: "Plug-in Hybrid (PHEV)",
      icon: "🔋",
      desc: "Dual powertrain with optional AC charging points",
      defaultHeight: 1.65,
    },
    {
      id: "petrol_diesel" as const,
      label: "Petrol / Diesel",
      icon: "⛽",
      desc: "Standard internal combustion vehicle (ULEZ compliant)",
      defaultHeight: 1.60,
    },
    {
      id: "suv" as const,
      label: "Large SUV / 4x4",
      icon: "🚙",
      desc: "Taller vehicle clearance alerts (e.g., Range Rover, XC90)",
      defaultHeight: 1.95,
    },
    {
      id: "van" as const,
      label: "Van / Commercial",
      icon: "🚐",
      desc: "High roof commercial vehicles requiring > 2.05m clearance",
      defaultHeight: 2.15,
    },
  ];

  const heightPresets = [
    { label: "1.60m", sub: "Sedan/Hatchback", val: 1.6 },
    { label: "1.75m", sub: "Crossover", val: 1.75 },
    { label: "1.90m", sub: "Standard SUV", val: 1.9 },
    { label: "1.98m", sub: "Large 4x4", val: 1.98 },
    { label: "2.10m", sub: "Van / Roof Box", val: 2.1 },
  ];

  const handleSelectType = (type: VehicleProfile["vehicleType"]) => {
    setVehicleType(type);
    const found = vehicleOptions.find((o) => o.id === type);
    if (found && Math.abs(heightMeters - 1.9) < 0.05) {
      setHeightMeters(found.defaultHeight);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedPlate = registrationPlate.trim().toUpperCase() || "LD69 XKR";
    onSaveProfile({
      vehicleType,
      registrationPlate: formattedPlate,
      heightMeters: Number(heightMeters.toFixed(2)),
      isBlueBadgeHolder,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold leading-tight">
                Vehicle Profile &amp; Clearance
              </h3>
              <p className="text-xs text-slate-400">
                Preset your car specs to prevent height scrapes &amp; match EV bays
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="btn-close-vehicle-modal"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4">
          {/* License Plate Display / Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Vehicle Registration (UK Number Plate)
            </label>
            <div className="flex items-center gap-3">
              {/* UK Style Number Plate Box */}
              <div className="flex items-center bg-[#fadb14] text-slate-950 font-mono font-extrabold text-lg px-3 py-1.5 rounded-lg border-2 border-black shadow-inner tracking-widest uppercase shrink-0">
                <span className="text-[10px] text-blue-900 bg-white font-sans font-bold px-1 rounded mr-2 py-0.5 border border-slate-400">
                  GB
                </span>
                <span>{registrationPlate || "LD69 XKR"}</span>
              </div>
              <input
                type="text"
                value={registrationPlate}
                onChange={(e) => setRegistrationPlate(e.target.value.toUpperCase())}
                placeholder="e.g. LD69 XKR"
                maxLength={8}
                className="flex-1 uppercase font-mono font-bold bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Auto-filled onto your digital parking reservation pass
            </p>
          </div>

          {/* Vehicle Type Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Vehicle Category
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {vehicleOptions.map((opt) => {
                const isSelected = vehicleType === opt.id;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    onClick={() => handleSelectType(opt.id)}
                    className={`p-2.5 rounded-xl border text-left transition flex items-start gap-2.5 ${
                      isSelected
                        ? "bg-blue-50/90 border-blue-500 ring-2 ring-blue-400/20 shadow-xs"
                        : "bg-white border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-xl shrink-0 mt-0.5">{opt.icon}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900">
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 leading-snug line-clamp-2">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Vehicle Height & London Clearance Protection */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-900 block">
                  Vehicle Total Height (Clearance Check)
                </label>
                <p className="text-[11px] text-slate-500">
                  Many Central London car parks have strict 1.80m – 1.95m barrier limits
                </p>
              </div>
              <div className="text-right">
                <span className="text-base font-extrabold text-blue-600 font-mono">
                  {heightMeters.toFixed(2)}m
                </span>
              </div>
            </div>

            {/* Slider */}
            <input
              type="range"
              min="1.4"
              max="2.5"
              step="0.05"
              value={heightMeters}
              onChange={(e) => setHeightMeters(parseFloat(e.target.value))}
              className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
            />

            {/* Height Presets */}
            <div className="grid grid-cols-5 gap-1 pt-1">
              {heightPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.label}
                  onClick={() => setHeightMeters(preset.val)}
                  className={`py-1 px-1.5 rounded-lg border text-center transition ${
                    Math.abs(heightMeters - preset.val) < 0.03
                      ? "bg-blue-600 text-white border-blue-600 font-bold"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <span className="block text-[11px] font-bold">{preset.label}</span>
                  <span className="block text-[9px] opacity-75 truncate">{preset.sub}</span>
                </button>
              ))}
            </div>

            {/* Height Safety Preview Feedback */}
            {heightMeters >= 1.95 && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2 text-amber-800 text-[11px]">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Height Notice ({heightMeters.toFixed(2)}m):</strong> Facilities with clearance under {heightMeters.toFixed(2)}m will display an instant clearance warning to prevent roof damage.
                </span>
              </div>
            )}
          </div>

          {/* Blue Badge Accessibility Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Accessibility className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Blue Badge Holder (UK Disabled Permit)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Highlight dedicated disabled bays and zero-tariff concessions
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={isBlueBadgeHolder}
                onChange={(e) => setIsBlueBadgeHolder(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="btn-save-vehicle-profile"
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition"
            >
              <Check className="w-4 h-4" />
              <span>Save Vehicle Profile</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
