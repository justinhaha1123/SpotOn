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

export interface ReportStoreStatus {
  store: "firestore" | "file";
  reason?: string;
  configMode?: "service-account" | "adc" | "unconfigured";
  projectId?: string;
  checkedAt: string;
  env: {
    FIREBASE_SERVICE_ACCOUNT_JSON: boolean;
    FIRESTORE_PROJECT_ID: boolean;
    GOOGLE_APPLICATION_CREDENTIALS: boolean;
  };
  lastWriteError?: string;
}

const emptyEnv = {
  FIREBASE_SERVICE_ACCOUNT_JSON: false,
  FIRESTORE_PROJECT_ID: false,
  GOOGLE_APPLICATION_CREDENTIALS: false,
};

let reportStoreStatus: ReportStoreStatus = {
  store: "file",
  checkedAt: new Date(0).toISOString(),
  env: emptyEnv,
};

export function getReportStoreStatus(): ReportStoreStatus {
  return { ...reportStoreStatus, env: { ...reportStoreStatus.env } };
}

export function noteReportWriteError(err: unknown): void {
  reportStoreStatus = { ...reportStoreStatus, lastWriteError: publicStoreError(err) };
}

export function clearReportWriteError(): void {
  if (!reportStoreStatus.lastWriteError) return;
  const next = { ...reportStoreStatus };
  delete next.lastWriteError;
  reportStoreStatus = next;
}

function envPresence(env: NodeJS.ProcessEnv): ReportStoreStatus["env"] {
  const present = (name: string) => typeof env[name] === "string" && env[name].trim().length > 0;
  return {
    FIREBASE_SERVICE_ACCOUNT_JSON: present("FIREBASE_SERVICE_ACCOUNT_JSON"),
    FIRESTORE_PROJECT_ID: present("FIRESTORE_PROJECT_ID"),
    GOOGLE_APPLICATION_CREDENTIALS: present("GOOGLE_APPLICATION_CREDENTIALS"),
  };
}

async function describeConfig(env: NodeJS.ProcessEnv): Promise<Pick<ReportStoreStatus, "configMode" | "projectId" | "reason">> {
  try {
    const { resolveFirestoreSettings } = await import("./firestoreStore.js");
    const settings = resolveFirestoreSettings(env);
    const projectFromEnv = env.FIRESTORE_PROJECT_ID?.trim() || env.GOOGLE_CLOUD_PROJECT?.trim() || undefined;
    const projectId = settings.mode === "unconfigured" ? projectFromEnv : settings.projectId;
    return {
      configMode: settings.mode,
      ...(projectId ? { projectId } : {}),
      ...(settings.mode === "unconfigured" ? { reason: settings.reason } : {}),
    };
  } catch (err) {
    return { reason: publicStoreError(err) };
  }
}

function remember(env: NodeJS.ProcessEnv, fields: Omit<ReportStoreStatus, "checkedAt" | "env">): void {
  reportStoreStatus = {
    ...fields,
    checkedAt: new Date().toISOString(),
    env: envPresence(env),
  };
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
  const config = await describeConfig(env);

  if (choice === "file") {
    info("Driver reports: using the JSON file store.");
    remember(env, { store: "file", configMode: config.configMode, ...(config.projectId ? { projectId: config.projectId } : {}) });
    return fileStore();
  }
  if (choice !== "firestore") {
    const reason = `REPORT_STORE=${choice} is not a known store.`;
    warn(`Driver reports: ${reason} Using the JSON file store.`);
    remember(env, { store: "file", reason, configMode: config.configMode, ...(config.projectId ? { projectId: config.projectId } : {}) });
    return fileStore();
  }

  try {
    const firestore = await import("./firestoreStore.js");
    const db = options.connect ? await options.connect(env) : await firestore.connectFirestoreDatabase(env);
    info("Driver reports: using Firestore.");
    remember(env, { store: "firestore", configMode: config.configMode, ...(config.projectId ? { projectId: config.projectId } : {}) });
    return new firestore.FirestoreReportStore(db);
  } catch (err) {
    const reason = publicStoreError(err);
    warn(`Driver reports: Firestore is not available (${reason}). Using the JSON file store.`);
    remember(env, { store: "file", reason, configMode: config.configMode, ...(config.projectId ? { projectId: config.projectId } : {}) });
    return fileStore();
  }
}
