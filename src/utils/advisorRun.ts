export const ADVISOR_BUDGET_MS = 22_000;
export const MODEL_COOLDOWN_MS = 60_000;
export const PER_CALL_BUDGET_MS = 8_000;

const cooldownUntil = new Map<string, number>();

export function resetModelCooldowns(): void {
  cooldownUntil.clear();
}

export function markModelCoolingDown(model: string, now = Date.now(), cooldownMs = MODEL_COOLDOWN_MS): void {
  cooldownUntil.set(model, now + cooldownMs);
}

export function isModelCoolingDown(model: string, now = Date.now()): boolean {
  return (cooldownUntil.get(model) ?? 0) > now;
}

export type AdvisorAttempt =
  | { kind: "answer"; text: string; model: string }
  | { kind: "quota" }
  | { kind: "busy" }
  | { kind: "empty" };

function errorStatus(err: unknown): unknown {
  const anyErr = err as { status?: unknown; code?: unknown; error?: { status?: unknown; code?: unknown } };
  return anyErr?.status ?? anyErr?.code ?? anyErr?.error?.status ?? anyErr?.error?.code;
}

function errorMessage(err: unknown): string {
  const anyErr = err as { message?: unknown; error?: { message?: unknown } };
  return `${anyErr?.message || ""} ${anyErr?.error?.message || ""}`;
}

export function isHighDemandError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 503 || status === "UNAVAILABLE" || /unavailable|high demand|overloaded/i.test(errorMessage(err));
}

export function isQuotaError(err: unknown): boolean {
  const status = errorStatus(err);
  return status === 429 || status === "RESOURCE_EXHAUSTED" || /quota|rate limit|resource_exhausted/i.test(errorMessage(err));
}

function isModelTimeout(err: unknown): boolean {
  return err instanceof Error && err.message === "model_timeout";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("model_timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Try each model once. A 503 or a hung call cools that model down and switches immediately.
 * The deadline is absolute, so time already spent fetching context counts against it.
 */
export async function askModelsWithinDeadline(options: {
  deadlineAt: number;
  models: readonly string[];
  perCallMs?: number;
  callModel: (model: string) => Promise<string>;
}): Promise<AdvisorAttempt> {
  const perCallMs = options.perCallMs ?? PER_CALL_BUDGET_MS;
  let sawQuota = false;
  let attempted = 0;

  for (const model of options.models) {
    if (isModelCoolingDown(model)) continue;
    const remaining = options.deadlineAt - Date.now();
    if (remaining < 400) return { kind: "busy" };
    attempted += 1;
    const budget = Math.min(perCallMs, remaining);
    try {
      const text = (await withTimeout(options.callModel(model), budget)).trim();
      if (text) return { kind: "answer", text, model };
    } catch (err) {
      if (isQuotaError(err)) {
        sawQuota = true;
        continue;
      }
      if (isHighDemandError(err) || isModelTimeout(err)) {
        markModelCoolingDown(model);
        continue;
      }
    }
  }

  if (options.deadlineAt - Date.now() <= 0) return { kind: "busy" };
  if (sawQuota) return { kind: "quota" };
  if (attempted === 0) return { kind: "busy" };
  return { kind: "empty" };
}
