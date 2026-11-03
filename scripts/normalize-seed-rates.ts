import fs from "fs";
import path from "path";

const RATE_PATTERN = /^£(\d+(?:\.\d{1,2})?)(?:\/hr|\/day| per hour| per day)?$/i;

export function normalizeRate(valStr: string): number | null {
  const trimmed = valStr.trim();
  const match = trimmed.match(RATE_PATTERN);
  if (match) {
    return parseFloat(match[1]);
  }
  return null;
}

export function runNormalization() {
  const filePath = path.resolve(process.cwd(), "src/data/seedCarParks.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  const lines = content.split("\n");
  let currentId = "unknown";
  const newLines = lines.map((line) => {
    const idMatch = line.match(/"id":\s*"([^"]+)"/);
    if (idMatch) {
      currentId = idMatch[1];
    }

    const rateMatch = line.match(/^(\s*"(?:hourlyRate|dailyRate)":\s*)"([^"]*)"(,?)$/);
    if (rateMatch) {
      const prefix = rateMatch[1];
      const rawVal = rateMatch[2];
      const comma = rateMatch[3];
      const field = prefix.includes("hourlyRate") ? "hourlyRate" : "dailyRate";
      const normalized = normalizeRate(rawVal);
      if (normalized === null) {
        console.log(`[normalize] ${currentId}: ${field} "${rawVal}" -> null`);
        return `${prefix}null${comma}`;
      } else {
        return `${prefix}${normalized}${comma}`;
      }
    }
    return line;
  });

  const updatedContent = newLines.join("\n");
  fs.writeFileSync(filePath, updatedContent, "utf-8");
  console.log("Successfully normalized seedCarParks.ts rates.");
}

runNormalization();
