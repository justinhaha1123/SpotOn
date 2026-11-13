import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  ParkingFacility,
  NavigationSession,
  FilterType,
  MapAreaSearch,
  VehicleProfile,
  VisitedParkingHistory,
  AppUser,
  CommunityLiveUpdate,
  OnStreetBay,
  OnStreetSourceStatus,
} from "./types";
import {
  calculateDistanceKm,
  calculateBearing,
  loadStoredVehicleProfile,
  saveStoredVehicleProfile,
  isSearchMatch,
  normalizeSearchTerm,
  compareFastChargingAvailability,
  getEvChargingSpeed,
  comparableHourly,
  loadStoredParkingHistory,
  saveStoredParkingHistory,
  SAMPLE_RECENT_PARKING_HISTORY,
} from "./utils";
import { matchesOpenNowFilter } from "./utils/parkingHours";
import { selectedPlaceLeftTheList } from "./utils/selectedPlace";
import { classifySecretCandidates, firstUsableSecret, mapsKeyBanner } from "./utils/secrets";
import {
  loadStoredUser,
  saveStoredUser,
  loadCommunityUpdates,
  saveCommunityUpdate,
} from "./utils/auth";
import { MapView } from "./components/MapView";
import { ParkingTimerBanner, ParkingTimerProvider } from "./components/ParkingTimer";
import { NavigationHUD } from "./components/NavigationHUD";
import { CameraModal } from "./components/CameraModal";
import { ParkingFacilityCard } from "./components/ParkingFacilityCard";
import { RecentParkingHistory } from "./components/RecentParkingHistory";

const AiParkingAdvisorModal = lazy(() =>
  import("./components/AiParkingAdvisorModal").then((mod) => ({ default: mod.AiParkingAdvisorModal }))
);
const VehicleProfileModal = lazy(() =>
  import("./components/VehicleProfileModal").then((mod) => ({ default: mod.VehicleProfileModal }))
);
const LoginModal = lazy(() =>
  import("./components/LoginModal").then((mod) => ({ default: mod.LoginModal }))
);
const UpdateLiveSpacesModal = lazy(() =>
  import("./components/UpdateLiveSpacesModal").then((mod) => ({ default: mod.UpdateLiveSpacesModal }))
);
import { OnStreetBayCard } from "./components/OnStreetBayCard";
import { DriverReportBar } from "./components/DriverReportBar";
import type { DriverReportSummary } from "./server/reports/logic";
import {
  Navigation,
  Camera,
  Compass,
  Search,
  SlidersHorizontal,
  Zap,
  ShieldCheck,
  Sparkles,
  MapPin,
  RefreshCw,
  Clock,
  Layers,
  List,
  Map as MapIcon,
  Car,
  AlertCircle,
  ChevronDown,
  Check,
  X,
  Filter,
  History,
  Lock,
  LogIn,
  UserCheck,
  ExternalLink,
  Info,
} from "lucide-react";

export default function App() {
  const [facilities, setFacilities] = useState<ParkingFacility[]>([]);
  const [selectedFacility, setSelectedFacility] = useState<ParkingFacility | null>(null);
  const [inspectionFacility, setInspectionFacility] = useState<ParkingFacility | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [occupancySource, setOccupancySource] = useState<"tfl-live" | "unavailable" | null>(null);
  const [occupancyDetail, setOccupancyDetail] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [maxHourly, setMaxHourly] = useState<number | null>(null);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [onStreetBays, setOnStreetBays] = useState<OnStreetBay[]>([]);
  const [onStreetNote, setOnStreetNote] = useState("");
  const [onStreetSources, setOnStreetSources] = useState<OnStreetSourceStatus[]>([]);
  const [onStreetStatus, setOnStreetStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedBayId, setSelectedBayId] = useState<string | null>(null);
  const [showOnStreetOnMap, setShowOnStreetOnMap] = useState(true);
  const [driverReports, setDriverReports] = useState<Record<string, DriverReportSummary>>({});
  const [reportsOnly, setReportsOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState<"distance" | "spaces" | "price" | "fast_charging">("distance");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [carFocus, setCarFocus] = useState<{ lat: number; lng: number; token: number } | null>(null);
  const [showTflCameras, setShowTflCameras] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Safe User Login & Live Space Updating State
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => loadStoredUser());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [loginContextMsg, setLoginContextMsg] = useState("");
  const [updatingFacility, setUpdatingFacility] = useState<ParkingFacility | null>(null);
  const [communityToast, setCommunityToast] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<{
    message: string;
    googleMapsUrl: string;
    facility: ParkingFacility;
  } | null>(null);

  // Clear routeError whenever the selected facility changes
  useEffect(() => {
    setRouteError(null);
  }, [selectedFacility]);

  // Handler to initiate live space reporting
  const handleOpenLiveUpdate = (facility: ParkingFacility) => {
    if (facility.confidence === "live") {
      return;
    }
    if (!currentUser) {
      setLoginContextMsg(
        `Please log in to add a note about spaces at ${facility.name}.`
      );
      setIsLoginModalOpen(true);
      return;
    }
    setUpdatingFacility(facility);
  };

  // Handler to submit live space update
  const handleSubmitLiveUpdate = (
    facilityId: string,
    newAvailableSpaces: number,
    extra: {
      evBaysAvailable?: number;
      disabledBaysAvailable?: number;
      notes?: string;
    }
  ) => {
    if (!currentUser) return;

    const nowIso = new Date().toISOString();
    const updateInfo: CommunityLiveUpdate = {
      userId: currentUser.id,
      userName: currentUser.name,
      updatedAt: nowIso,
      submittedAt: nowIso,
      previousAvailable: 0,
      newAvailable: newAvailableSpaces,
      evBaysAvailable: extra.evBaysAvailable,
      disabledBaysAvailable: extra.disabledBaysAvailable,
      notes: extra.notes,
    };

    saveCommunityUpdate(facilityId, updateInfo);

    const updatedUser: AppUser = {
      ...currentUser,
      updatesCount: (currentUser.updatesCount || 0) + 1,
    };
    setCurrentUser(updatedUser);
    saveStoredUser(updatedUser);

    setFacilities((prev) =>
      prev.map((fac) => {
        if (fac.id !== facilityId) return fac;
        return {
          ...fac,
          lastCommunityUpdate: updateInfo,
        };
      })
    );

    setCommunityToast(
      `Saved on this browser only: you noted about ${newAvailableSpaces} spaces. Other drivers cannot see it, and it is not a live feed.`
    );
    setTimeout(() => setCommunityToast(null), 5000);
  };

  // Recent Parking History State (Last 5 visited car parks, persisted in localStorage)
  const [recentHistory, setRecentHistory] = useState<VisitedParkingHistory[]>(() =>
    loadStoredParkingHistory()
  );

  const handleClearHistory = () => {
    setRecentHistory([]);
    saveStoredParkingHistory([]);
  };

  const handleRemoveHistoryItem = (id: string) => {
    setRecentHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveStoredParkingHistory(updated);
      return updated;
    });
  };

  const handleSeedSampleHistory = () => {
    setRecentHistory(SAMPLE_RECENT_PARKING_HISTORY);
    saveStoredParkingHistory(SAMPLE_RECENT_PARKING_HISTORY);
  };

  // Google Maps API Key (Active in background for vector maps & driving navigation)
  const [apiKey, setApiKey] = useState<string>(() => {
    return firstUsableSecret(
      (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY,
      localStorage.getItem("GOOGLE_MAPS_API_KEY")
    );
  });
  const [mapsMessage, setMapsMessage] = useState<string | null>(
    "Checking whether a Google Maps key is configured…"
  );

  // Sync API Key from server if needed. A placeholder is rejected, which is different from a missing key.
  useEffect(() => {
    const localStatus = classifySecretCandidates(
      (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY,
      localStorage.getItem("GOOGLE_MAPS_API_KEY")
    );
    fetch("/api/config")
      .then((r) => {
        const ct = r.headers.get("content-type") || "";
        if (!r.ok || !ct.includes("application/json")) return null;
        return r.json();
      })
      .then((data) => {
        const serverKey = firstUsableSecret(data?.googleMapsApiKey);
        if (serverKey) setApiKey(serverKey);
        const serverStatus = data?.mapsKeyStatus === "rejected" || data?.mapsKeyStatus === "usable" || data?.mapsKeyStatus === "missing"
          ? data.mapsKeyStatus
          : "missing";
        const status = serverKey || apiKey
          ? "usable"
          : localStatus === "rejected" || serverStatus === "rejected"
            ? "rejected"
            : "missing";
        setMapsMessage(mapsKeyBanner(status));
      })
      .catch(() => {
        setMapsMessage(apiKey ? null : mapsKeyBanner(localStatus));
      });
  }, [apiKey]);

  // Vehicle Profile State
  const [vehicleProfile, setVehicleProfile] = useState<VehicleProfile>(() =>
    loadStoredVehicleProfile()
  );
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);

  // Active Map "Search Here" Spatial Filter State
  const [activeSearchArea, setActiveSearchArea] = useState<MapAreaSearch | null>(null);
  const [searchAreaCategory, setSearchAreaCategory] = useState<
    "all" | "driveways" | "off_street" | "car_parks"
  >("all");

  // User location (Default: London West End near Piccadilly / Leicester Square)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number }>({
    lat: 51.5115,
    lng: -0.128,
  });
  const [locationIsGps, setLocationIsGps] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // Navigation State
  const [navSession, setNavSession] = useState<NavigationSession | null>(null);
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);
  const navWatchIdRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  // Fetch parking facilities
  const fetchFacilities = async (showLoadingIndicator = true, retryAttempt = 0): Promise<void> => {
    if (retryAttempt === 0 && inFlightRef.current) return;
    inFlightRef.current = true;
    if (showLoadingIndicator && retryAttempt === 0) setIsRefreshing(true);
    let scheduledRetry = false;
    const scheduleRetry = (delayMs: number, nextAttempt: number) => {
      if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        fetchFacilities(showLoadingIndicator, nextAttempt);
      }, delayMs);
    };
    try {
      const url = `/api/parking?lat=${userLocation.lat}&lng=${userLocation.lng}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const contentType = res.headers.get("content-type") || "";

      if (!res.ok || !contentType.includes("application/json")) {
        if (retryAttempt < 3) {
          scheduledRetry = true;
          scheduleRetry(1500 * (retryAttempt + 1), retryAttempt + 1);
          return;
        }
        throw new Error(`Unexpected response from /api/parking (HTTP ${res.status}, content-type: ${contentType || "unknown"})`);
      }

      const data = await res.json();
      if (data.success && Array.isArray(data.carParks)) {
        setLoadError(null);
        const communityUpdates = loadCommunityUpdates();
        const merged = data.carParks.map((fac: ParkingFacility) => {
          const commUpdate = communityUpdates[fac.id];
          if (commUpdate) {
            return {
              ...fac,
              lastCommunityUpdate: commUpdate,
            };
          }
          return fac;
        });

        setFacilities(merged);
        if (data.meta?.occupancySource) {
          setOccupancySource(data.meta.occupancySource);
        }
        if (data.meta?.lastOccupancyError?.status) {
          setOccupancyDetail(`TfL /Occupancy/CarPark returned HTTP ${data.meta.lastOccupancyError.status}.`);
        } else if (data.meta?.occupancySource === "tfl-live") {
          setOccupancyDetail(null);
        }
        if (data.meta?.tflWarmupComplete === false) {
          if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            fetchFacilities(false, 0);
          }, 3000);
        }
        if (!selectedFacility && merged.length > 0) {
          setSelectedFacility(merged[0]);
        }
      }
    } catch (err) {
      if (retryAttempt < 3) {
        scheduledRetry = true;
        scheduleRetry(1500 * (retryAttempt + 1), retryAttempt + 1);
        return;
      }
      console.error("Failed to load facilities:", err);
      setLoadError(err instanceof Error ? err.message : "Could not load car parks");
    } finally {
      if (!scheduledRetry) {
        inFlightRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Initial load
  useEffect(() => {
    fetchFacilities();
    // Auto-refresh occupancy every 25 seconds for real-time live data
    const interval = setInterval(() => {
      fetchFacilities(false);
    }, 25000);
    return () => {
      clearInterval(interval);
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      inFlightRef.current = false;
    };
  }, [userLocation]);

  useEffect(() => {
    let cancelled = false;
    setOnStreetStatus("loading");
    const url = `/api/on-street?lat=${userLocation.lat}&lng=${userLocation.lng}&radiusM=900`;
    fetch(url, { headers: { Accept: "application/json" } })
      .then(async (res) => {
        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          throw new Error(`Unexpected response from /api/on-street (HTTP ${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setOnStreetBays(Array.isArray(data?.bays) ? data.bays : []);
        setOnStreetNote(typeof data?.note === "string" ? data.note : "");
        setOnStreetSources(Array.isArray(data?.sources) ? data.sources : []);
        setOnStreetStatus("ready");
        const osmLate = Array.isArray(data?.sources) && data.sources.some(
          (source: OnStreetSourceStatus) => source.id === "openstreetmap" && source.status === "unavailable"
        );
        if (osmLate) {
          window.setTimeout(() => {
            if (cancelled) return;
            fetch(url, { headers: { Accept: "application/json" } })
              .then((retry) => retry.json())
              .then((retryData) => {
                if (cancelled || !Array.isArray(retryData?.bays)) return;
                setOnStreetBays(retryData.bays);
                setOnStreetSources(Array.isArray(retryData.sources) ? retryData.sources : []);
                if (typeof retryData.note === "string") setOnStreetNote(retryData.note);
              })
              .catch(() => {});
          }, 8000);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load on-street restrictions:", err);
        setOnStreetBays([]);
        setOnStreetNote("On-street restriction feeds could not be loaded. There is still no live free-bay count.");
        setOnStreetSources([]);
        setOnStreetStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userLocation]);

  const refreshDriverReports = async () => {
    try {
      const response = await fetch(
        `/api/reports?lat=${userLocation.lat}&lng=${userLocation.lng}&radiusM=8000`,
        { headers: { Accept: "application/json" } }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.summaries)) return;
      const next: Record<string, DriverReportSummary> = {};
      for (const summary of data.summaries as DriverReportSummary[]) next[summary.facilityId] = summary;
      setDriverReports(next);
    } catch {
      // Reports are optional. The catalogue still loads without them.
    }
  };

  useEffect(() => {
    refreshDriverReports();
    const interval = window.setInterval(refreshDriverReports, 45000);
    return () => window.clearInterval(interval);
  }, [userLocation]);

  // Handle browser Geolocation
  const handleGetLiveLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        setLocationIsGps(true);
        const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(newLoc);
      },
      (err) => {
        setIsLocating(false);
        console.warn("Geolocation denied/failed, keeping London coordinates:", err);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // One-click: Navigate Directly to the Nearest Empty Space
  const handleNavigateToNearestEmptySpace = async () => {
    if (facilities.length === 0) return;

    // Find nearest facility with live confirmed spaces > 0
    const availableFacilities = facilities.filter(
      (f) => f.confidence === "live" && f.availableSpaces != null && f.availableSpaces > 0
    );
    const sorted = [...availableFacilities].sort(
      (a, b) => (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999)
    );

    const target = sorted[0];
    if (target) {
      handleStartNavigation(target);
    } else {
      setCommunityToast("No car park with confirmed free spaces nearby");
      setTimeout(() => setCommunityToast(null), 4000);
    }
  };

  // Start Navigation to a specific car park
  const handleStartNavigation = async (facility: ParkingFacility) => {
    setRouteError(null);
    setSelectedFacility(facility);

    // Record into Recent Parking History (last 5 visited car parks)
    setRecentHistory((prev) => {
      const filtered = prev.filter((item) => item.id !== facility.id);
      const newEntry: VisitedParkingHistory = {
        id: facility.id,
        name: facility.name,
        address: facility.address,
        postcode: facility.postcode,
        hourlyRate: facility.hourlyRate,
        categoryLabel: facility.categoryLabel,
        lat: facility.lat,
        lng: facility.lng,
        visitedAt: new Date().toISOString(),
      };
      const updated = [newEntry, ...filtered].slice(0, 5);
      saveStoredParkingHistory(updated);
      return updated;
    });

    const fallbackMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}&travelmode=driving`;

    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: userLocation,
          destination: { lat: facility.lat, lng: facility.lng },
          facilityId: facility.id,
        }),
      });
      const contentType = res.headers.get("content-type") || "";
      const routeData = contentType.includes("application/json") ? await res.json() : null;

      if (
        !res.ok ||
        !routeData?.success ||
        !routeData.coordinates ||
        routeData.coordinates.length < 2 ||
        !routeData.steps ||
        routeData.steps.length === 0
      ) {
        setRouteError({
          message: routeData?.message || "Routing unavailable",
          googleMapsUrl: routeData?.googleMapsUrl || fallbackMapsUrl,
          facility,
        });
        return;
      }

      setRouteCoordinates(routeData.coordinates);

      const now = new Date();
      now.setMinutes(now.getMinutes() + routeData.durationMinutes);
      const etaString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const firstPt = routeData.coordinates[0] || [userLocation.lat, userLocation.lng];
      const secondPt = routeData.coordinates[1] || firstPt;
      const initialHeading = calculateBearing(firstPt[0], firstPt[1], secondPt[0], secondPt[1]);

      setNavSession({
        sessionId: String(Date.now()),
        facility,
        coordinates: routeData.coordinates,
        steps: routeData.steps || [],
        currentStepIndex: 0,
        distanceKm: routeData.distanceKm,
        durationMinutes: routeData.durationMinutes,
        eta: `Approx. ${etaString}`,
        currentVehiclePos: firstPt,
        speedKmh: null,
        heading: initialHeading,
        offRoute: false,
        arrived: false,
        locationError: null,
        voiceAnnouncementsEnabled: true,
        isDrivingMode: true,
        nightMode: false,
      });

      // Switch to map view on mobile when navigating
      setMobileView("map");
    } catch (err) {
      console.error("Failed to generate navigation route:", err);
      setRouteError({
        message: "Could not reach the routing service",
        googleMapsUrl: fallbackMapsUrl,
        facility,
      });
    }
  };

  // Turn-by-turn Geolocation Watch Position effect
  useEffect(() => {
    if (!navSession) return;

    if (!navigator.geolocation) {
      setNavSession((prev) =>
        prev
          ? {
              ...prev,
              locationError: "Geolocation not supported by browser",
            }
          : null
      );
      return;
    }

    const coords = navSession.coordinates;
    const steps = navSession.steps;

    // At session start build cumulativeMeters from steps[].distanceMeters
    // and map each step to a range of route coordinate indices
    let totalMeters = 0;
    const cumulativeMeters = steps.map((s) => {
      totalMeters += s.distanceMeters || 0;
      return totalMeters;
    });

    const stepIndexRanges: { startIdx: number; endIdx: number }[] = [];
    if (coords.length > 0 && steps.length > 0) {
      let currCoordDist = 0;
      const coordDistances: number[] = [0];
      for (let i = 1; i < coords.length; i++) {
        const d = calculateDistanceKm(
          coords[i - 1][0],
          coords[i - 1][1],
          coords[i][0],
          coords[i][1]
        ) * 1000;
        currCoordDist += d;
        coordDistances.push(currCoordDist);
      }

      let stepCursor = 0;
      let startIdx = 0;
      for (let s = 0; s < steps.length; s++) {
        const stepEndDist = cumulativeMeters[s];
        let endIdx = coords.length - 1;
        for (let i = startIdx; i < coords.length; i++) {
          if (coordDistances[i] >= stepEndDist) {
            endIdx = i;
            break;
          }
        }
        stepIndexRanges.push({ startIdx, endIdx: Math.max(startIdx, endIdx) });
        startIdx = Math.min(coords.length - 1, endIdx);
      }
    }

    let consecutiveOffRoute = 0;
    let prevFix: { lat: number; lng: number } | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, heading: rawHeading, speed } = position.coords;
        const currentFix: [number, number] = [latitude, longitude];

        // Heading determination
        let newHeading: number | null = null;
        if (typeof rawHeading === "number" && Number.isFinite(rawHeading)) {
          newHeading = rawHeading;
        } else if (prevFix) {
          newHeading = calculateBearing(prevFix.lat, prevFix.lng, latitude, longitude);
        }

        // Speed determination
        const speedKmh: number | null =
          typeof speed === "number" && Number.isFinite(speed) ? speed * 3.6 : null;

        // Find nearest route coordinate index and distance in meters
        let nearestIdx = 0;
        let minDistanceM = Infinity;
        for (let i = 0; i < coords.length; i++) {
          const distM = calculateDistanceKm(latitude, longitude, coords[i][0], coords[i][1]) * 1000;
          if (distM < minDistanceM) {
            minDistanceM = distM;
            nearestIdx = i;
          }
        }

        // Off-route check (> 100m for 3 consecutive fixes)
        if (minDistanceM > 100) {
          consecutiveOffRoute += 1;
        } else {
          consecutiveOffRoute = 0;
        }
        const isOffRoute = consecutiveOffRoute >= 3;

        // Arrival check (within 40 m of the destination)
        const destCoord = coords[coords.length - 1] || [navSession.facility.lat, navSession.facility.lng];
        const distToDestM = calculateDistanceKm(latitude, longitude, destCoord[0], destCoord[1]) * 1000;
        const isArrived = distToDestM <= 40;

        // Map to currentStepIndex whose range contains nearestIdx (never derived from elapsed time)
        let derivedStepIndex = 0;
        for (let s = 0; s < stepIndexRanges.length; s++) {
          const range = stepIndexRanges[s];
          if (nearestIdx >= range.startIdx && nearestIdx <= range.endIdx) {
            derivedStepIndex = s;
            break;
          }
          if (nearestIdx > range.endIdx) {
            derivedStepIndex = Math.min(steps.length - 1, s + 1);
          }
        }

        // Remaining distance calculation
        let remainingMeters = 0;
        if (derivedStepIndex < steps.length) {
          const currentStep = steps[derivedStepIndex];
          const range = stepIndexRanges[derivedStepIndex] || { startIdx: 0, endIdx: 1 };
          const stepTotalCoords = Math.max(1, range.endIdx - range.startIdx);
          const coordsIntoStep = Math.max(0, nearestIdx - range.startIdx);
          const fractionCompleted = Math.min(1, coordsIntoStep / stepTotalCoords);
          const currentStepRemainderMeters = Math.max(0, (currentStep.distanceMeters || 0) * (1 - fractionCompleted));

          let futureStepsMeters = 0;
          for (let s = derivedStepIndex + 1; s < steps.length; s++) {
            futureStepsMeters += steps[s].distanceMeters || 0;
          }
          remainingMeters = currentStepRemainderMeters + futureStepsMeters;
        }

        const remainingKm = Number((remainingMeters / 1000).toFixed(1));
        const durationMinutes = Math.ceil((remainingKm / 24) * 60 * 1.25);

        prevFix = { lat: latitude, lng: longitude };

        setNavSession((prev) =>
          prev
            ? {
                ...prev,
                currentVehiclePos: currentFix,
                heading: newHeading,
                speedKmh,
                currentStepIndex: derivedStepIndex,
                distanceKm: remainingKm,
                durationMinutes,
                offRoute: isOffRoute,
                arrived: isArrived,
                locationError: null,
              }
            : null
        );
      },
      (error) => {
        setNavSession((prev) =>
          prev
            ? {
                ...prev,
                locationError: error.message || "Location unavailable",
              }
            : null
        );
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 10000,
      }
    );

    navWatchIdRef.current = watchId;

    return () => {
      if (navWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(navWatchIdRef.current);
        navWatchIdRef.current = null;
      }
    };
  }, [navSession?.sessionId]);

  // End Navigation
  const handleEndNavigation = () => {
    if (navWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(navWatchIdRef.current);
      navWatchIdRef.current = null;
    }
    setNavSession(null);
    setRouteCoordinates(null);
  };

  // Handle spatial "Search Here" triggered from map
  const handleSearchArea = (area: MapAreaSearch) => {
    setActiveSearchArea(area);
    // Find matching facilities in this map bounding area
    const inArea = facilities.filter((fac) => {
      const inBounds =
        fac.lat >= area.bounds.south &&
        fac.lat <= area.bounds.north &&
        fac.lng >= area.bounds.west &&
        fac.lng <= area.bounds.east;
      const dist = calculateDistanceKm(
        area.center.lat,
        area.center.lng,
        fac.lat,
        fac.lng
      );
      return inBounds || dist <= Math.max(area.radiusKm, 1.2);
    });

    if (inArea.length > 0) {
      setSelectedFacility(inArea[0]);
    }
  };

  const handleClearSearchArea = () => {
    setActiveSearchArea(null);
    setSearchAreaCategory("all");
  };

  // Reference origin point for distance & drive time calculations
  const refPoint = activeSearchArea ? activeSearchArea.center : userLocation;

  // Helper predicates for the 4 core filter options: 1. Carpark, 2. Off Street, 3. EV charging spot, 4. Disable Bay
  const isCarparkFacility = (fac: ParkingFacility) => {
    const cat = fac.parkingCategory;
    const name = fac.name.toLowerCase();
    const label = (fac.categoryLabel || "").toLowerCase();
    const op = (fac.operator || "").toLowerCase();
    return (
      cat === "commercial_multistorey" ||
      cat === "station_park_ride" ||
      !cat ||
      name.includes("car park") ||
      name.includes("q-park") ||
      name.includes("ncp") ||
      name.includes("multi-storey") ||
      label.includes("car park") ||
      label.includes("multi-storey") ||
      op.includes("q-park") ||
      op.includes("ncp")
    );
  };

  const isOffStreetFacility = (fac: ParkingFacility) => {
    const cat = fac.parkingCategory;
    const label = (fac.categoryLabel || "").toLowerCase();
    const name = fac.name.toLowerCase();
    return (
      cat === "private_driveway" ||
      cat === "gated_mews" ||
      cat === "hotel_forecourt" ||
      label.includes("driveway") ||
      label.includes("mews") ||
      label.includes("forecourt") ||
      label.includes("off-street") ||
      name.includes("driveway") ||
      name.includes("mews") ||
      name.includes("forecourt")
    );
  };

  const isEvFacility = (fac: ParkingFacility) => {
    return (
      (fac.evChargingBays ?? 0) > 0 ||
      Boolean(fac.hasFastCharger) ||
      fac.hasEvCharging === true
    );
  };

  const isDisabledFacility = (fac: ParkingFacility) => {
    return (
      (fac.disabledBays ?? 0) > 0 ||
      fac.parkingCategory === "designated_disabled_bay" ||
      fac.name.toLowerCase().includes("disabled") ||
      (fac.categoryLabel || "").toLowerCase().includes("disabled")
    );
  };

  // Filter and sort facilities (dynamically recalculated relative to search area or user location)
  const filteredFacilities = facilities
    .map((fac) => {
      const distKm = calculateDistanceKm(refPoint.lat, refPoint.lng, fac.lat, fac.lng);
      const distMiles = Math.round(distKm * 0.621371 * 10) / 10;
      const driveMin = Math.max(2, Math.round((distKm / 24) * 60 + 3));
      return {
        ...fac,
        distanceFromUserKm: distKm,
        distanceFromUserMiles: distMiles,
        estimatedDriveTimeMin: driveMin,
      };
    })
    .filter((fac) => {
      // Spatial "Search Here" Map Area Filter
      if (activeSearchArea) {
        const { north, south, east, west } = activeSearchArea.bounds;
        const inBounds =
          fac.lat >= south && fac.lat <= north && fac.lng >= west && fac.lng <= east;
        const distToCenter = calculateDistanceKm(
          activeSearchArea.center.lat,
          activeSearchArea.center.lng,
          fac.lat,
          fac.lng
        );
        const inRadius = distToCenter <= Math.max(activeSearchArea.radiusKm, 1.2);

        if (!inBounds && !inRadius) {
          return false;
        }

        // Sub-category filter inside searched area
        if (searchAreaCategory === "driveways") {
          if (fac.parkingCategory !== "private_driveway") return false;
        } else if (searchAreaCategory === "car_parks") {
          if (
            fac.parkingCategory !== "commercial_multistorey" &&
            fac.parkingCategory !== "station_park_ride"
          ) {
            return false;
          }
        } else if (searchAreaCategory === "off_street") {
          if (
            fac.parkingCategory === "private_driveway" ||
            fac.parkingCategory === "commercial_multistorey" ||
            fac.parkingCategory === "station_park_ride"
          ) {
            return false;
          }
        }
      }

      // Search query filter (with fuzzy spelling, token matching, and London alias recognition)
      if (searchQuery.trim()) {
        if (!isSearchMatch(fac, searchQuery)) {
          return false;
        }
      }

      // Filter options: 1. Carpark, 2. Off Street, 3. EV charging spot, 4. Disable Bay
      if (activeFilter === "carpark") return isCarparkFacility(fac);
      if (activeFilter === "off_street") return isOffStreetFacility(fac);
      if (activeFilter === "ev") return isEvFacility(fac);
      if (activeFilter === "disabled") return isDisabledFacility(fac);

      if (activeFilter === "no_congestion_charge") {
        return fac.congestionChargeZone === false;
      }
      if (activeFilter === "disabled") {
        return fac.disabledBays > 0 || fac.parkingCategory === "designated_disabled_bay";
      }
      if (activeFilter === "private_driveways") return fac.parkingCategory === "private_driveway";
      if (activeFilter === "gated_mews") return fac.parkingCategory === "gated_mews";
      if (activeFilter === "hotel_forecourts") return fac.parkingCategory === "hotel_forecourt";
      if (activeFilter === "on_street_sensors") {
        return fac.parkingCategory === "on_street_sensor" || fac.parkingCategory === "designated_disabled_bay";
      }
      if (activeFilter === "commercial_car_parks") {
        return fac.parkingCategory === "commercial_multistorey" || !fac.parkingCategory;
      }
      if (activeFilter === "available") {
        return fac.confidence === "live" && fac.availableSpaces != null && fac.availableSpaces > 0;
      }
      if (activeFilter === "fast_charging") {
        const speed = fac.evChargingSpeedKw ?? getEvChargingSpeed(fac).kw;
        return ((fac.evChargingBays ?? 0) > 0) && (Boolean(fac.hasFastCharger) || speed >= 22);
      }
      if (activeFilter === "ev") return ((fac.evChargingBays ?? 0) > 0) || fac.hasEvCharging === true;
      if (activeFilter === "low_cost") {
        const rateNum = comparableHourly(fac);
        return rateNum != null && rateNum <= 5.0;
      }
      if (activeFilter === "high_clearance") {
        const heightNum = typeof fac.heightRestriction === "number" ? fac.heightRestriction : (fac.heightRestriction ? parseFloat(String(fac.heightRestriction).replace(/[^0-9.]/g, "")) : NaN);
        return !isNaN(heightNum) && heightNum >= 2.05;
      }
      if (fac.stillOperating === false && !searchQuery.trim()) return false;
      if (reportsOnly && (!driverReports[fac.id] || driverReports[fac.id].faded)) return false;
      if (maxDistanceKm != null && (fac.distanceFromUserKm ?? 999) > maxDistanceKm) return false;
      if (maxHourly != null) {
        const price = comparableHourly(fac);
        if (price == null || price > maxHourly) return false;
      }
      if (openNowOnly && (fac.stillOperating === false || !matchesOpenNowFilter(fac.openHours, true))) return false;
      return true;
    })
    .sort((a, b) => {
      // When 'Fast Charging Availability' filter is active OR user selects 'fast_charging' sorting:
      // Sort car parks by total EV bay count and charging speed capability
      if (activeFilter === "fast_charging" || sortBy === "fast_charging") {
        return compareFastChargingAvailability(a, b);
      }
      if (sortBy === "spaces") {
        if (a.availableSpaces == null) return 1;
        if (b.availableSpaces == null) return -1;
        return b.availableSpaces - a.availableSpaces;
      }
      if (sortBy === "price") {
        const rateA = comparableHourly(a) ?? 999;
        const rateB = comparableHourly(b) ?? 999;
        return rateA - rateB;
      }
      // default: distance from refPoint
      return (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999);
    });

  const visibleFacilityIds = filteredFacilities.map((facility) => facility.id);
  const shownFacility = selectedPlaceLeftTheList(selectedFacility?.id, visibleFacilityIds) ? null : selectedFacility;

  useEffect(() => {
    if (shownFacility !== selectedFacility) setSelectedFacility(null);
  }, [shownFacility, selectedFacility]);

  // Nearest empty facility for top quick banner (restricted to confidence === 'live' && availableSpaces > 0)
  const nearestFacility = [...facilities]
    .filter((f) => f.confidence === "live" && f.availableSpaces != null && f.availableSpaces > 0)
    .sort((a, b) => (a.distanceFromUserKm ?? 999) - (b.distanceFromUserKm ?? 999))[0];

  return (
    <ParkingTimerProvider onFindCar={(spot) => {
      setCarFocus({ lat: spot.lat, lng: spot.lng, token: Date.now() });
      setMobileView("map");
    }}>
    <div className="flex flex-col h-screen w-screen bg-slate-100 text-slate-900 overflow-hidden font-sans">
      {/* Top Header Navigation Bar */}
      <header className="bg-slate-900 text-white px-4 py-2.5 sm:px-6 shadow-md border-b border-slate-800 shrink-0 z-20">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Status */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-white shadow-md text-lg">
              P
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold tracking-tight text-white leading-tight">
                  SpotOn
                </h1>
                <span
                  className={`hidden md:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    occupancySource === "tfl-live"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-200 border-amber-500/30"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      occupancySource === "tfl-live" ? "bg-emerald-400 animate-pulse" : "bg-amber-300"
                    }`}
                  ></span>
                  {occupancySource === "tfl-live" ? "TfL LIVE COUNTS" : "LIVE COUNTS UNAVAILABLE"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                TfL station spaces when the occupancy feed is up, plus catalogue car parks and kerb rules
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* My Vehicle Profile Preset Button */}
            <button
              onClick={() => setIsVehicleModalOpen(true)}
              id="btn-header-vehicle-profile"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition"
              title="Manage Vehicle Profile, Registration & Height Clearance"
            >
              <Car className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <div className="flex items-center gap-1 font-mono font-bold text-xs text-amber-300">
                <span>{vehicleProfile.registrationPlate || "Set vehicle"}</span>
              </div>
              {vehicleProfile.heightMeters > 0 && (
                <span className="hidden sm:inline-block text-[10px] text-slate-400 font-sans">
                  {vehicleProfile.heightMeters.toFixed(2)}m
                </span>
              )}
              {vehicleProfile.vehicleType === "ev" && (
                <span className="text-emerald-400 text-xs" title="Electric Vehicle">⚡</span>
              )}
              {vehicleProfile.isBlueBadgeHolder && (
                <span className="text-blue-400 text-xs" title="Blue Badge Holder">♿</span>
              )}
            </button>

            {/* One-click Driving Mode Header Button */}
            {navSession ? (
              <button
                onClick={() =>
                  setNavSession((prev) =>
                    prev ? { ...prev, isDrivingMode: !prev.isDrivingMode } : null
                  )
                }
                id="btn-header-driving-mode"
                className={`flex items-center gap-1.5 font-bold text-xs sm:text-sm px-3 py-2 rounded-xl transition shadow-md border ${
                  navSession.isDrivingMode
                    ? "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 ring-2 ring-emerald-400/40"
                    : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700"
                }`}
                title="Toggle In-Car Driving Mode Cockpit"
              >
                <Car className="w-4 h-4 text-emerald-300" />
                <span className="hidden sm:inline">
                  {navSession.isDrivingMode ? "Driving Mode Active" : "Driving Mode"}
                </span>
              </button>
            ) : shownFacility ? (
              <button
                onClick={() => handleStartNavigation(shownFacility)}
                id="btn-header-driving-mode-start"
                className="flex items-center gap-1.5 font-bold text-xs sm:text-sm px-3 py-2 rounded-xl transition shadow-md bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700"
                title="Launch Driving Mode to Selected Car Park"
              >
                <Car className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Start Driving Mode</span>
              </button>
            ) : null}

            {/* Find Nearest Empty Space One-Tap Button */}
            <button
              onClick={handleNavigateToNearestEmptySpace}
              id="btn-header-find-nearest"
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm px-3.5 py-2 rounded-xl shadow-lg transition transform active:scale-95"
            >
              <Navigation className="w-4 h-4 fill-white" />
              <span>Nearest Empty Space</span>
            </button>

            {/* AI Parking Copilot */}
            <button
              onClick={() => setIsAiModalOpen(true)}
              id="btn-header-ai-copilot"
              className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-blue-300 text-xs font-semibold rounded-xl border border-slate-700 transition"
              title="Ask London Parking AI Advisor"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden md:inline">AI Advisor</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={() => fetchFacilities(true)}
              id="btn-header-refresh"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>

            {/* Safe Contributor Login / Profile Button on the Top Right Corner */}
            {currentUser ? (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                id="btn-header-user-profile"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/90 hover:bg-emerald-900 text-emerald-200 rounded-xl border border-emerald-500/60 shadow-md transition shrink-0 active:scale-95"
                title="Verified Contributor (All user login data stored safely)"
              >
                <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-bold text-xs text-white truncate max-w-[90px] sm:max-w-[120px]">
                  {currentUser.name}
                </span>
                <span className="hidden sm:inline-flex items-center gap-0.5 text-[10px] bg-emerald-800/90 text-emerald-100 px-1.5 py-0.2 rounded-full font-bold border border-emerald-500/40">
                  This browser
                </span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setLoginContextMsg("");
                  setIsLoginModalOpen(true);
                }}
                id="btn-header-login"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-md border border-blue-400/50 transition font-bold text-xs shrink-0 active:scale-95"
                title="Log In Safely — All user login data stored safely"
              >
                <LogIn className="w-4 h-4 text-white shrink-0" />
                <span>Name</span>
              </button>
            )}
          </div>
        </div>
      </header>
      <ParkingTimerBanner />

      {/* Non-blocking Occupancy Status Banner */}
      {occupancySource === "unavailable" && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-center gap-2 shrink-0" role="status">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Live TfL space counts are unavailable{occupancyDetail ? ` (${occupancyDetail})` : ""}. Capacity is shown. Missing numbers are not estimated.
          </span>
        </div>
      )}
      {mapsMessage && (
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 text-xs text-slate-100 flex items-center justify-center gap-2 shrink-0" role="status">
          <Info className="w-4 h-4 text-sky-300 shrink-0" />
          <span>{mapsMessage}</span>
        </div>
      )}

      {/* Main Content Area: Split View (Sidebar + Interactive Map) */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Mobile View Toggle Switcher */}
        <div className="md:hidden flex bg-white border-b border-slate-200 p-1.5 shrink-0">
          <button
            onClick={() => setMobileView("map")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              mobileView === "map"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <MapIcon className="w-4 h-4" />
            <span>Live Map</span>
          </button>
          <button
            onClick={() => setMobileView("list")}
            className={`flex-1 py-1.5 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
              mobileView === "list"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <List className="w-4 h-4" />
            <span>Spaces List ({filteredFacilities.length})</span>
          </button>
        </div>

        {/* Left Sidebar: Filters, Search, and Parking Facilities List */}
        <div
          className={`w-full md:w-[420px] lg:w-[460px] bg-white border-r border-slate-200 flex flex-col shrink-0 z-10 ${
            mobileView === "map" ? "hidden md:flex" : "flex"
          }`}
        >
          {/* Search & Location Bar */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3 shrink-0">
            {/* Quick Geolocation */}
            <div className="flex items-center justify-between text-xs">
              <button
                onClick={handleGetLiveLocation}
                id="btn-get-live-gps"
                className="flex items-center gap-1.5 text-blue-600 font-semibold hover:text-blue-800 transition"
              >
                <Compass className={`w-3.5 h-3.5 ${isLocating ? "animate-spin" : ""}`} />
                <span>{isLocating ? "Locating..." : "Use Current GPS"}</span>
              </button>
              <span className="text-[11px] text-slate-500 text-right">
                {locationIsGps ? "Using your GPS position" : "Map centre, not your location"}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <label htmlFor="parking-search" className="sr-only">
                Search car parks by name, street, postcode, or operator
              </label>
              <input
                id="parking-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, street, or postcode"
                aria-label="Search car parks by name, street, postcode, or operator"
                className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-16 py-2 text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-medium bg-slate-100 px-1.5 py-0.5 rounded"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Smart Spelling Correction Indicator */}
            {searchQuery.trim() &&
              normalizeSearchTerm(searchQuery) !== searchQuery.toLowerCase().trim() && (
                <div className="flex items-center gap-1.5 text-[11px] text-blue-700 bg-blue-50/90 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                  <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
                  <span>
                    Matched as <strong>&ldquo;{normalizeSearchTerm(searchQuery)}&rdquo;</strong> (spelling adjusted from &ldquo;{searchQuery}&rdquo;)
                  </span>
                </div>
              )}

            {/* Single Filter Bar: 1. Carpark, 2. Off Street, 3. EV charging spot, 4. Disable Bay */}
            <div className="pt-0.5 space-y-1.5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                {[
                  { id: "carpark" as FilterType, label: "Carpark", icon: "🏬" },
                  { id: "off_street" as FilterType, label: "Off Street", icon: "🏡" },
                  { id: "ev" as FilterType, label: "EV charging spot", icon: "⚡" },
                  { id: "disabled" as FilterType, label: "Disable Bay", icon: "♿" },
                  { id: "available" as FilterType, label: "Live spaces free", icon: "🟢" },
                ].map((item) => {
                  const isSelected = activeFilter === item.id;
                  const count = facilities.filter((fac) => {
                    if (item.id === "carpark") return isCarparkFacility(fac);
                    if (item.id === "off_street") return isOffStreetFacility(fac);
                    if (item.id === "ev") return isEvFacility(fac);
                    if (item.id === "disabled") return isDisabledFacility(fac);
                    if (item.id === "available")
                      return fac.confidence === "live" && fac.availableSpaces != null && fac.availableSpaces > 0;
                    return true;
                  }).length;

                  return (
                    <button
                      key={item.id}
                      id={`btn-filter-${item.id}`}
                      onClick={() => {
                        setActiveFilter(isSelected ? "all" : item.id);
                      }}
                      aria-pressed={isSelected}
                      className={`flex items-center justify-between gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold transition border shadow-2xs active:scale-95 text-left ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                          : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs shrink-0">{item.icon}</span>
                        <span className="truncate">{item.label}</span>
                      </div>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Active Filter Clear indicator if a filter is active */}
              {activeFilter !== "all" && (
                <div className="flex items-center justify-between text-xs pt-0.5 px-0.5 text-slate-500">
                  <span className="text-[11px]">
                    Filtered by: <strong className="text-blue-700 capitalize">
                      {activeFilter === "carpark"
                        ? "Carpark"
                        : activeFilter === "off_street"
                        ? "Off Street"
                        : activeFilter === "ev"
                        ? "EV charging spot"
                        : activeFilter === "disabled"
                        ? "Disable Bay"
                        : activeFilter === "available"
                        ? "Live spaces free"
                        : activeFilter}
                    </strong>
                  </span>
                  <button
                    onClick={() => setActiveFilter("all")}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Show all spaces
                  </button>
                </div>
              )}
            </div>

            {/* Sort & Count status */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <label className="inline-flex items-center gap-1">
                <span>Within</span>
                <select
                  aria-label="Maximum distance"
                  value={maxDistanceKm ?? ""}
                  onChange={(e) => setMaxDistanceKm(e.target.value ? Number(e.target.value) : null)}
                  className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 font-semibold text-slate-800"
                >
                  <option value="">Any distance</option>
                  <option value="1">1 km</option>
                  <option value="3">3 km</option>
                  <option value="8">8 km</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1">
                <span>Price</span>
                <select
                  aria-label="Maximum price"
                  value={maxHourly ?? ""}
                  onChange={(e) => setMaxHourly(e.target.value ? Number(e.target.value) : null)}
                  className="bg-white border border-slate-200 rounded-lg px-1.5 py-1 font-semibold text-slate-800"
                >
                  <option value="">Any listed price</option>
                  <option value="6">Up to £6/hr equivalent</option>
                  <option value="10">Up to £10/hr equivalent</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-1 font-semibold">
                <input
                  type="checkbox"
                  checked={openNowOnly}
                  onChange={(e) => setOpenNowOnly(e.target.checked)}
                />
                Open now
              </label>
              <label className="inline-flex items-center gap-1 font-semibold">
                <input
                  type="checkbox"
                  checked={reportsOnly}
                  onChange={(e) => setReportsOnly(e.target.checked)}
                />
                Has recent driver reports
              </label>
            </div>
            <p className="text-[10px] text-slate-400">
              Price filter uses the hourly rate, or the daily rate divided by 8 when no hourly rate is published. Unknown prices are hidden. Open now uses published car-park hours on a London clock.
            </p>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <span>
                Showing <strong className="text-slate-800">{filteredFacilities.length}</strong> car
                parks
              </span>

              <div className="flex items-center gap-1.5">
                <span>Sort:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent font-semibold text-slate-700 focus:outline-none cursor-pointer"
                >
                  <option value="distance">Nearest</option>
                  <option value="fast_charging">⚡ Fast Charging (Bays &amp; Speed)</option>
                  <option value="spaces">Most Empty Spaces</option>
                  <option value="price">Lowest Price</option>
                </select>
              </div>
            </div>
          </div>

          {/* Active Spatial Search Area Indicator */}
          {activeSearchArea && (
            <div className="px-4 py-2.5 bg-blue-50/90 border-b border-blue-200/80 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-900 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-600 shrink-0" />
                  MAP AREA SEARCH ACTIVE
                </span>
                <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
                  {filteredFacilities.length} parking spots found in visible area
                </span>
              </div>
              <button
                onClick={handleClearSearchArea}
                id="btn-sidebar-clear-area"
                className="bg-white hover:bg-blue-100 text-blue-800 font-bold text-xs px-2.5 py-1 rounded-lg border border-blue-300 shadow-2xs shrink-0 transition"
              >
                Show All London
              </button>
            </div>
          )}

          {/* Quick Highlight: Recommended Nearest Empty Space Spotlight */}
          {nearestFacility && !searchQuery && !activeSearchArea && activeFilter === "all" && (
            <div className="px-4 py-2.5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 block">
                  FASTEST AVAILABLE EMPTY SPACE
                </span>
                <span className="text-xs font-bold text-slate-900 truncate block">
                  {nearestFacility.name} •{" "}
                  {nearestFacility.availableSpaces != null
                    ? `${nearestFacility.availableSpaces} bays vacant`
                    : "No live availability data"}
                </span>
              </div>
              <button
                onClick={() => handleStartNavigation(nearestFacility)}
                id="btn-spotlight-nav"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg shadow-sm shrink-0 flex items-center gap-1 transition"
              >
                <Navigation className="w-3 h-3" />
                Go Now
              </button>
            </div>
          )}

          {/* List of Parking Facilities */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
            {/* Recent Parking History Section (Last 5 visited with quick navigation buttons) */}
            <details className="bg-white border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-600">
              <summary className="font-bold text-slate-800 cursor-pointer">Where these numbers come from</summary>
              <ul className="mt-2 space-y-1.5 list-disc pl-4">
                <li>TfL station car parks and their tariffs come from the TfL Unified API. A free-space count is live only when the occupancy feed responds.</li>
                <li>Other car parks are an unverified catalogue. Their prices and bay counts are not live and were not confirmed against the operator.</li>
                <li>On-street rows are parking rules, never free bays. Camden publishes rules as open data. OpenStreetMap covers mapped kerbs. There is no London-wide live on-street occupancy feed.</li>
                <li>The assistant does not run without GEMINI_API_KEY, and it is not allowed to invent figures.</li>
              </ul>
            </details>

            <section aria-labelledby="on-street-heading" className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 id="on-street-heading" className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                  On-street rules ({onStreetBays.length})
                </h3>
                <label className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={showOnStreetOnMap}
                    onChange={(e) => setShowOnStreetOnMap(e.target.checked)}
                  />
                  Show on map
                </label>
              </div>
              {onStreetStatus === "loading" && (
                <p className="text-xs text-slate-500" role="status">Loading kerb rules from Camden open data and OpenStreetMap…</p>
              )}
              {onStreetStatus === "error" && (
                <p className="text-xs text-rose-700" role="status">{onStreetNote}</p>
              )}
              {onStreetNote && onStreetStatus === "ready" && (
                <p className="text-[11px] text-slate-500 leading-snug">{onStreetNote}</p>
              )}
              {onStreetSources.length > 0 && (
                <ul className="text-[10px] text-slate-500 space-y-0.5">
                  {onStreetSources.map((source) => (
                    <li key={source.id}>
                      {source.id}: {source.status} · {source.count} · {source.detail}
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {onStreetBays
                  .filter((bay) => !reportsOnly || (driverReports[bay.id] && !driverReports[bay.id].faded))
                  .map((bay) => (
                  <OnStreetBayCard
                    key={bay.id}
                    bay={bay}
                    selected={selectedBayId === bay.id}
                    report={driverReports[bay.id]}
                    onReportsChanged={refreshDriverReports}
                    onSelect={() => {
                      setSelectedBayId(bay.id);
                      setSelectedFacility(null);
                      if (window.innerWidth < 768) setMobileView("map");
                    }}
                  />
                ))}
              </div>
            </section>

            <RecentParkingHistory
              history={recentHistory}
              facilities={facilities}
              selectedFacility={shownFacility}
              onSelectFacility={(fac) => {
                setSelectedFacility(fac);
                if (window.innerWidth < 768) {
                  setMobileView("map");
                }
              }}
              onNavigateFacility={(fac) => handleStartNavigation(fac)}
              onClearHistory={handleClearHistory}
              onRemoveItem={handleRemoveHistoryItem}
              onSeedSampleHistory={handleSeedSampleHistory}
            />

            {/* Available Car Parks Header */}
            <div className="flex items-center justify-between text-xs text-slate-500 px-0.5 pt-0.5">
              <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                {searchQuery || activeFilter !== "all"
                  ? "Filtered Car Parks"
                  : "All Available Car Parks"}{" "}
                ({filteredFacilities.length})
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {occupancySource === "tfl-live" ? "Some TfL counts are live" : "Space counts not live"}
              </span>
            </div>

            {loadError && facilities.length === 0 ? (
              <div className="p-8 text-center text-slate-600 bg-white rounded-2xl border border-rose-200" role="alert">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">Car parks could not be loaded</h4>
                <p className="text-xs text-slate-500 mt-1">{loadError}</p>
                <button
                  type="button"
                  onClick={() => fetchFacilities(true)}
                  className="mt-3 text-xs text-blue-700 font-bold hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : isLoading ? (
              <div className="p-8 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600" />
                <p className="text-xs font-medium">Connecting to live London parking feeds...</p>
              </div>
            ) : filteredFacilities.length === 0 ? (
              <div className="p-8 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <h4 className="font-bold text-slate-800 text-sm">No car parks match criteria</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Try clearing your search query or relaxing your filter constraints.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setActiveFilter("all");
                    setMaxDistanceKm(null);
                    setMaxHourly(null);
                    setOpenNowOnly(false);
                  }}
                  className="mt-3 text-xs text-blue-600 font-bold hover:underline"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              filteredFacilities.map((facility) => (
                <ParkingFacilityCard
                  key={facility.id}
                  facility={facility}
                  report={driverReports[facility.id]}
                  onReportsChanged={refreshDriverReports}
                  isSelected={selectedFacility?.id === facility.id}
                  isLoggedIn={Boolean(currentUser)}
                  vehicleProfile={vehicleProfile}
                  onSelect={() => {
                    setSelectedFacility(facility);
                    if (window.innerWidth < 768) {
                      setMobileView("map");
                    }
                  }}
                  onNavigate={() => handleStartNavigation(facility)}
                  onViewCamera={() => setInspectionFacility(facility)}
                  onUpdateLiveSpaces={() => handleOpenLiveUpdate(facility)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right Stage: Interactive Map & Live Navigation HUD */}
        <div
          className={`relative h-full min-h-0 w-full flex-1 ${
            mobileView === "list" ? "hidden md:block" : "block"
          }`}
        >
          <MapView
            facilities={filteredFacilities}
            selectedFacility={shownFacility}
            onSelectFacility={(fac) => setSelectedFacility(fac)}
            onNavigateToFacility={(fac) => handleStartNavigation(fac)}
            onOpenLiveCamera={(fac) => setInspectionFacility(fac)}
            onUpdateLiveSpaces={handleOpenLiveUpdate}
            isLoggedIn={Boolean(currentUser)}
            userLocation={userLocation}
            routeCoordinates={routeCoordinates}
            vehiclePosition={navSession?.currentVehiclePos || null}
            isNavigating={Boolean(navSession)}
            showTflCameras={showTflCameras}
            onToggleTflCameras={() => setShowTflCameras(!showTflCameras)}
            activeSearchArea={activeSearchArea}
            onSearchArea={handleSearchArea}
            onClearSearchArea={handleClearSearchArea}
            searchAreaCategory={searchAreaCategory}
            onSearchAreaCategoryChange={setSearchAreaCategory}
            isDrivingMode={navSession?.isDrivingMode}
            nightMode={navSession?.nightMode}
            heading={navSession?.heading}
            onStreetBays={onStreetBays}
            showOnStreet={showOnStreetOnMap}
            selectedOnStreetId={selectedBayId}
            onSelectOnStreet={(bay) => {
              if (!bay) {
                setSelectedBayId(null);
                return;
              }
              setSelectedBayId(bay.id);
              setSelectedFacility(null);
            }}
            mapsNotice={mapsMessage}
            onToggleDrivingMode={() => {
              if (navSession) {
                setNavSession((prev) =>
                  prev ? { ...prev, isDrivingMode: !prev.isDrivingMode } : null
                );
              }
            }}
            apiKey={apiKey}
            locationIsGps={locationIsGps}
            driverReports={driverReports}
            onReportsChanged={refreshDriverReports}
            carFocus={carFocus}
          />

          {/* Active Navigation In-Car HUD Overlay */}
          {navSession && (
            <NavigationHUD
              session={navSession}
              onUpdateSession={(updated) =>
                setNavSession((prev) => (prev ? { ...prev, ...updated } : null))
              }
              onEndNavigation={handleEndNavigation}
              onOpenLiveCamera={() => {
                if (navSession?.facility) {
                  setInspectionFacility(navSession.facility);
                }
              }}
            />
          )}
        </div>
      </div>

      {/* Live Camera & Bay Sensor CCTV Modal */}
      {inspectionFacility && (
        <CameraModal
          facility={inspectionFacility}
          onClose={() => setInspectionFacility(null)}
          onNavigate={(fac) => {
            setInspectionFacility(null);
            handleStartNavigation(fac);
          }}
        />
      )}

      <Suspense fallback={null}>
        {isAiModalOpen && (
          <AiParkingAdvisorModal
            facilities={facilities}
            userLocation={userLocation}
            locationKind={locationIsGps ? "gps" : "map-centre"}
            onClose={() => setIsAiModalOpen(false)}
            onSelectRecommendation={(facName) => {
              setSearchQuery(facName);
              setIsAiModalOpen(false);
            }}
          />
        )}

        {isVehicleModalOpen && (
          <VehicleProfileModal
            currentProfile={vehicleProfile}
            onSaveProfile={(updated) => {
              setVehicleProfile(updated);
              saveStoredVehicleProfile(updated);
            }}
            onClose={() => setIsVehicleModalOpen(false)}
          />
        )}

        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            saveStoredUser(user);
            setCommunityToast(`${user.name} is saved on this browser only. It is not an account.`);
            setTimeout(() => setCommunityToast(null), 5000);
          }}
          onLogout={() => {
            setCurrentUser(null);
            saveStoredUser(null);
            setCommunityToast("Name cleared from this browser.");
            setTimeout(() => setCommunityToast(null), 4000);
          }}
          contextMessage={loginContextMsg}
        />

        <UpdateLiveSpacesModal
          isOpen={Boolean(updatingFacility)}
          facility={updatingFacility}
          user={currentUser}
          onClose={() => setUpdatingFacility(null)}
          onSubmitUpdate={handleSubmitLiveUpdate}
        />
      </Suspense>

      {/* Community Action Toast Notification */}
      {communityToast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl border border-emerald-500/50 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <span className="font-bold block text-emerald-300 mb-0.5">Contributor Update</span>
            <p className="text-slate-200 leading-snug">{communityToast}</p>
          </div>
          <button
            onClick={() => setCommunityToast(null)}
            className="text-slate-400 hover:text-white p-0.5 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Turn-by-Turn Route Error Toast Card */}
      {routeError && (
        <div className="fixed top-20 right-5 z-50 max-w-sm bg-slate-900 text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-rose-500/50 flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <span className="font-bold block text-rose-300 mb-0.5">Routing Unavailable</span>
              <p className="text-slate-200 leading-snug">{routeError.message}</p>
            </div>
            <button
              onClick={() => setRouteError(null)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1.5 border-t border-slate-800">
            <button
              onClick={() => setRouteError(null)}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg transition"
            >
              Dismiss
            </button>
            <a
              href={routeError.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-lg transition inline-flex items-center gap-1 shadow"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
    </ParkingTimerProvider>
  );
}
