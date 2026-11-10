import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  clearParkedSession,
  countdownLabel,
  loadParkedSession,
  saveParkedSession,
  sessionEndingIn,
  timerPhase,
  walkingDirectionsUrl,
  type ParkedSession,
} from "../utils/parkingTimer";

interface TimerApi {
  session: ParkedSession | null;
  now: number;
  toast: string | null;
  start: (input: { name: string; lat: number; lng: number; minutes: number }) => Promise<void>;
  extend: () => void;
  end: () => void;
  find: () => void;
}

const TimerContext = createContext<TimerApi | null>(null);

function beep() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = 880;
    gain.gain.value = 0.05;
    tone.connect(gain);
    gain.connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + 0.2);
    window.setTimeout(() => void audio.close(), 400);
  } catch {
    /* A browser without audio still shows the toast. */
  }
}

async function askNotificationPermission(): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  try {
    await Notification.requestPermission();
  } catch {
    /* Denied or unsupported. The toast is the fallback. */
  }
}

export const ParkingTimerProvider: React.FC<{
  children: React.ReactNode;
  onFindCar: (spot: { lat: number; lng: number }) => void;
}> = ({ children, onFindCar }) => {
  const [session, setSession] = useState<ParkedSession | null>(() => loadParkedSession());
  const [toast, setToast] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const announced = useRef<string | null>(null);

  const commit = (next: ParkedSession | null) => {
    setSession(next);
    if (next) saveParkedSession(next);
    else clearParkedSession();
  };

  const announce = (body: string) => {
    let shown = false;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("SpotOn parking timer", { body });
        shown = true;
      } catch {
        shown = false;
      }
    }
    if (!shown) {
      setToast(body);
      beep();
      window.setTimeout(() => setToast(null), 8000);
    }
  };

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session) return;
    const phase = timerPhase(Date.now(), session);
    if (phase === "quiet") return;
    const key = `${session.endsAt}:${phase}`;
    if (announced.current === key) return;
    announced.current = key;
    const body = phase === "ten"
      ? `10 minutes left at ${session.name}.`
      : `Parking time is up at ${session.name}.`;
    announce(body);
    commit({ ...session, warnedTen: phase === "ten" ? true : session.warnedTen, warnedEnd: phase === "ended" ? true : session.warnedEnd });
    // The session flags stop the same alert firing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, now]);

  const start: TimerApi["start"] = async ({ name, lat, lng, minutes }) => {
    await askNotificationPermission();
    const times = sessionEndingIn(minutes);
    commit({ name, lat, lng, startedAt: times.startedAt, endsAt: times.endsAt, warnedTen: false, warnedEnd: false });
  };

  const api: TimerApi = {
    session,
    now,
    toast,
    start,
    extend: () => {
      if (!session) return;
      const ends = new Date(new Date(session.endsAt).getTime() + 15 * 60000).toISOString();
      const remain = new Date(ends).getTime() - Date.now();
      commit({ ...session, endsAt: ends, warnedTen: remain <= 10 * 60000, warnedEnd: false });
    },
    end: () => commit(null),
    find: () => {
      if (!session) return;
      onFindCar({ lat: session.lat, lng: session.lng });
    },
  };

  return <TimerContext.Provider value={api}>{children}</TimerContext.Provider>;
};

export const ParkingTimerBanner: React.FC = () => {
  const timer = useContext(TimerContext);
  const bannerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;
    if (!el) {
      root.style.setProperty("--spoton-timer-banner", "0px");
      return;
    }
    const apply = () => root.style.setProperty("--spoton-timer-banner", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--spoton-timer-banner", "0px");
    };
  }, [timer?.session, timer?.toast]);
  if (!timer?.session) return null;
  const { session } = timer;
  return (
    <div ref={bannerRef} className="shrink-0 border-b border-slate-800 bg-slate-900 px-3 py-2 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{session.name}</p>
          <p className="text-xs text-amber-200">{countdownLabel(timer.now, session.endsAt)}</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <button type="button" className="min-h-11 rounded-xl bg-white px-2 text-xs font-semibold text-slate-900" onClick={timer.find}>
            Find my car
          </button>
          <a
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-800 px-2 text-center text-xs font-semibold text-white"
            href={walkingDirectionsUrl(session.lat, session.lng)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Walk there
          </a>
          <button type="button" className="min-h-11 rounded-xl bg-slate-800 px-2 text-xs font-semibold" onClick={timer.extend}>
            Extend
          </button>
          <button type="button" className="min-h-11 rounded-xl bg-rose-600 px-2 text-xs font-semibold" onClick={timer.end}>
            End
          </button>
        </div>
        {timer.toast && <p className="text-xs text-amber-100" role="status">{timer.toast}</p>}
      </div>
    </div>
  );
};

export const IveParkedButton: React.FC<{
  name: string;
  lat: number;
  lng: number;
  suggestedMinutes?: number | null;
}> = ({ name, lat, lng, suggestedMinutes }) => {
  const timer = useContext(TimerContext);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(() => suggestedMinutes && suggestedMinutes > 0 ? suggestedMinutes : 60);
  if (!timer) return null;

  return (
    <div className="mt-1.5" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="min-h-11 w-full rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white"
        onClick={() => {
          setMinutes(suggestedMinutes && suggestedMinutes > 0 ? suggestedMinutes : 60);
          setOpen((current) => !current);
        }}
      >
        I've parked here
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-2.5">
          <p className="text-[11px] text-slate-600">
            {suggestedMinutes
              ? "End time starts from the published max stay or the next restriction. You can change it."
              : "No end time is published for this place. Set one yourself."}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <button type="button" className="min-h-11 min-w-11 rounded-lg border border-slate-200 text-sm font-bold" onClick={() => setMinutes((value) => Math.max(15, value - 15))}>-15</button>
            <label className="min-w-0 flex-1 text-center text-xs font-semibold text-slate-800">
              {minutes} min
              <input
                className="mt-1 w-full"
                type="range"
                min={15}
                max={480}
                step={15}
                value={minutes}
                aria-label="Minutes until the timer ends"
                onChange={(event) => setMinutes(Number(event.target.value))}
              />
            </label>
            <button type="button" className="min-h-11 min-w-11 rounded-lg border border-slate-200 text-sm font-bold" onClick={() => setMinutes((value) => Math.min(480, value + 15))}>+15</button>
          </div>
          <button
            type="button"
            className="mt-2 min-h-11 w-full rounded-xl bg-emerald-700 text-xs font-semibold text-white"
            onClick={() => {
              void timer.start({ name, lat, lng, minutes });
              setOpen(false);
            }}
          >
            Start timer
          </button>
        </div>
      )}
    </div>
  );
};
