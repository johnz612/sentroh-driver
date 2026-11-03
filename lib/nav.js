import { Linking } from "react-native";

/**
 * Turn-by-turn by Google Maps or Waze (free). Opens the app if installed,
 * otherwise the browser.
 */
export function navigateTo(location, app = "google") {
  if (!location) return;
  const { latitude, longitude } = location;
  const url = app === "waze"
    ? `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`
    : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  Linking.openURL(url).catch(() => {});
}

export function call(phone) {
  if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
}
