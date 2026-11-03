import fs from "fs";
import path from "path";

function formatCell(val: any): string {
  if (val === null || val === undefined) {
    return "";
  }
  if (typeof val === "boolean") {
    return val ? "true" : "false";
  }
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function exportVerificationSheet(): Promise<string> {
  let carparks: any[] = [];
  try {
    const res = await fetch("http://localhost:3000/api/carparks");
    if (!res.ok) {
      console.error("server not running on :3000");
      process.exit(1);
    }
    const data = await res.json();
    const arr = data?.carParks || data?.carparks;
    if (!Array.isArray(arr)) {
      console.error("server not running on :3000");
      process.exit(1);
    }
    carparks = arr;
  } catch (err) {
    console.error("server not running on :3000");
    process.exit(1);
  }

  const columns = [
    "id",
    "source",
    "name",
    "operator",
    "parkingCategory",
    "address",
    "postcode",
    "borough",
    "lat",
    "lng",
    "totalSpaces",
    "disabledBays",
    "hourlyRate",
    "dailyRate",
    "saturdayRate",
    "sundayRate",
    "eveningRate",
    "heightRestriction",
    "openHours",
    "hasEvCharging",
    "evChargingBays",
    "evChargingSpeedKw",
    "cctvMonitoring",
    "staffed",
    "securityType",
    "paymentMethods",
    "congestionChargeZone",
    "stillOperating",
    "notes",
    "sourceUrl",
    "verifiedAt",
    "verify_status",
    "verify_notes",
    "checked_on"
  ];

  const seedRows = carparks.filter((c: any) => c.source === "seed");
  const tflRows = carparks.filter((c: any) => c.source === "tfl");

  seedRows.sort((a: any, b: any) => (a.id || "").localeCompare(b.id || ""));
  tflRows.sort((a: any, b: any) => (a.id || "").localeCompare(b.id || ""));

  const sorted = [...seedRows, ...tflRows];

  const lines = [columns.join(",")];

  for (const cp of sorted) {
    const row = [
      formatCell(cp.id),
      formatCell(cp.source),
      formatCell(cp.name),
      formatCell(cp.operator),
      formatCell(cp.parkingCategory),
      formatCell(cp.address),
      formatCell(cp.postcode),
      formatCell(cp.borough),
      formatCell(cp.lat),
      formatCell(cp.lng),
      formatCell(cp.totalSpaces),
      formatCell(cp.disabledBays),
      formatCell(cp.hourlyRate),
      formatCell(cp.dailyRate),
      formatCell(cp.saturdayRate),
      formatCell(cp.sundayRate),
      formatCell(cp.eveningRate),
      formatCell(cp.heightRestriction),
      formatCell(cp.openHours),
      formatCell(cp.hasEvCharging),
      formatCell(cp.evChargingBays),
      formatCell(cp.evChargingSpeedKw),
      formatCell(cp.cctvMonitoring),
      formatCell(cp.staffed),
      formatCell(cp.securityType),
      formatCell(cp.paymentMethods),
      formatCell(cp.congestionChargeZone),
      formatCell(cp.stillOperating),
      formatCell(cp.notes),
      formatCell(cp.sourceUrl),
      formatCell(cp.verifiedAt),
      "", // verify_status
      "", // verify_notes
      ""  // checked_on
    ];
    lines.push(row.join(","));
  }

  const csvContent = lines.join("\n") + "\n";
  const outDir = path.resolve(process.cwd(), "verification");
  const outFile = path.join(outDir, "seed-verification.csv");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outFile, csvContent, "utf-8");
  console.log(`Exported ${sorted.length} rows (${seedRows.length} seed, ${tflRows.length} tfl) to ${outFile}`);
  return outFile;
}

exportVerificationSheet();
