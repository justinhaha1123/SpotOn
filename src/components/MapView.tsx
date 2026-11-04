import React, { Component, useState, useEffect, useLayoutEffect, useRef, useMemo, lazy, Suspense } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  Polyline,
  useMap,
  ColorScheme,
} from "@vis.gl/react-google-maps";
import { ParkingFacility, MapAreaSearch, OnStreetBay } from "../types";
import { firstUsableSecret } from "../utils/secrets";
import {
  Navigation,
  Camera,
  Zap,
  MapPin,
  RefreshCw,
  Search,
  X,
  Compass,
  Car,
  TrendingUp,
  Lock,
} from "lucide-react";
import { calculateDistanceKm, getEvChargingSpeed, formatRelativeTime, formatGbp } from "../utils";
import { catalogueFieldLabel, isUnverifiedCatalogue } from "../utils/catalogueNotes";
import { isIgnorableMapsTeardownError } from "../utils/mapsTeardown";

const OsmMapFallback = lazy(() => import("./OsmMapFallback").then((mod) => ({ default: mod.OsmMapFallback })));

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

const GOOGLE_REJECTED_BANNER =
  "Google rejected this Maps key for this site. Showing OpenStreetMap. Add this site to the key's HTTP referrer restrictions if you want the Google map.";

class MapErrorBoundary extends Component {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; onFail?: () => void }) {
    super(props);
    (this as unknown as { state: { hasError: boolean } }).state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn("Google map failed; showing OpenStreetMap.", error);
    const onFail = (this as unknown as { props: { onFail?: () => void } }).props.onFail;
    onFail?.();
  }

  render() {
    const view = this as unknown as {
      state: { hasError: boolean };
      props: { children: React.ReactNode; fallback: React.ReactNode };
    };
    if (view.state.hasError) return view.props.fallback;
    return view.props.children;
  }
}

interface MapViewProps {
  facilities: ParkingFacility[];
  selectedFacility: ParkingFacility | null;
  onSelectFacility: (facility: ParkingFacility | null) => void;
  onNavigateToFacility: (facility: ParkingFacility) => void;
  onOpenLiveCamera: (facility: ParkingFacility) => void;
  onUpdateLiveSpaces?: (facility: ParkingFacility) => void;
  isLoggedIn?: boolean;
  userLocation: { lat: number; lng: number } | null;
  routeCoordinates: [number, number][] | null;
  vehiclePosition: [number, number] | null;
  isNavigating: boolean;
  showTflCameras: boolean;
  onToggleTflCameras: () => void;
  activeSearchArea?: MapAreaSearch | null;
  onSearchArea?: (area: MapAreaSearch) => void;
  onClearSearchArea?: () => void;
  searchAreaCategory?: "all" | "driveways" | "off_street" | "car_parks";
  onSearchAreaCategoryChange?: (
    category: "all" | "driveways" | "off_street" | "car_parks"
  ) => void;
  isDrivingMode?: boolean;
  nightMode?: boolean;
  heading?: number;
  onToggleDrivingMode?: () => void;
  apiKey?: string;
  onStreetBays?: OnStreetBay[];
  showOnStreet?: boolean;
  selectedOnStreetId?: string | null;
  onSelectOnStreet?: (bay: OnStreetBay) => void;
  mapsNotice?: string | null;
  locationIsGps?: boolean;
}

// Inner Google Map Controller Component to synchronize camera, vehicle & interactions
interface GoogleMapInnerProps {
  facilities: ParkingFacility[];
  selectedFacility: ParkingFacility | null;
  onSelectFacility: (facility: ParkingFacility | null) => void;
  onNavigateToFacility: (facility: ParkingFacility) => void;
  onOpenLiveCamera: (facility: ParkingFacility) => void;
  onUpdateLiveSpaces?: (facility: ParkingFacility) => void;
  isLoggedIn?: boolean;
  userLocation: { lat: number; lng: number } | null;
  routeCoordinates: [number, number][] | null;
  vehiclePosition: [number, number] | null;
  isNavigating: boolean;
  showTflCameras: boolean;
  onToggleTflCameras: () => void;
  activeSearchArea?: MapAreaSearch | null;
  onSearchArea?: (area: MapAreaSearch) => void;
  onClearSearchArea?: () => void;
  searchAreaCategory?: "all" | "driveways" | "off_street" | "car_parks";
  onSearchAreaCategoryChange?: (
    category: "all" | "driveways" | "off_street" | "car_parks"
  ) => void;
  isDrivingMode?: boolean;
  nightMode?: boolean;
  heading?: number;
  onToggleDrivingMode?: () => void;
  onStreetBays?: OnStreetBay[];
  showOnStreet?: boolean;
  selectedOnStreetId?: string | null;
  onSelectOnStreet?: (bay: OnStreetBay) => void;
  locationIsGps?: boolean;
}

const GoogleMapInner: React.FC<GoogleMapInnerProps> = ({
  facilities,
  selectedFacility,
  onSelectFacility,
  onNavigateToFacility,
  onOpenLiveCamera,
  onUpdateLiveSpaces,
  isLoggedIn,
  userLocation,
  routeCoordinates,
  vehiclePosition,
  isNavigating,
  showTflCameras,
  onToggleTflCameras,
  activeSearchArea,
  onSearchArea,
  onClearSearchArea,
  searchAreaCategory = "all",
  onSearchAreaCategoryChange,
  isDrivingMode = false,
  nightMode = false,
  heading = 0,
  onToggleDrivingMode,
  onStreetBays = [] as OnStreetBay[],
  showOnStreet = false,
  selectedOnStreetId = null,
  onSelectOnStreet,
  locationIsGps = false,
}) => {
  const map = useMap();
  const [hasMovedSinceSearch, setHasMovedSinceSearch] = useState(false);
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const lastSearchedCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  // Recenter on user
  const handleRecenterUser = () => {
    if (!map || !userLocation) return;
    map.panTo({ lat: userLocation.lat, lng: userLocation.lng });
    map.setZoom(15);
    if (isDrivingMode) {
      map.setHeading(heading || 0);
      map.setTilt(45);
    } else {
      map.setHeading(0);
      map.setTilt(0);
    }
  };

  // Convert route coordinates to LatLngLiteral array
  const routePath = useMemo(() => {
    if (!routeCoordinates || routeCoordinates.length === 0) return [];
    return routeCoordinates.map((coord) => ({ lat: coord[0], lng: coord[1] }));
  }, [routeCoordinates]);

  // Driving mode dynamic camera tracking
  useEffect(() => {
    if (!map) return;

    if (vehiclePosition && isNavigating && isDrivingMode) {
      map.panTo({ lat: vehiclePosition[0], lng: vehiclePosition[1] });
      map.setHeading(heading || 0);
      map.setTilt(45);
    } else if (!isDrivingMode && map.getTilt() !== 0) {
      map.setTilt(0);
      map.setHeading(0);
    }
  }, [map, vehiclePosition, isNavigating, isDrivingMode, heading]);

  // Fit bounds when route appears
  useEffect(() => {
    if (!map || !routeCoordinates || routeCoordinates.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    routeCoordinates.forEach((c) => bounds.extend({ lat: c[0], lng: c[1] }));
    map.fitBounds(bounds, { top: 60, right: 60, bottom: 120, left: 60 });
  }, [map, routeCoordinates]);

  // "Search this area" trigger on pan/zoom
  useEffect(() => {
    if (!map) return;

    const listener = map.addListener("idle", () => {
      const center = map.getCenter();
      if (!center) return;
      const current = { lat: center.lat(), lng: center.lng() };

      if (lastSearchedCenterRef.current) {
        const dist = calculateDistanceKm(
          lastSearchedCenterRef.current.lat,
          lastSearchedCenterRef.current.lng,
          current.lat,
          current.lng
        );
        if (dist > 0.3) {
          setHasMovedSinceSearch(true);
        }
      } else {
        setHasMovedSinceSearch(true);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map]);

  const handleSearchCurrentBounds = () => {
    if (!map || !onSearchArea) return;
    setIsSearchingArea(true);
    const bounds = map.getBounds();
    const center = map.getCenter();

    if (bounds && center) {
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const radiusKm = calculateDistanceKm(sw.lat(), sw.lng(), ne.lat(), ne.lng()) / 2;

      lastSearchedCenterRef.current = { lat: center.lat(), lng: center.lng() };
      setHasMovedSinceSearch(false);

      onSearchArea({
        center: { lat: center.lat(), lng: center.lng() },
        radiusKm: Math.max(0.4, Number(radiusKm.toFixed(2))),
        bounds: {
          north: ne.lat(),
          south: sw.lat(),
          east: ne.lng(),
          west: sw.lng(),
        },
      });
    }

    setTimeout(() => {
      setIsSearchingArea(false);
    }, 400);
  };

  // Facility category styling helper
  const getBadgeStyle = (fac: ParkingFacility) => {
    let bg = "bg-blue-600";
    let icon = "🅿️";

    if (fac.parkingCategory === "private_driveway") {
      bg = "bg-purple-600";
      icon = "🏡";
    } else if (fac.parkingCategory === "gated_mews") {
      bg = "bg-amber-600";
      icon = "🔑";
    } else if (fac.parkingCategory === "hotel_forecourt") {
      bg = "bg-indigo-600";
      icon = "🏢";
    } else if (fac.parkingCategory === "on_street_sensor") {
      bg = "bg-teal-600";
      icon = "🛣️";
    } else if (fac.parkingCategory === "designated_disabled_bay") {
      bg = "bg-blue-700";
      icon = "♿";
    } else if (fac.parkingCategory === "station_park_ride") {
      bg = "bg-rose-600";
      icon = "🚇";
    }

    return { bg, icon };
  };

  const areaFacilityStats = useMemo(() => {
    let liveSpaces = 0;
    let liveCount = 0;
    let driveways = 0;
    let offStreet = 0;
    let carParks = 0;

    facilities.forEach((f) => {
      if (f.confidence === "live" && f.availableSpaces != null) {
        liveSpaces += f.availableSpaces;
        liveCount++;
      }
      if (f.parkingCategory === "private_driveway") driveways++;
      else if (f.parkingCategory === "commercial_multistorey" || f.parkingCategory === "station_park_ride")
        carParks++;
      else offStreet++;
    });

    return {
      total: facilities.length,
      liveSpaces,
      liveCount,
      driveways,
      offStreet,
      carParks,
    };
  }, [facilities]);

  const selectedSpeed = selectedFacility ? getEvChargingSpeed(selectedFacility) : null;

  return (
    <>
      {/* Route Polyline */}
      {routePath.length > 0 && (
        <Polyline
          path={routePath}
          strokeColor={isDrivingMode ? "#38bdf8" : "#2563eb"}
          strokeWeight={6}
          strokeOpacity={0.88}
        />
      )}

      {/* User Location Marker */}
      {userLocation && (
        <AdvancedMarker
          position={{ lat: userLocation.lat, lng: userLocation.lng }}
          title={locationIsGps ? "Your GPS position" : "Map centre, not your location"}
          zIndex={1000}
        >
          <div className="relative flex items-center justify-center w-8 h-8 pointer-events-none">
            <div className="absolute w-8 h-8 rounded-full bg-blue-500/30 animate-ping"></div>
            <div className="relative w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md flex items-center justify-center text-white">
              <div className="w-2 h-2 rounded-full bg-white"></div>
            </div>
          </div>
        </AdvancedMarker>
      )}

      {/* Vehicle Position Marker in Driving Navigation */}
      {vehiclePosition && (
        <AdvancedMarker
          position={{ lat: vehiclePosition[0], lng: vehiclePosition[1] }}
          title="Vehicle Position"
          zIndex={1500}
        >
          <div
            className="relative flex items-center justify-center w-12 h-12 transition-transform duration-300"
            style={{ transform: `rotate(${heading || 0}deg)` }}
          >
            <div
              className={`absolute w-12 h-12 rounded-full ${
                isDrivingMode ? "bg-emerald-400/30" : "bg-blue-500/25"
              } animate-ping`}
            ></div>
            <div className="absolute -top-1 w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-md animate-pulse"></div>
            <div
              className={`relative w-8 h-8 rounded-full ${
                isDrivingMode
                  ? "bg-emerald-950 border-2 border-emerald-400 text-emerald-300"
                  : "bg-slate-900 border-2 border-white text-white"
              } shadow-2xl flex items-center justify-center`}
            >
              <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="12 2 19 21 12 17 5 21 12 2" />
              </svg>
            </div>
          </div>
        </AdvancedMarker>
      )}

      {/* Facilities Markers */}
      {facilities.map((fac) => {
        const isSelected = selectedFacility?.id === fac.id;
        const { bg, icon } = getBadgeStyle(fac);
        const evSpeed = getEvChargingSpeed(fac);

        return (
          <AdvancedMarker
            key={fac.id}
            position={{ lat: fac.lat, lng: fac.lng }}
            onClick={() => onSelectFacility(fac)}
            title={fac.name}
            zIndex={isSelected ? 600 : 200}
          >
            <div
              className={`group cursor-pointer transition-all duration-200 transform hover:-translate-y-1 ${
                isSelected ? "scale-110 ring-4 ring-blue-500 ring-offset-2 rounded-full" : ""
              }`}
            >
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${bg} text-white shadow-lg border border-white/90`}
              >
                <span className="text-xs">{icon}</span>
                <span className="font-bold text-xs truncate max-w-[110px]">{fac.name}</span>
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{
                    backgroundColor:
                      fac.confidence === "live" && fac.availableSpaces != null
                        ? fac.availableSpaces <= 0
                          ? "#e11d48"
                          : fac.availableSpaces <= 10
                            ? "#d97706"
                            : "#059669"
                        : "#94a3b8",
                  }}
                  title={
                    fac.confidence === "live" && fac.availableSpaces != null
                      ? `${fac.availableSpaces} free`
                      : "No live space count"
                  }
                />
                {fac.hasFastCharger && (
                  <span className="w-2 h-2 rounded-full bg-amber-300 shadow-xs animate-pulse" title="Fast Charging"></span>
                )}
              </div>
              <div className="w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-6 border-t-slate-800 mx-auto -mt-[1px]"></div>
            </div>
          </AdvancedMarker>
        );
      })}

      {showOnStreet &&
        onStreetBays.map((bay) => (
          <AdvancedMarker
            key={bay.id}
            position={{ lat: bay.lat, lng: bay.lng }}
            onClick={() => onSelectOnStreet?.(bay)}
            title={`${bay.roadName} — restriction, not a free-space count`}
            zIndex={selectedOnStreetId === bay.id ? 500 : 120}
          >
            <div
              className={`w-3 h-3 rounded-full border-2 border-teal-800 bg-teal-200 shadow ${
                selectedOnStreetId === bay.id ? "scale-125 ring-2 ring-teal-500" : ""
              }`}
            />
          </AdvancedMarker>
        ))}

      {/* TfL Traffic Camera Markers */}
      {showTflCameras &&
        facilities
          .filter((f) => f.hasLiveCam && f.nearestTflJamCam)
          .map((fac) => {
            const cam = fac.nearestTflJamCam!;
            if (typeof cam.lat !== "number" || typeof cam.lng !== "number") return null;
            const camLat = cam.lat;
            const camLng = cam.lng;

            return (
              <AdvancedMarker
                key={`cam-${fac.id}`}
                position={{ lat: camLat, lng: camLng }}
                onClick={() => onOpenLiveCamera(fac)}
                title={`TfL JamCam: ${cam.name}`}
                zIndex={400}
              >
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 border-2 border-amber-400 shadow-md text-white hover:scale-110 transition cursor-pointer">
                  <Camera className="w-3.5 h-3.5 text-amber-300" />
                </div>
              </AdvancedMarker>
            );
          })}

      {/* Selected Facility InfoWindow */}
      {selectedFacility && (
        <InfoWindow
          position={{ lat: selectedFacility.lat, lng: selectedFacility.lng }}
          onCloseClick={() => onSelectFacility(null)}
          headerDisabled={true}
        >
          <div className="p-3 text-slate-800 text-sm max-w-[280px]">
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {selectedFacility.categoryLabel || "Off-Street Parking"}
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {selectedFacility.borough}
              </span>
            </div>
            <div className="font-bold text-base text-slate-900 leading-tight">
              {selectedFacility.name}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{selectedFacility.address}</div>

            {selectedFacility.spaceDimensions && (
              <div className="text-[11px] text-slate-600 bg-slate-50 px-2 py-1 rounded mt-1.5 border border-slate-100 font-medium">
                {selectedFacility.spaceDimensions}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 my-2 p-2 bg-slate-50 rounded-lg border border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 block">Available</span>
                {selectedFacility.availableSpaces == null ? (
                  <span className="text-sm font-semibold text-slate-500">
                    No live data
                  </span>
                ) : selectedFacility.availableSpaces > 0 ? (
                  <span className="text-base font-extrabold text-emerald-600">
                    {selectedFacility.availableSpaces} spaces free
                    {selectedFacility.totalSpaces != null && (
                      <span className="text-xs font-normal text-slate-400 block">
                        of {selectedFacility.totalSpaces} total
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-base font-extrabold text-rose-600">
                    Full
                  </span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">Tariff</span>
                <span className="text-xs font-bold text-slate-700">
                  {formatGbp(selectedFacility.hourlyRate)
                    ? `${formatGbp(selectedFacility.hourlyRate)}/hr`
                    : (formatGbp(selectedFacility.dailyRate)
                      ? `${formatGbp(selectedFacility.dailyRate)}/day`
                      : "Rate unknown")}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[10px] text-slate-600 mb-2 flex-wrap">
              {(selectedFacility.evChargingBays ?? 0) > 0 && selectedSpeed && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    selectedSpeed.published && selectedSpeed.isFast
                      ? "bg-amber-50 text-amber-900 border border-amber-200 font-bold"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium"
                  } px-1.5 py-0.5 rounded`}
                >
                  ⚡ {selectedFacility.evChargingBays} EV ({selectedSpeed.published ? selectedSpeed.label : "speed not published"})
                </span>
              )}
              {selectedFacility.evChargingBays == null && (
                <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">
                  EV: unknown
                </span>
              )}
              <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                Clearance {selectedFacility.heightRestriction != null ? `${selectedFacility.heightRestriction}m` : "unknown"}
              </span>
            </div>

            {selectedFacility.accessInstructions && (
              <div className="text-[10px] text-slate-600 bg-amber-50/70 p-1.5 rounded mb-2 border border-amber-200/60 leading-tight">
                <span className="font-semibold block">
                  {catalogueFieldLabel(selectedFacility, "Access")}
                </span>
                {selectedFacility.accessInstructions}
              </div>
            )}
            {selectedFacility.securityType && (
              <div className="text-[10px] text-slate-600 bg-amber-50/70 p-1.5 rounded mb-2 border border-amber-200/60 leading-tight">
                {isUnverifiedCatalogue(selectedFacility) ? "Unverified catalogue note: " : ""}
                Security: {selectedFacility.securityType}
              </div>
            )}

            {selectedFacility.lastCommunityUpdate && (
              <div className="text-[11px] text-slate-500 mb-2 truncate">
                User note: ~{selectedFacility.lastCommunityUpdate.newAvailable} spaces · {formatRelativeTime(selectedFacility.lastCommunityUpdate.submittedAt || selectedFacility.lastCommunityUpdate.updatedAt)} · this device only
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-2">
              <button
                onClick={() => onNavigateToFacility(selectedFacility)}
                className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2 px-2.5 rounded-lg shadow-sm transition"
              >
                <Navigation className="w-3.5 h-3.5" />
                Navigate to Spaces
              </button>
              {selectedFacility.confidence === "live" ? (
                <span className="text-[11px] text-slate-400 italic px-2 py-1 shrink-0">
                  Live TfL data – notes not needed
                </span>
              ) : onUpdateLiveSpaces && (
                <button
                  onClick={() => onUpdateLiveSpaces(selectedFacility)}
                  className={`flex items-center justify-center p-2 rounded-lg border transition ${
                    isLoggedIn
                      ? "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200"
                  }`}
                  title={
                    isLoggedIn
                      ? "Add a note about spaces"
                      : "Log in safely to add a note about spaces"
                  }
                >
                  {isLoggedIn ? (
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Lock className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              )}
              {selectedFacility.hasLiveCam && (
                <button
                  onClick={() => onOpenLiveCamera(selectedFacility)}
                  className="flex items-center justify-center p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg transition"
                  title="View Live TfL Approach Camera"
                >
                  <Camera className="w-4 h-4 text-amber-700" />
                </button>
              )}
            </div>
          </div>
        </InfoWindow>
      )}

      {/* Floating Search This Area Control */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 max-w-sm pointer-events-none">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSearchCurrentBounds}
            className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2 rounded-full shadow-lg text-xs font-semibold border transition cursor-pointer ${
              hasMovedSinceSearch
                ? "bg-blue-600 hover:bg-blue-700 text-white border-blue-500 ring-2 ring-blue-300 animate-bounce"
                : activeSearchArea
                ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500"
                : "bg-white/95 hover:bg-white text-slate-800 border-slate-200/90"
            }`}
          >
            <Search
              className={`w-4 h-4 shrink-0 ${
                hasMovedSinceSearch ? "text-white animate-pulse" : "text-blue-600"
              }`}
            />
            <span className="whitespace-nowrap font-bold">
              {hasMovedSinceSearch
                ? "Search this area"
                : activeSearchArea
                ? "Re-search here"
                : "Search here"}
            </span>
            {hasMovedSinceSearch && (
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full text-white font-medium uppercase tracking-tight">
                Map moved
              </span>
            )}
            {isSearchingArea && (
              <RefreshCw className="w-3.5 h-3.5 animate-spin ml-0.5 text-current" />
            )}
          </button>

          {activeSearchArea && onClearSearchArea && (
            <button
              onClick={onClearSearchArea}
              className="pointer-events-auto p-2.5 rounded-full bg-white/95 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/90 transition shadow-md cursor-pointer"
              title="Clear area filter / Show all London"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Quick Category & Count Sub-pill when an Area is actively searched */}
        {activeSearchArea && (
          <div className="pointer-events-auto w-full bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl p-2.5 shadow-md text-xs transition animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between gap-1 mb-1.5 px-1">
              <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5 truncate">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">
                  {areaFacilityStats.liveSpaces} live spaces in view ({areaFacilityStats.liveCount} of {areaFacilityStats.total} car parks report live data)
                </span>
              </span>
              {onClearSearchArea && (
                <button
                  onClick={onClearSearchArea}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline shrink-0"
                >
                  Show all London
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-0.5">
              {[
                { id: "all", label: "All Available", count: areaFacilityStats.total, icon: null },
                { id: "car_parks", label: "Car Parks", count: areaFacilityStats.carParks, icon: "🅿️" },
                { id: "driveways", label: "Driveways", count: areaFacilityStats.driveways, icon: "🏡" },
                { id: "off_street", label: "Off-Street", count: areaFacilityStats.offStreet, icon: "🔑" },
              ].map((cat) => {
                const isSelected = (searchAreaCategory || "all") === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => onSearchAreaCategoryChange?.(cat.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition flex items-center gap-1 shrink-0 cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {cat.icon && <span>{cat.icon}</span>}
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1 py-0.2 rounded-full font-bold ${
                        isSelected ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Floating Map Controls Top-Right */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        {onToggleDrivingMode && isNavigating && (
          <button
            onClick={onToggleDrivingMode}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-md text-xs font-bold border transition ${
              isDrivingMode
                ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-400/50"
                : "bg-white/95 backdrop-blur-sm text-slate-800 hover:text-emerald-700 border-slate-200"
            }`}
            title="Toggle Cockpit Driving Mode View"
          >
            <Car className={`w-4 h-4 ${isDrivingMode ? "text-white" : "text-emerald-600"}`} />
            <span>{isDrivingMode ? "Driving Mode On" : "Driving Mode"}</span>
          </button>
        )}

        <button
          onClick={handleRecenterUser}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/95 backdrop-blur-sm text-slate-700 hover:text-blue-600 font-semibold text-xs rounded-xl shadow-md border border-slate-200 hover:border-blue-300 transition"
          title="Recenter My Location"
        >
          <Compass className="w-4 h-4 text-blue-600" />
          <span>My Position</span>
        </button>

        <button
          onClick={onToggleTflCameras}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-md text-xs font-semibold border transition ${
            showTflCameras
              ? "bg-amber-500 text-white border-amber-600"
              : "bg-white/95 backdrop-blur-sm text-slate-700 hover:text-amber-600 border-slate-200"
          }`}
          title="Toggle London CCTV JamCams on Map"
        >
          <Camera className="w-4 h-4" />
          <span>{showTflCameras ? "TfL Cameras On" : "Show Cameras"}</span>
        </button>
      </div>

      {/* Map Legend Overlay. Marker colour is category; the dot is the only availability signal. */}
      <div className="absolute bottom-4 left-4 z-10 hidden sm:flex flex-wrap items-center gap-3 bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-xl shadow-sm border border-slate-200/80 text-[11px] text-slate-600 max-w-[90%]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span>Live, more than 10 free</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span>Live, 1–10 free</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span>Live, full</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
          <span>No live count</span>
        </div>
      </div>
    </>
  );
};

export const MapView: React.FC<MapViewProps> = (props) => {
  const {
    apiKey,
    userLocation,
    isDrivingMode = false,
    nightMode = false,
    isNavigating = false,
    facilities,
    onStreetBays = [] as OnStreetBay[],
    showOnStreet = false,
    selectedFacility,
    selectedOnStreetId = null,
    onSelectFacility,
    onSelectOnStreet,
    routeCoordinates,
    locationIsGps = false,
  } = props;

  const effectiveApiKey = firstUsableSecret(
    apiKey,
    (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY
  );
  const [googleRejected, setGoogleRejected] = useState(false);
  const [dropGoogle, setDropGoogle] = useState(false);

  useEffect(() => {
    if (!effectiveApiKey) return;
    const onWindowError = (event: ErrorEvent) => {
      if (!isIgnorableMapsTeardownError(String(event.message || ""), String(event.filename || ""))) return;
      event.preventDefault();
      setGoogleRejected(true);
    };
    window.addEventListener("error", onWindowError);
    return () => window.removeEventListener("error", onWindowError);
  }, [effectiveApiKey]);

  useLayoutEffect(() => {
    if (!effectiveApiKey) return;
    const previous = window.gm_authFailure;
    window.gm_authFailure = () => {
      // Let Google finish its own DOM updates before React removes the map.
      window.setTimeout(() => setGoogleRejected(true), 0);
    };
    return () => {
      window.gm_authFailure = previous;
    };
  }, [effectiveApiKey]);

  useEffect(() => {
    if (!googleRejected) return;
    const id = window.setTimeout(() => setDropGoogle(true), 500);
    return () => window.clearTimeout(id);
  }, [googleRejected]);

  const defaultCenter = userLocation
    ? { lat: userLocation.lat, lng: userLocation.lng }
    : { lat: 51.5115, lng: -0.128 };

  const osmBanner = !effectiveApiKey
    ? "Google Maps is not configured. This map is OpenStreetMap. Add VITE_GOOGLE_MAPS_API_KEY for the Google basemap and driving tilt. Turn-by-turn still uses the road router, with a Google Maps hand-off if that fails."
    : GOOGLE_REJECTED_BANNER;

  const osmMap = (
    <div className="relative w-full h-full min-h-[420px] overflow-hidden">
      <div className="absolute top-3 left-3 right-3 z-20 bg-slate-900/90 text-white text-xs rounded-xl px-3 py-2 shadow-lg max-w-xl" role="status">
        {osmBanner}
      </div>
      <Suspense fallback={<div className="absolute inset-0 bg-slate-100" role="status">Loading map…</div>}>
        <OsmMapFallback
          facilities={facilities}
          onStreetBays={onStreetBays}
          showOnStreet={showOnStreet}
          selectedFacility={selectedFacility}
          selectedOnStreetId={selectedOnStreetId}
          onSelectFacility={(facility) => onSelectFacility(facility)}
          onSelectOnStreet={(bay) => onSelectOnStreet?.(bay)}
          userLocation={userLocation}
          routeCoordinates={routeCoordinates}
          positionLabel={locationIsGps ? "Your GPS position" : "Map centre, not your location"}
        />
      </Suspense>
    </div>
  );

  if (!effectiveApiKey || dropGoogle) return osmMap;

  return (
    <div className="relative w-full h-full min-h-[420px] overflow-hidden">
      {googleRejected && <div className="absolute inset-0 z-10">{osmMap}</div>}
      <div className={googleRejected ? "h-0 overflow-hidden invisible pointer-events-none" : "h-full w-full"} aria-hidden={googleRejected || undefined}>
      <MapErrorBoundary fallback={null} onFail={() => window.setTimeout(() => setGoogleRejected(true), 0)}>
        <APIProvider
          apiKey={effectiveApiKey}
          libraries={["marker", "geometry", "places"]}
          onError={() => window.setTimeout(() => setGoogleRejected(true), 0)}
        >
          <Map
            id="main-google-parking-map"
            mapId="DEMO_MAP_ID"
            internalUsageAttributionIds={["gmp_mcp_codeassist_v1_aistudio"]}
            defaultCenter={defaultCenter}
            defaultZoom={14}
            gestureHandling="greedy"
            disableDefaultUI={false}
            colorScheme={
              nightMode || (isDrivingMode && isNavigating)
                ? ColorScheme.DARK
                : ColorScheme.LIGHT
            }
            className="w-full h-full"
          >
            {!googleRejected && <GoogleMapInner {...props} locationIsGps={locationIsGps} />}
          </Map>
        </APIProvider>
      </MapErrorBoundary>
      </div>
    </div>
  );
};
