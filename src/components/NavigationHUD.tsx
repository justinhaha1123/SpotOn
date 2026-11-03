import React, { useState, useEffect } from "react";
import { NavigationSession } from "../types";
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Flag,
  Volume2,
  VolumeX,
  X,
  Camera,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Sparkles,
  Car,
  Moon,
  Sun,
  Gauge,
  Compass,
  ExternalLink,
} from "lucide-react";

interface NavigationHUDProps {
  session: NavigationSession;
  onUpdateSession: (updated: Partial<NavigationSession>) => void;
  onEndNavigation: () => void;
  onOpenLiveCamera: () => void;
}

export const NavigationHUD: React.FC<NavigationHUDProps> = ({
  session,
  onUpdateSession,
  onEndNavigation,
  onOpenLiveCamera,
}) => {
  const {
    facility,
    steps,
    currentStepIndex,
    distanceKm,
    durationMinutes,
    eta,
    speedKmh,
    heading,
    offRoute,
    arrived,
    locationError,
    voiceAnnouncementsEnabled,
    isDrivingMode = false,
    nightMode = false,
  } = session;

  const currentStep = steps[currentStepIndex] || steps[0];
  const nextStep = steps[currentStepIndex + 1];
  const stepDistanceM = currentStep?.distanceMeters ?? null;
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Speak instruction using Web Speech API
  const speakInstruction = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = "en-GB";
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  // Web Speech API for real spoken turn-by-turn navigation instructions
  useEffect(() => {
    if (!voiceAnnouncementsEnabled || !currentStep) return;
    speakInstruction(currentStep.instruction);
  }, [currentStepIndex, voiceAnnouncementsEnabled]);

  const handleToggleVoice = () => {
    const nextVal = !voiceAnnouncementsEnabled;
    onUpdateSession({ voiceAnnouncementsEnabled: nextVal });
    if (nextVal) {
      speakInstruction("Voice navigation enabled. " + (currentStep?.instruction || ""));
    } else if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleRepeatVoice = () => {
    if (currentStep) {
      speakInstruction(currentStep.instruction);
    }
  };

  const getManeuverIcon = (maneuver: string) => {
    switch (maneuver) {
      case "turn-left":
        return <ArrowLeft className="w-8 h-8 text-white" />;
      case "turn-right":
        return <ArrowRight className="w-8 h-8 text-white" />;
      case "slight-left":
        return <ArrowUpLeft className="w-8 h-8 text-white" />;
      case "slight-right":
        return <ArrowUpRight className="w-8 h-8 text-white" />;
      case "roundabout":
        return <RotateCcw className="w-8 h-8 text-white" />;
      case "arrive":
        return <Flag className="w-8 h-8 text-emerald-400" />;
      default:
        return <ArrowUp className="w-8 h-8 text-white" />;
    }
  };

  const isArrived = arrived || currentStepIndex >= steps.length - 1;
  const googleMapsFallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}&travelmode=driving`;

  return (
    <div className="absolute inset-x-0 top-0 bottom-0 z-30 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Banner: Turn Guidance HUD */}
      <div className="pointer-events-auto max-w-xl mx-auto w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4 transition-all">
        {/* Off Route Warning Banner */}
        {offRoute && (
          <div className="mb-3 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="text-xs">
                <span className="font-bold block text-rose-300">Off route – open in Google Maps</span>
                <span className="text-rose-200/80">You have deviated from the planned course.</span>
              </div>
            </div>
            <a
              href={googleMapsFallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shrink-0 inline-flex items-center gap-1"
            >
              Google Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Location Error / Permission Banner */}
        {locationError && (
          <div className="mb-3 p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-200 flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Location unavailable – showing route only</span>
          </div>
        )}

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shrink-0">
            {getManeuverIcon(currentStep?.maneuver || "straight")}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {typeof stepDistanceM === "number" && (
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                    In {stepDistanceM}m
                  </span>
                )}
                {isDrivingMode && (
                  <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1">
                    <Car className="w-3 h-3" /> DRIVING MODE
                  </span>
                )}
              </div>
              {steps.length > 0 && (
                <span className="text-xs text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                  Step {currentStepIndex + 1} of {steps.length}
                </span>
              )}
            </div>

            {steps.length > 0 && currentStep && (
              <div className="text-lg font-bold text-white truncate mt-0.5">
                {currentStep.instruction}
              </div>
            )}

            {steps.length > 0 && nextStep && (
              <div className="text-xs text-slate-400 truncate mt-1 flex items-center gap-1.5">
                <span className="text-slate-500">Then:</span>
                <span>{nextStep.instruction}</span>
              </div>
            )}
          </div>

          <button
            onClick={onEndNavigation}
            id="btn-hud-exit"
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition"
            title="Exit Navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Destination & Allocated Bay Pill */}
        <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <MapPin className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-semibold text-white truncate max-w-[200px]">
              {facility.name}
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-bold">Active Route</span>
          </div>
        </div>

        {facility.accessInstructions && (
          <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
            <span className="font-semibold text-amber-200">Access:</span>
            <span className="truncate text-slate-300">{facility.accessInstructions}</span>
          </div>
        )}
      </div>

      {/* Bottom Panel: In-Car Trip Dashboard, Bay Camera Preview, Simulation Controls */}
      <div className="pointer-events-auto max-w-xl mx-auto w-full bg-slate-900/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-slate-700/80 p-4">
        {/* Arrival banner if final step reached */}
        {isArrived && (
          <div className="mb-3 p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div className="text-xs">
                <span className="font-bold block text-emerald-300">You have arrived</span>
                {facility.accessInstructions ? (
                  <span>{facility.accessInstructions}</span>
                ) : (
                  <span>Proceed to parking entrance.</span>
                )}
              </div>
            </div>
            <button
              onClick={onEndNavigation}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shrink-0 ml-2"
            >
              Finish
            </button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          {/* Real-time Trip Metrics */}
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Remaining</span>
              <span className="text-xl font-extrabold text-white">{distanceKm} <span className="text-xs font-normal text-slate-400">km</span></span>
            </div>
            <div className="h-7 w-[1px] bg-slate-700"></div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Est. Time</span>
              <span className="text-xl font-extrabold text-blue-400">{durationMinutes} <span className="text-xs font-normal text-slate-400">min</span></span>
            </div>
            <div className="h-7 w-[1px] bg-slate-700"></div>
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Approx. ETA</span>
              <span className="text-base font-bold text-slate-200">{eta}</span>
            </div>
            {isDrivingMode && (
              <>
                {typeof speedKmh === "number" && (
                  <>
                    <div className="h-7 w-[1px] bg-slate-700 hidden sm:block"></div>
                    <div className="hidden sm:flex flex-col items-start">
                      <span className="text-[10px] text-emerald-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Gauge className="w-3 h-3" /> Speed
                      </span>
                      <span className="text-lg font-mono font-extrabold text-emerald-300">
                        {Math.round(speedKmh)} <span className="text-[10px] font-sans text-slate-400">km/h</span>
                      </span>
                    </div>
                  </>
                )}
                {typeof heading === "number" && Number.isFinite(heading) && (
                  <>
                    <div className="h-7 w-[1px] bg-slate-700 hidden md:block"></div>
                    <div className="hidden md:flex flex-col items-start">
                      <span className="text-[10px] text-blue-400 uppercase tracking-wider font-bold flex items-center gap-1">
                        <Compass className="w-3 h-3" /> Heading
                      </span>
                      <span className="text-sm font-mono font-bold text-slate-200">
                        {Math.round(heading)}°
                      </span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {/* Live Camera Feed Quick-Inspect (only if live cam can be achieved) */}
            {facility.hasLiveCam && (
              <button
                onClick={onOpenLiveCamera}
                id="btn-hud-camera-peek"
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-semibold border border-slate-700 transition"
                title="Inspect Live TfL Approach Camera"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Live Cam</span>
              </button>
            )}

            {/* Driving Mode Cockpit Toggle */}
            <button
              onClick={() => onUpdateSession({ isDrivingMode: !isDrivingMode })}
              id="btn-hud-driving-mode-toggle"
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${
                isDrivingMode
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-400/50 shadow-sm"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
              }`}
              title={isDrivingMode ? "Exit Cockpit Driving Mode" : "Switch to In-Car Driving Mode"}
            >
              <Car className="w-3.5 h-3.5 text-emerald-300" />
              <span className="hidden sm:inline">{isDrivingMode ? "Driving Mode" : "Cockpit"}</span>
            </button>

            {/* Night / Day Map Theme Toggle */}
            <button
              onClick={() => onUpdateSession({ nightMode: !nightMode })}
              id="btn-hud-night-toggle"
              className={`p-2 rounded-lg transition border ${
                nightMode
                  ? "bg-indigo-600 text-amber-200 border-indigo-500 shadow-xs"
                  : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
              }`}
              title={nightMode ? "Switch to Day Theme" : "Switch to Night / Dark Cockpit Theme"}
            >
              {nightMode ? <Moon className="w-3.5 h-3.5 fill-amber-300 text-amber-300" /> : <Sun className="w-3.5 h-3.5 text-amber-400" />}
            </button>

            {/* Repeat Instruction Button */}
            {voiceAnnouncementsEnabled && (
              <button
                onClick={handleRepeatVoice}
                id="btn-hud-repeat-voice"
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-300 rounded-lg text-xs font-semibold border border-slate-700 transition flex items-center gap-1"
                title="Repeat spoken instruction"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Repeat</span>
              </button>
            )}

            {/* Voice toggle */}
            <button
              onClick={handleToggleVoice}
              id="btn-hud-voice-toggle"
              className={`p-2 rounded-lg transition flex items-center gap-1.5 ${
                voiceAnnouncementsEnabled
                  ? "bg-blue-600 text-white shadow-xs"
                  : "bg-slate-800 text-slate-400 hover:text-white"
              }`}
              title={voiceAnnouncementsEnabled ? "Voice guidance active" : "Voice muted"}
            >
              {voiceAnnouncementsEnabled ? (
                <>
                  <Volume2 className={`w-4 h-4 ${isSpeaking ? "animate-pulse text-amber-300" : ""}`} />
                  <span className="text-[11px] font-bold hidden sm:inline">Voice</span>
                </>
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* GPS Tracking status bar */}
        <div className="mt-3 pt-3 border-t border-slate-800 flex items-center justify-between gap-3 text-xs">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${locationError ? "bg-amber-400" : "bg-emerald-400 animate-ping"}`}></span>
            <span>{locationError ? "GPS Inactive (Route Mode)" : "Real-time GPS Tracking"}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
