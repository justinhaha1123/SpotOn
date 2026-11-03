import React, { useState } from "react";
import { ParkingFacility } from "../types";
import { catalogueFieldLabel, isUnverifiedCatalogue } from "../utils/catalogueNotes";
import {
  X,
  Camera,
  RefreshCw,
  Navigation,
  Key,
  ShieldCheck,
  AlertCircle,
  Radio,
} from "lucide-react";

interface CameraModalProps {
  facility: ParkingFacility;
  onClose: () => void;
  onNavigate: (facility: ParkingFacility) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  facility,
  onClose,
  onNavigate,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [imageTimestamp, setImageTimestamp] = useState(Date.now());
  const [lastRefreshedTime, setLastRefreshedTime] = useState("Just now");
  const [imageError, setImageError] = useState(false);

  const jamCam = facility.jamCam;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setImageError(false);
    setTimeout(() => {
      setImageTimestamp(Date.now());
      setIsRefreshing(false);
      setLastRefreshedTime(new Date().toLocaleTimeString());
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-slate-850 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white leading-tight">
                  {facility.name}
                </h3>
                {jamCam && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                    LIVE FEED
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Nearby TfL traffic camera
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            id="btn-close-camera-modal"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {jamCam ? (
            <div>
              {/* Camera Header Bar */}
              <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                <div className="flex items-center gap-2 font-medium">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span className="text-white font-semibold">Nearby TfL traffic camera:</span>
                  <span className="text-slate-300">{jamCam.commonName}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400 font-mono">
                    Refreshed: {lastRefreshedTime}
                  </span>
                  <button
                    onClick={handleRefresh}
                    id="btn-refresh-cam"
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="Refresh Live Camera Feed"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Real TfL Live Stream Image */}
              <div className="relative w-full aspect-video rounded-xl bg-black border border-slate-800 overflow-hidden shadow-lg">
                {!imageError && jamCam.imageUrl ? (
                  <img
                    src={`${jamCam.imageUrl}?ts=${imageTimestamp}`}
                    alt={jamCam.commonName}
                    referrerPolicy="no-referrer"
                    onError={() => setImageError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                    <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-sm font-semibold text-slate-300">Live Camera Stream Temporarily Offline</p>
                    <p className="text-xs text-slate-500 mt-1">
                      The camera feed for this approach road is currently updating or offline in TfL network.
                    </p>
                    <button
                      onClick={handleRefresh}
                      className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
                    >
                      Retry Connection
                    </button>
                  </div>
                )}

                {/* Overlays on image */}
                {!imageError && jamCam.imageUrl && (
                  <>
                    <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-sm text-white px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-white/20">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      <span>Nearby TfL traffic camera</span>
                    </div>

                    <div className="absolute bottom-3 right-3 bg-slate-950/80 backdrop-blur-sm text-amber-300 px-2.5 py-1 rounded-lg text-xs font-medium border border-white/20">
                      {facility.jamCamDistanceM} m from car park
                    </div>
                  </>
                )}
              </div>

              {/* Distance under image */}
              <div className="mt-2 text-xs text-slate-400 text-right">
                {facility.jamCamDistanceM} m from car park
              </div>

              {/* Context Card */}
              <div className="mt-3 p-3 bg-slate-800/60 rounded-xl border border-slate-700 text-xs text-slate-300">
                <div className="font-semibold text-white mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Nearby TfL traffic camera</span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  This live camera is directly sourced from Transport for London (TfL) located {facility.jamCamDistanceM} m from {facility.name}. Drivers can visually verify traffic flow, junction clearance, and road access before arrival.
                </p>
              </div>

              {/* Access Instructions */}
              {facility.accessInstructions && (
                <div className="mt-3 p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
                  <Key className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-300 block font-semibold mb-0.5">
                      {catalogueFieldLabel(facility, "Entry & access details")}
                    </strong>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{facility.accessInstructions}</p>
                    {facility.securityType && (
                      <span className="inline-block text-[11px] text-amber-400/90 mt-1 font-medium bg-amber-900/30 px-2 py-0.5 rounded border border-amber-800/40">
                        {isUnverifiedCatalogue(facility) ? "Unverified catalogue note: " : ""}
                        Security: {facility.securityType}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Navigation CTA */}
              <div className="mt-4 flex items-center justify-end">
                <button
                  onClick={() => onNavigate(facility)}
                  id="btn-cam-direct-nav"
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Navigate to car park
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 flex flex-col items-center">
              <Camera className="w-10 h-10 text-slate-600 mb-2" />
              <p className="text-base font-semibold text-slate-200">No traffic camera within 400 m</p>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Live camera streams are only available for facilities with an active TfL street camera within 400 m.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition"
                >
                  Close
                </button>
                <button
                  onClick={() => onNavigate(facility)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md transition"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Navigate to car park
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
