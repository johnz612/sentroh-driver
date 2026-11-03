import * as Location from "expo-location";
import { AppState } from "react-native";
import { create } from "zustand";

import { driverApi } from "./api";

/** Every 10 s during a delivery (customer's live map), every 30 s while waiting for offers. */
const EVERY_MS_ON_JOB = 10_000;
const EVERY_MS_IDLE = 30_000;

let watcher = null;
let heartbeat = null;
let lastSent = 0;
let appState = AppState.currentState;

AppState.addEventListener("change", (next) => { appState = next; });

/** Current position, asking for permission when needed. Throws a friendly error. */
export async function currentPosition() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new Error("Allow location: Sentroh needs it to offer you nearby deliveries.");
  const servicesOn = await Location.hasServicesEnabledAsync();
  if (!servicesOn) throw new Error("Turn on your phone's location (GPS).");
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

/**
 * Online state, the open offer and active jobs. Location is sent while the
 * app is open and the driver is online (foreground only at launch: keep the
 * app open while online).
 */
export const useDriver = create((set, get) => ({
  online: false,
  offer: null,
  jobs: [],
  lastPosition: null,

  setOnlineFlag(online) {
    set({ online });
    if (online) startTracking(); else stopTracking();
  },

  async goOnline() {
    const pos = await currentPosition();
    await driverApi("/availability", { method: "POST", body: { online: true, ...pos } });
    set({ lastPosition: pos });
    lastSent = Date.now();
    get().setOnlineFlag(true);
  },

  async goOffline() {
    await driverApi("/availability", { method: "POST", body: { online: false } });
    get().setOnlineFlag(false);
    set({ offer: null });
  },

  setJobs(jobs) { set({ jobs: jobs || [] }); },
  setOffer(offer) { set({ offer: offer || null }); },

  async refreshJobs() {
    const json = await driverApi("/jobs/current");
    set({ jobs: json.jobs || [] });
    return json.jobs || [];
  },

  async refreshOffer() {
    const json = await driverApi("/offers/current");
    set({ offer: json.offer || null });
    return json.offer || null;
  },
}));

async function sendPosition(coords) {
  const { jobs, online } = useDriver.getState();
  if (!online || appState !== "active") return;
  const every = jobs.length ? EVERY_MS_ON_JOB : EVERY_MS_IDLE;
  if (Date.now() - lastSent < every) return;
  lastSent = Date.now();
  const pos = { latitude: coords.latitude, longitude: coords.longitude };
  useDriver.setState({ lastPosition: pos });
  try {
    await driverApi("/location", { method: "POST", body: pos });
  } catch {
    // Next update tries again.
  }
}

async function startTracking() {
  // A driver waiting in one place does not move 20 m, so also send every 30 s
  // (offers need a position fresher than 5 minutes).
  if (!heartbeat) {
    heartbeat = setInterval(async () => {
      try {
        const pos = (await Location.getLastKnownPositionAsync({ maxAge: 60_000 })) || (await Location.getCurrentPositionAsync({}));
        if (pos) sendPosition(pos.coords);
      } catch {
        // Location off for a moment: try again next time.
      }
    }, EVERY_MS_IDLE);
  }
  if (watcher) return;
  try {
    watcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: EVERY_MS_ON_JOB, distanceInterval: 20 },
      (pos) => sendPosition(pos.coords),
    );
  } catch {
    watcher = null;
  }
}

function stopTracking() {
  watcher?.remove();
  watcher = null;
  clearInterval(heartbeat);
  heartbeat = null;
}
