import type { ReportStore } from "./logic.js";
import type { ReportsDatabase } from "./firestoreStore.js";
import { JsonFileReportStore } from "./store.js";

export function publicStoreError(err: unknown): string {
  const message = err instanceof Error ? err.message : "Unknown error";
  if (/BEGIN [A-Z ]*PRIVATE KEY|private_key"\s*:/i.test(message)) {
    return "Firestore credentials were rejected.";
  }
  return message.replace(/\s+/g, " ").slice(0, 240);
}

export async function openReportStore(options: {
  filePath: string;
  env?: NodeJS.ProcessEnv;
  connect?: (env: NodeJS.ProcessEnv) => Promise<ReportsDatabase>;
  warn?: (message: string) => void;
  info?: (message: string) => void;
}): Promise<ReportStore> {
  const env = options.env ?? process.env;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const info = options.info ?? ((message: string) => console.info(message));
  const choice = (env.REPORT_STORE || "firestore").trim().toLowerCase();
  const fileStore = () => new JsonFileReportStore(options.filePath);

  if (choice === "file") {
    info("Driver reports: using the JSON file store.");
    return fileStore();
  }
  if (choice !== "firestore") {
    warn(`Driver reports: REPORT_STORE=${choice} is not a known store. Using the JSON file store.`);
    return fileStore();
  }

  try {
    const firestore = await import("./firestoreStore.js");
    const db = options.connect ? await options.connect(env) : await firestore.connectFirestoreDatabase(env);
    info("Driver reports: using Firestore.");
    return new firestore.FirestoreReportStore(db);
  } catch (err) {
    warn(`Driver reports: Firestore is not available (${publicStoreError(err)}). Using the JSON file store.`);
    return fileStore();
  }
}
