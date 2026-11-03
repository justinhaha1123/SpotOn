import React, { useState } from "react";
import { VisitedParkingHistory, ParkingFacility } from "../types";
import { formatGbp } from "../utils";
import {
  History,
  Navigation,
  MapPin,
  Clock,
  Trash2,
  ChevronDown,
  X,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface RecentParkingHistoryProps {
  history: VisitedParkingHistory[];
  facilities: ParkingFacility[];
  selectedFacility: ParkingFacility | null;
  onSelectFacility: (facility: ParkingFacility) => void;
  onNavigateFacility: (facility: ParkingFacility) => void;
  onClearHistory: () => void;
  onRemoveItem: (id: string) => void;
  onSeedSampleHistory?: () => void;
}

function formatVisitedTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (isNaN(date.getTime())) return "Recently";

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 5) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (diffDays === 1 || (diffHours < 48 && date.getDate() === now.getDate() - 1)) {
      return `Yesterday, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

export const RecentParkingHistory: React.FC<RecentParkingHistoryProps> = ({
  history,
  facilities,
  selectedFacility,
  onSelectFacility,
  onNavigateFacility,
  onClearHistory,
  onRemoveItem,
  onSeedSampleHistory,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Take the last 5 visited car parks
  const recentItems = history.slice(0, 5);

  const resolveFacility = (item: VisitedParkingHistory): ParkingFacility | null => {
    return facilities.find((f) => f.id === item.id) || null;
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden transition-all duration-200 mb-3.5">
      {/* Section Header */}
      <div className="px-3.5 py-2.5 bg-gradient-to-r from-slate-50 to-blue-50/30 border-b border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 text-left min-w-0 group flex-1"
          title={isExpanded ? "Collapse Recent Parking History" : "Expand Recent Parking History"}
        >
          <div className="w-7 h-7 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center shrink-0">
            <History className="w-4 h-4 text-blue-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition truncate">
                Recent Parking History
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-blue-600 text-white shrink-0">
                {recentItems.length}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 truncate">
              Last {recentItems.length} visited • Quick one-tap navigation
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          {recentItems.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
              title="Clear parking history"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isExpanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-2 space-y-2">
          {recentItems.length === 0 ? (
            <div className="p-4 text-center space-y-2 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
              <Clock className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">No visited car parks yet</p>
              <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                Car parks you start navigation to will automatically appear here for quick return routing.
              </p>
              {onSeedSampleHistory && (
                <button
                  type="button"
                  onClick={onSeedSampleHistory}
                  className="mt-1 inline-flex items-center gap-1.5 text-xs text-blue-600 font-semibold hover:text-blue-800 hover:underline"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>Restore Recent Visits</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentItems.map((item, idx) => {
                const targetFacility = resolveFacility(item);
                const isSelected = selectedFacility?.id === item.id;
                const live = facilities.find((f) => f.id === item.id);

                return (
                  <div
                    key={`${item.id}-${idx}`}
                    onClick={() => {
                      if (targetFacility) onSelectFacility(targetFacility);
                    }}
                    className={`group relative p-2.5 rounded-xl border transition ${
                      targetFacility ? "cursor-pointer" : "opacity-80 cursor-default"
                    } ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-300 ring-1 ring-blue-300 shadow-2xs"
                        : "bg-white hover:bg-slate-50/80 border-slate-100 hover:border-slate-200"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {/* Left: Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            #{idx + 1}
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition truncate">
                            {item.name}
                          </h4>
                        </div>

                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.address}
                        </p>

                        {/* Status row: visit time & live vacancy */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                          <span className="text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span>{formatVisitedTime(item.visitedAt)}</span>
                          </span>

                          <span className="text-slate-300">•</span>

                          {live ? (
                            live.availableSpaces != null ? (
                              <span
                                className={`font-semibold ${
                                  live.availableSpaces > 5
                                    ? "text-emerald-700"
                                    : live.availableSpaces > 0
                                    ? "text-amber-700"
                                    : "text-rose-700"
                                }`}
                              >
                                {live.availableSpaces > 5
                                  ? `🟢 ${live.availableSpaces} spaces open`
                                  : live.availableSpaces > 0
                                  ? `🟠 Only ${live.availableSpaces} left`
                                  : "🔴 Full"}
                              </span>
                            ) : (
                              <span className="text-slate-500 font-medium">
                                Availability unknown
                              </span>
                            )
                          ) : (
                            <span className="text-amber-700 font-medium bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Historical data unavailable
                            </span>
                          )}

                          {item.categoryLabel && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500 truncate">{item.categoryLabel}</span>
                            </>
                          )}

                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">
                            {formatGbp(item.hourlyRate) ? `${formatGbp(item.hourlyRate)}/hr` : "Rate unknown"}
                          </span>
                        </div>
                      </div>

                      {/* Right: Quick Navigation Button */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {targetFacility && (
                          <button
                            type="button"
                            id={`btn-quick-nav-${item.id}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigateFacility(targetFacility);
                            }}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs py-1.5 px-3 rounded-xl shadow-xs transition"
                            title={`Quick Navigate to ${item.name}`}
                          >
                            <Navigation className="w-3.5 h-3.5 fill-white" />
                            <span>Navigate</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveItem(item.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 p-0.5 transition"
                          title="Remove from history"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
