import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { api } from "./api";

// Show offer alerts even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let registeredToken = null;

/**
 * Android channels must match the channelId the server sends: "offers" for
 * delivery offers (30 seconds to answer), "urgent" for other high-priority
 * alerts, "default" for the rest.
 */
async function ensureChannels() {
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
  try {
    await ensureChannels();
    if (!Device.isDevice) return { ok: false, reason: "Push alerts need a real phone." };

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
