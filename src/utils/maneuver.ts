import type { RouteStep } from "../types";

function streetPhrase(streetName: string | undefined, preposition: "onto" | "on" | "at"): string {
  const street = (streetName || "").trim();
  if (!street || street.toLowerCase() === "unnamed road") return "";
  return ` ${preposition} ${street}`;
}

function turnPhrase(modifier: string): string {
  const mod = modifier.toLowerCase().replace(/_/g, " ").trim();
  if (mod === "slight left") return "Bear left";
  if (mod === "slight right") return "Bear right";
  if (mod === "sharp left") return "Turn sharp left";
  if (mod === "sharp right") return "Turn sharp right";
  if (mod === "uturn" || mod === "u-turn") return "Make a U-turn";
  if (mod === "left") return "Turn left";
  if (mod === "right") return "Turn right";
  if (mod === "straight") return "Continue straight";
  if (!mod) return "Continue";
  return `Continue ${mod}`;
}

/** Turn router step types such as "new name" into a sentence a driver can read. */
export function humaniseManeuver(
  type: string | undefined,
  modifier: string | undefined,
  streetName: string | undefined
): string {
  const kind = (type || "continue").toLowerCase().replace(/_/g, " ").trim();
  const mod = (modifier || "").toLowerCase().replace(/_/g, " ").trim();
  const onto = streetPhrase(streetName, "onto");
  const on = streetPhrase(streetName, "on");
  const at = streetPhrase(streetName, "at");

  switch (kind) {
    case "depart":
    case "departure":
      return onto ? `Head${mod && mod !== "straight" ? ` ${mod}` : ""}${onto}` : "Start the route";
    case "arrive":
    case "arrival":
      return at ? `Arrive${at}` : "You have arrived";
    case "turn":
      return `${turnPhrase(mod)}${onto}`;
    case "end of road":
      return `${turnPhrase(mod)} at the end of the road${onto}`;
    case "new name":
      return onto ? `Continue${onto}` : "Continue";
    case "continue":
    case "notification":
      return `Continue${on || onto}`;
    case "merge":
      return `Merge${onto || on}`;
    case "on ramp":
      return `Take the ramp${onto || on}`;
    case "off ramp":
    case "exit":
      return `Take the exit${onto || on}`;
    case "fork":
      if (mod.includes("left")) return `Keep left${onto || on}`;
      if (mod.includes("right")) return `Keep right${onto || on}`;
      return `Keep to the fork${onto || on}`;
    case "roundabout":
    case "rotary":
    case "roundabout turn":
    case "exit roundabout":
      return `At the roundabout, take the exit${onto || on}`;
    case "use lane":
      return `Stay in lane${on || onto}`;
    default:
      return `${turnPhrase(mod)}${onto || on}`.replace(/\s+/g, " ").trim();
  }
}

export function mapManeuverIcon(type: string | undefined, modifier: string | undefined): RouteStep["maneuver"] {
  const kind = (type || "").toLowerCase();
  const mod = (modifier || "").toLowerCase().replace(/_/g, " ");
  if (kind.includes("roundabout") || kind === "rotary") return "roundabout";
  if (kind === "arrive" || kind === "arrival") return "arrive";
  if (mod.includes("slight") && mod.includes("left")) return "slight-left";
  if (mod.includes("slight") && mod.includes("right")) return "slight-right";
  if (mod === "left" || mod.endsWith(" left")) return "turn-left";
  if (mod === "right" || mod.endsWith(" right")) return "turn-right";
  return "straight";
}
