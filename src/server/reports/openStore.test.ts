import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { getApps } from "firebase-admin/app";
import { FirestoreReportStore, resolveFirestoreSettings } from "./firestoreStore.ts";
import { openReportStore, publicStoreError } from "./openStore.ts";
import { JsonFileReportStore } from "./store.ts";

async function tempFile(): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "spoton-open-store-"));
  return { filePath: path.join(dir, "reports.json"), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("Firestore settings stay local until credentials or a Google Cloud runtime exist", () => {
  assert.equal(resolveFirestoreSettings({}).mode, "unconfigured");
  assert.equal(resolveFirestoreSettings({ FIRESTORE_PROJECT_ID: "spoton-london" }).mode, "unconfigured");
  const cloud = resolveFirestoreSettings({ K_SERVICE: "spoton", FIRESTORE_PROJECT_ID: "spoton-london" });
  assert.equal(cloud.mode, "adc");
  if (cloud.mode === "adc") assert.equal(cloud.projectId, "spoton-london");
  const file = resolveFirestoreSettings({
    GOOGLE_APPLICATION_CREDENTIALS: "/tmp/spoton-sa.json",
    FIRESTORE_PROJECT_ID: "spoton-london",
  });
  assert.equal(file.mode, "adc");
  if (file.mode === "adc") assert.equal(file.credentialsPath, "/tmp/spoton-sa.json");
});

test("service account JSON supplies the project id and keeps the key inside the result", () => {
  const settings = resolveFirestoreSettings({
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: "spoton-london",
      client_email: "api@spoton-london.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nfake\\n-----END PRIVATE KEY-----\\n",
    }),
  });
  assert.equal(settings.mode, "service-account");
  if (settings.mode !== "service-account") return;
  assert.equal(settings.projectId, "spoton-london");
  assert.equal(settings.clientEmail, "api@spoton-london.iam.gserviceaccount.com");
  assert.match(settings.privateKey, /BEGIN PRIVATE KEY/);
  assert.throws(
    () => resolveFirestoreSettings({ FIREBASE_SERVICE_ACCOUNT_JSON: "{" }),
    /not valid JSON/
  );
});

test("REPORT_STORE defaults to Firestore and falls back with one warning", async () => {
  const { filePath, cleanup } = await tempFile();
  try {
    const warnings: string[] = [];
    const infos: string[] = [];
    const store = await openReportStore({
      filePath,
      env: {},
      warn: (message) => warnings.push(message),
      info: (message) => infos.push(message),
    });
    assert.ok(store instanceof JsonFileReportStore);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Firestore is not available/);
    assert.match(warnings[0], /JSON file store/);
    assert.equal(infos.length, 0);
    assert.equal(getApps().length, 0);
  } finally {
    await cleanup();
  }
});

test("REPORT_STORE=file skips Firestore", async () => {
  const { filePath, cleanup } = await tempFile();
  try {
    let connected = false;
    const infos: string[] = [];
    const store = await openReportStore({
      filePath,
      env: { REPORT_STORE: "file" },
      connect: async () => {
        connected = true;
        throw new Error("connect should not run");
      },
      info: (message) => infos.push(message),
      warn: () => assert.fail("file mode does not warn"),
    });
    assert.equal(connected, false);
    assert.ok(store instanceof JsonFileReportStore);
    assert.match(infos[0] || "", /JSON file store/);
  } finally {
    await cleanup();
  }
});

test("a successful Firestore connection becomes the store", async () => {
  const { filePath, cleanup } = await tempFile();
  try {
    const infos: string[] = [];
    const store = await openReportStore({
      filePath,
      env: { REPORT_STORE: "firestore" },
      connect: async () => ({
        collection() {
          throw new Error("unused");
        },
        runTransaction() {
          throw new Error("unused");
        },
      }),
      info: (message) => infos.push(message),
      warn: () => assert.fail("configured Firestore does not warn"),
    });
    assert.ok(store instanceof FirestoreReportStore);
    assert.match(infos[0] || "", /using Firestore/);
  } finally {
    await cleanup();
  }
});

test("credential failures fall back once and the warning omits the key", async () => {
  const { filePath, cleanup } = await tempFile();
  try {
    const warnings: string[] = [];
    const secret = "-----BEGIN PRIVATE KEY-----\nabc-secret-key\n-----END PRIVATE KEY-----";
    const store = await openReportStore({
      filePath,
      env: { REPORT_STORE: "Firestore" },
      connect: async () => {
        throw new Error(`rejected ${secret}`);
      },
      warn: (message) => warnings.push(message),
      info: () => undefined,
    });
    assert.ok(store instanceof JsonFileReportStore);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].includes("abc-secret-key"), false);
    assert.equal(warnings[0].includes("BEGIN PRIVATE KEY"), false);
    assert.match(publicStoreError(new Error(secret)), /credentials were rejected/i);
  } finally {
    await cleanup();
  }
});

test("a missing credentials file and a bad private key fail before a network call", async () => {
  const { connectFirestoreDatabase } = await import("./firestoreStore.ts");
  await assert.rejects(
    () => connectFirestoreDatabase({ GOOGLE_APPLICATION_CREDENTIALS: "/tmp/spoton-missing-sa.json", FIRESTORE_PROJECT_ID: "spoton" }),
    /not found/
  );
  await assert.rejects(
    () => connectFirestoreDatabase({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: "spoton",
        client_email: "api@spoton.iam.gserviceaccount.com",
        private_key: "not-a-real-key",
      }),
    }),
    /private key|credentials/i
  );
  assert.equal(getApps().length, 0);
});
