import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

import { api } from "./api";

/**
 * Push alerts need a development or release build. Expo Go (used to try the
 * app on the emulator) has no push module, so there the app skips push and
 * relies on its 5-second offer check.
 */
export const pushAvailable = Constants.executionEnvironment !== "storeClient";

let N = null;
function notifications() {
  if (!pushAvailable) return null;
  if (!N) {
    N = require("expo-notifications"); // eslint-disable-line global-require
    // Show offer alerts even while the app is open.
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
  }
  return N;
}

let registeredToken = null;

/**
 * Android channels must match the channelId the server sends: "offers" for
 * delivery offers (30 seconds to answer), "urgent" for other high-priority
 * alerts, "default" for the rest.
 */
async function ensureChannels(Notifications) {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("offers", {
    name: "Delivery offers",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("urgent", {
    name: "Urgent",
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
  await Notifications.setNotificationChannelAsync("default", {
    name: "Updates",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Asks permission, gets this phone's Expo push token and saves it for the DRIVER app. */
export async function registerForPush() {
  const Notifications = notifications();
  if (!Notifications) return { ok: false, reason: "Offer alerts need the installed Sentroh Driver app (not Expo Go). Offers still appear while the app is open." };
  try {
    await ensureChannels(Notifications);
    if (!Device.isDevice) return { ok: false, reason: "Push alerts need a real phone. Offers still appear while the app is open." };

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return { ok: false, reason: "Notifications are off. Turn them on in phone settings to hear delivery offers." };

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

    await api("/api/v1/me/push-tokens", {
      method: "POST",
      body: { token, app: "DRIVER", platform: Platform.OS === "ios" ? "IOS" : "ANDROID", deviceName: Device.modelName || undefined },
    });
    registeredToken = token;
    return { ok: true };
  } catch (err) {
    console.warn("push registration failed:", err?.message);
    return { ok: false, reason: "Could not turn on offer alerts. Check your connection." };
  }
}

/**
 * Listens for alerts: onReceive(data) while the app is open, onOpen(data)
 * when an alert is tapped. Returns a function that stops listening.
 */
export function listenForAlerts({ onReceive, onOpen }) {
  const Notifications = notifications();
  if (!Notifications) return () => {};
  const received = Notifications.addNotificationReceivedListener((n) => onReceive?.(n?.request?.content?.data || {}));
  const opened = Notifications.addNotificationResponseReceivedListener((r) => onOpen?.(r?.notification?.request?.content?.data || {}));
  return () => { received.remove(); opened.remove(); };
}

/** Removes this phone's token on sign-out so it stops getting offers. */
export async function unregisterPush() {
  if (!registeredToken) return;
  try {
    await api("/api/v1/me/push-tokens", { method: "DELETE", body: { token: registeredToken } });
  } catch {
    // Signing out still continues; the token is replaced on the next sign-in.
  }
  registeredToken = null;
}
