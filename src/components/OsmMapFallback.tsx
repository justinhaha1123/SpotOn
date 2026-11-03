import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OnStreetBay, ParkingFacility } from "../types";

interface OsmMapFallbackProps {
  facilities: ParkingFacility[];
  onStreetBays: OnStreetBay[];
  showOnStreet: boolean;
  selectedFacility: ParkingFacility | null;
  selectedOnStreetId: string | null;
  onSelectFacility: (facility: ParkingFacility) => void;
  onSelectOnStreet: (bay: OnStreetBay) => void;
  userLocation: { lat: number; lng: number } | null;
  routeCoordinates: [number, number][] | null;
  positionLabel?: string;
}

function availabilityDot(facility: ParkingFacility): string {
  if (facility.confidence === "live" && facility.availableSpaces != null) {
    if (facility.availableSpaces <= 0) return "#e11d48";
    if (facility.availableSpaces <= 10) return "#d97706";
    return "#059669";
  }
  return "#94a3b8";
}

export const OsmMapFallback: React.FC<OsmMapFallbackProps> = ({
  facilities,
  onStreetBays,
  showOnStreet,
  selectedFacility,
  selectedOnStreetId,
  onSelectFacility,
  onSelectOnStreet,
  userLocation,
  routeCoordinates,
  positionLabel = "Map centre, not your location",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const center = userLocation ?? { lat: 51.5115, lng: -0.128 };
    const map = L.map(el, { zoomControl: true }).setView([center.lat, center.lng], 14);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 200);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // Map instance is created once. Marker updates are a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    if (userLocation) {
      L.circleMarker([userLocation.lat, userLocation.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: "#2563eb",
        fillOpacity: 1,
      }).bindTooltip(positionLabel).addTo(group);
    }

    if (routeCoordinates && routeCoordinates.length > 1) {
      L.polyline(routeCoordinates, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(group);
    }

    for (const facility of facilities) {
      const selected = selectedFacility?.id === facility.id;
      const marker = L.circleMarker([facility.lat, facility.lng], {
        radius: selected ? 11 : 8,
        color: selected ? "#1d4ed8" : "#ffffff",
        weight: 2,
        fillColor: availabilityDot(facility),
        fillOpacity: 0.95,
      });
      const spaces =
        facility.confidence === "live" && facility.availableSpaces != null
          ? `${facility.availableSpaces} free (TfL live)`
          : "No live space count";
      marker.bindTooltip(`${facility.name} — ${spaces}`, { direction: "top" });
      marker.on("click", () => onSelectFacility(facility));
      marker.addTo(group);
    }

    if (showOnStreet) {
      for (const bay of onStreetBays) {
        const selected = selectedOnStreetId === bay.id;
        const marker = L.circleMarker([bay.lat, bay.lng], {
          radius: selected ? 7 : 5,
          color: "#0f766e",
          weight: selected ? 3 : 1,
          fillColor: "#99f6e4",
          fillOpacity: 0.9,
        });
        marker.bindTooltip(`${bay.roadName} — restriction, not free spaces`, { direction: "top" });
        marker.on("click", () => onSelectOnStreet(bay));
        marker.addTo(group);
      }
    }
  }, [
    facilities,
    onStreetBays,
    showOnStreet,
    selectedFacility,
    selectedOnStreetId,
    onSelectFacility,
    onSelectOnStreet,
    userLocation,
    routeCoordinates,
    positionLabel,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (selectedFacility) {
      map.panTo([selectedFacility.lat, selectedFacility.lng]);
      return;
    }
    const bay = onStreetBays.find((item) => item.id === selectedOnStreetId);
    if (bay) map.panTo([bay.lat, bay.lng]);
  }, [selectedFacility, selectedOnStreetId, onStreetBays]);

  return <div ref={containerRef} className="absolute inset-0 z-0" role="application" aria-label="OpenStreetMap of parking locations" />;
};
