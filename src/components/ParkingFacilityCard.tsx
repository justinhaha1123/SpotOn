import React, { useState } from "react";
import { ParkingFacility, VehicleProfile } from "../types";
import { checkHeightSafety, getEvChargingSpeed, formatRelativeTime, formatGbp } from "../utils";
import { carParkOpenStatus } from "../utils/parkingHours";
import { catalogueRateLines, checkedOnLabel, isClosedCatalogue, isUnverifiedCatalogue } from "../utils/catalogueNotes";
import { DriverReportBar } from "./DriverReportBar";
import type { DriverReportSummary } from "../server/reports/logic";
import {
  Navigation,
  Camera,
  Zap,
  MapPin,
  Home,
  Building,
  Key,
  Shield,
  Car,
  Compass,
  Accessibility,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Share2,
  Check,
  TrendingUp,
  Lock,
  ShieldCheck,
} from "lucide-react";

interface ParkingFacilityCardProps {
  facility: ParkingFacility;
  isSelected: boolean;
  isLoggedIn?: boolean;
  vehicleProfile?: VehicleProfile;
  onSelect: () => void;
  onNavigate: () => void;
  onViewCamera: () => void;
  onUpdateLiveSpaces?: () => void;
  report?: DriverReportSummary | null;
  onReportsChanged?: () => void;
}

const CcBadge: React.FC<{ inZone: boolean }> = ({ inZone }) => {
  if (inZone) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
        <span>In Congestion Charge zone</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
      <Shield className="w-3 h-3 text-emerald-600" />
      <span>Outside Congestion Charge zone</span>
    </span>
  );
};

export const ParkingFacilityCard: React.FC<ParkingFacilityCardProps> = ({
  facility,
  isSelected,
  isLoggedIn,
  vehicleProfile,
  onSelect,
  onNavigate,
  onViewCamera,
  onUpdateLiveSpaces,
  report,
  onReportsChanged,
}) => {
  const hasAvailability = facility.availableSpaces != null;
  const isAmple = hasAvailability && facility.availableSpaces! >= 5;
  const isLow = hasAvailability && facility.availableSpaces! <= 1;

  // Vehicle Height Clearance Check
  const heightSafety = checkHeightSafety(
    facility.heightRestriction,
    vehicleProfile?.heightMeters
  );

  // Match EV
  const isEvMatch =
    vehicleProfile &&
    (vehicleProfile.vehicleType === "ev" || vehicleProfile.vehicleType === "hybrid") &&
    ((facility.evChargingBays ?? 0) > 0 || facility.hasEvCharging === true);

  // Match Blue Badge
  const isBlueBadgeMatch =
    vehicleProfile &&
    vehicleProfile.isBlueBadgeHolder &&
    ((facility.disabledBays ?? 0) > 0 || facility.parkingCategory === "designated_disabled_bay");

  // Category visual badge configuration
  const getCategoryBadge = () => {
    switch (facility.parkingCategory) {
      case "private_driveway":
        return {
          icon: <Home className="w-3 h-3 text-purple-600" />,
          label: "Private Driveway",
          classes: "bg-purple-50 text-purple-700 border-purple-200",
        };
      case "gated_mews":
        return {
          icon: <Key className="w-3 h-3 text-amber-600" />,
          label: "Gated Mews",
          classes: "bg-amber-50 text-amber-800 border-amber-200",
        };
      case "hotel_forecourt":
        return {
          icon: <Building className="w-3 h-3 text-blue-600" />,
          label: "Private Forecourt",
          classes: "bg-blue-50 text-blue-700 border-blue-200",
        };
      case "on_street_sensor":
        return {
          icon: <Compass className="w-3 h-3 text-teal-600" />,
          label: "Smart Street Bay",
          classes: "bg-teal-50 text-teal-700 border-teal-200",
        };
      case "designated_disabled_bay":
        return {
          icon: <Accessibility className="w-3.5 h-3.5 text-blue-700" />,
          label: "Disabled Bay (Blue Badge)",
          classes: "bg-blue-100 text-blue-800 border-blue-300 font-bold",
        };
      case "station_park_ride":
        return {
          icon: <Car className="w-3 h-3 text-rose-600" />,
          label: "TfL Station",
          classes: "bg-rose-50 text-rose-700 border-rose-200",
        };
      default:
        return {
          icon: <Car className="w-3 h-3 text-slate-600" />,
          label: "Multi-Storey",
          classes: "bg-slate-100 text-slate-700 border-slate-200",
        };
    }
  };

  const catBadge = getCategoryBadge();
  const evSpeed = getEvChargingSpeed(facility);
  const rates = catalogueRateLines(facility);
  const checked = checkedOnLabel(facility.verifiedAt);
  const openStatus = carParkOpenStatus(facility.openHours);
  const closedToPublic = isClosedCatalogue(facility);
  const [isCopied, setIsCopied] = useState(false);
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}&travelmode=driving`;

  // Copy location link and current availability status to clipboard
  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const mapsLink = `https://www.google.com/maps/search/?api=1&query=${facility.lat},${facility.lng}`;
    const availText = hasAvailability
      ? `${facility.availableSpaces} of ${facility.totalSpaces != null ? facility.totalSpaces : "Capacity unknown"} spaces free`
      : "Availability unknown";
    const hourlyFormatted = formatGbp(facility.hourlyRate);
    const dailyFormatted = formatGbp(facility.dailyRate);
    const tariffText = hourlyFormatted
      ? `${hourlyFormatted}/hr${dailyFormatted ? ` / ${dailyFormatted}/day` : ""}`
      : (dailyFormatted ? `${dailyFormatted}/day` : "Rate unknown");
    const shareText = `🅿️ ${facility.name} (${catBadge.label})\n📍 ${facility.address}, London\nℹ️ Status: ${availText}\n💷 Tariff: ${tariffText}${
      (facility.evChargingBays ?? 0) > 0
        ? `\n⚡ EV Charging: ${facility.evChargingBays} bays${evSpeed.published ? ` (${evSpeed.label})` : " (speed not published)"}`
        : ""
    }\n📏 Height Clearance: ${facility.heightRestriction != null ? `${facility.heightRestriction}m` : "unknown"}\n🗺️ Google Maps Location: ${mapsLink}`;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareText;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2200);
    } catch (err) {
      console.warn("Failed to copy to clipboard:", err);
    }
  };

  return (
    <div
      onClick={onSelect}
      id={`card-facility-${facility.id}`}
      className={`group relative p-4 rounded-2xl border transition-all cursor-pointer ${
        isSelected
          ? "bg-blue-50/70 border-blue-500 shadow-md ring-2 ring-blue-500/20"
          : "bg-white hover:bg-slate-50 border-slate-200/90 shadow-xs hover:border-slate-300"
      } ${!heightSafety.safe ? "border-rose-300/80 bg-rose-50/30" : ""}`}
    >
      {/* Category Pill & Operator */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md border ${catBadge.classes}`}
          >
            {catBadge.icon}
            <span>{catBadge.label}</span>
          </span>
          <span className="text-[11px] text-slate-500 font-medium truncate max-w-[130px]">
            {facility.operator}
          </span>
        </div>

        {/* Live Available Spaces Badge */}
        <div
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold shadow-2xs shrink-0 ${
            hasAvailability
              ? isAmple
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : isLow
                ? "bg-amber-50 text-amber-800 border border-amber-200"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-slate-100 text-slate-600 border border-slate-200"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              hasAvailability
                ? facility.availableSpaces! > 0
                  ? "bg-emerald-500 animate-pulse"
                  : "bg-rose-500"
                : "bg-slate-400"
            }`}
          ></span>
          <span>
            {hasAvailability
              ? `${facility.availableSpaces} ${facility.availableSpaces === 1 ? "Space" : "Spaces"} Free`
              : "Availability unknown"}
          </span>
        </div>
      </div>

      {/* Name and Address */}
      <h4 className="font-bold text-slate-900 text-sm sm:text-base leading-snug group-hover:text-blue-600 transition truncate">
        {facility.name}
      </h4>
      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-xs text-slate-500">
        <div className="flex items-center gap-1 min-w-0 truncate">
          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
          <span className="truncate">{facility.address}</span>
        </div>
        {facility.zoneLabel && (
          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 shrink-0">
            {facility.zoneLabel}
          </span>
        )}

        {/* Congestion Charge status badge */}
        {(facility.congestionChargeZone === true || facility.congestionChargeZone === false) && (
          <CcBadge inZone={facility.congestionChargeZone} />
        )}
        <span
          className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
            closedToPublic
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : openStatus.status === "open"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : openStatus.status === "closed"
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
          }`}
        >
          {closedToPublic
            ? "No public parking"
            : openStatus.status === "open"
              ? "Open now"
              : openStatus.status === "closed"
                ? "Closed now"
                : "Hours unchecked"}
        </span>

        {/* EV Match Badge */}
        {isEvMatch && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
            <Zap className="w-3 h-3 text-emerald-700" />
            <span>EV Match</span>
          </span>
        )}

        {/* Fast Charging Badge */}
        {(facility.evChargingBays ?? 0) > 0 && evSpeed.published && evSpeed.isFast && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 shrink-0 shadow-2xs">
            <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
            <span>{evSpeed.label}</span>
          </span>
        )}

        {/* Blue Badge Match */}
        {isBlueBadgeMatch && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900 border border-blue-300 shrink-0">
            <Accessibility className="w-3 h-3 text-blue-700" />
            <span>Blue Badge</span>
          </span>
        )}
      </div>

      {/* Height Clearance Warning if exceeds vehicle height */}
      {!heightSafety.safe && (
        <div className="mt-2 px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-1.5 text-xs text-rose-800 font-medium">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="truncate">
            Clearance limit {facility.heightRestriction != null ? `${facility.heightRestriction}m` : "unknown"} is lower than your vehicle ({vehicleProfile?.heightMeters.toFixed(2)}m)!
          </span>
        </div>
      )}

      {/* Space dimension / access description if available */}
      {facility.spaceDimensions && (
        <p className="text-[11px] text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-2 py-1 border border-slate-100 flex items-center gap-1">
          <Shield className="w-3 h-3 text-indigo-500 shrink-0" />
          <span className="truncate">{facility.spaceDimensions}</span>
        </p>
      )}

      {/* Facility Highlights: Distance, Rate, EV */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-50 rounded-xl p-2">
          <span className="text-[10px] text-slate-400 block font-medium">Distance &amp; Drive</span>
          <span className="font-bold text-slate-800">
            {facility.distanceFromUserMiles ? `${facility.distanceFromUserMiles} mi` : "Nearby"}
          </span>
          <span className="text-[10px] text-slate-500 block">
            {facility.estimatedDriveTimeMin ? `~${facility.estimatedDriveTimeMin} mins` : "In London"}
          </span>
        </div>

        <div className="bg-slate-50 rounded-xl p-2">
          <span className="text-[10px] text-slate-400 block font-medium">Tariff Rate</span>
          {closedToPublic ? (
            <>
              <span className="font-bold text-slate-800">Closed</span>
              <span className="text-[10px] text-slate-500 block">No public parking</span>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-800">{rates.primary}</span>
              <span className="text-[10px] text-slate-500 block">{rates.secondary}</span>
            </>
          )}
        </div>

        <div className="bg-slate-50 rounded-xl p-2">
          <span className="text-[10px] text-slate-400 block font-medium">EV &amp; Speed</span>
          <div className="flex items-center gap-1 font-bold text-emerald-700">
            {facility.evChargingBays == null ? (
              <span className="text-slate-600 font-semibold text-[11px]">EV: unknown</span>
            ) : facility.evChargingBays > 0 ? (
              <>
                <Zap className={`w-3 h-3 ${evSpeed.isFast ? "text-amber-500 fill-amber-500" : "text-emerald-600"}`} />
                <span className="truncate">{facility.evChargingBays} Bays</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-extrabold ${evSpeed.published && evSpeed.isFast ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {evSpeed.published ? `${evSpeed.kw}kW` : "kW n/a"}
                </span>
              </>
            ) : (
              <span className="text-slate-600 font-semibold text-[11px]">No EV Bays</span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 block truncate">
            {facility.heightRestriction != null ? `${facility.heightRestriction}m` : "Clearance unknown"}
          </span>
        </div>
      </div>

      {closedToPublic && (
        <p className="mt-2 text-[11px] font-semibold text-rose-800">No public parking listed by National Rail</p>
      )}
      {facility.tariffNote && !closedToPublic && (
        <p className="mt-2 text-[11px] text-slate-500 leading-snug">{facility.tariffNote}</p>
      )}
      {isUnverifiedCatalogue(facility) && (
        <p className="mt-1 text-[11px] font-semibold text-amber-800">Unverified catalogue — not a live feed.</p>
      )}
      {checked && facility.sourceUrl && (
        <p className="mt-1 text-[11px]">
          <a
            href={facility.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-blue-700 hover:underline"
          >
            {checked}
          </a>
        </p>
      )}
      <DriverReportBar facilityId={facility.id} summary={report} onChanged={onReportsChanged} />
      {facility.confidence === "static" && facility.source === "tfl" && (
        <p className="mt-1 text-[11px] font-semibold text-slate-500">TfL catalogue. Space count is not live.</p>
      )}
      {facility.confidence === "live" && (
        <p className="mt-1 text-[11px] font-semibold text-emerald-700">Live space count from TfL.</p>
      )}

      {/* Community note stored on this browser */}
      {facility.lastCommunityUpdate && (
        <div className="mt-2 text-xs text-slate-500 truncate">
          User note: ~{facility.lastCommunityUpdate.newAvailable} spaces · {formatRelativeTime(facility.lastCommunityUpdate.submittedAt || facility.lastCommunityUpdate.updatedAt)} · this device only
        </div>
      )}

      {/* Card Action Buttons */}
      <div className="mt-3 flex items-center gap-2">
        {/* Navigate Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNavigate();
          }}
          id={`btn-nav-${facility.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-bold text-xs py-2 px-3 rounded-xl shadow-xs transition"
        >
          <Navigation className="w-3.5 h-3.5" />
          <span>Navigate to Spaces</span>
        </button>

        {/* Update Live Spaces Button - Only available when not live TfL data */}
        {facility.confidence === "live" ? (
          <span className="text-[11px] text-slate-400 italic px-1.5 py-1 shrink-0">
            Live TfL data – notes not needed
          </span>
        ) : onUpdateLiveSpaces && (
          isLoggedIn ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateLiveSpaces();
              }}
              id={`btn-update-live-${facility.id}`}
              className="flex items-center justify-center gap-1 font-bold text-xs py-2 px-2.5 rounded-xl border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-800 transition shrink-0 active:scale-95 shadow-2xs"
              title="Provide updated live available parking spaces"
            >
              <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
              <span className="hidden sm:inline">Update</span>
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdateLiveSpaces();
              }}
              id={`btn-update-live-${facility.id}`}
              className="flex items-center justify-center gap-1 font-medium text-xs py-2 px-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 transition shrink-0 active:scale-95"
              title="Log in safely to update live available parking spaces (All data stored safely)"
            >
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Login to Update</span>
              <span className="sm:hidden">Login</span>
            </button>
          )
        )}

        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center gap-1 font-semibold text-xs py-2 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shrink-0"
          title="Open turn-by-turn directions in Google Maps"
        >
          Maps
        </a>

        {/* Share Button */}
        <button
          onClick={handleShare}
          id={`btn-share-${facility.id}`}
          className={`flex items-center justify-center gap-1.5 font-semibold text-xs py-2 px-3 rounded-xl border transition shrink-0 active:scale-95 ${
            isCopied
              ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
              : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:border-slate-300"
          }`}
          title="Share location link and current availability status"
        >
          {isCopied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Share2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Share</span>
            </>
          )}
        </button>

        {facility.hasLiveCam && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewCamera();
            }}
            id={`btn-cam-${facility.id}`}
            className="flex items-center justify-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold text-xs py-2 px-2.5 rounded-xl transition shrink-0"
            title="Inspect Live Approach Camera"
          >
            <Camera className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Cam</span>
          </button>
        )}
      </div>
    </div>
  );
};

