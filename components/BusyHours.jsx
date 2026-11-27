import { View } from "react-native";
import { Text } from "@/components/AppText";

import { useLoader } from "@/components/hooks";
import { driverApi } from "@/lib/api";
import { apiKey } from "@/lib/cache";
import { C } from "@/lib/theme";

const LEVEL = {
  BUSY: { color: C.ink, text: "Busy" },
  SOME: { color: "#9A9A95", text: "Some orders" },
  QUIET: { color: C.line, text: "Quiet" },
};

/** A tip from "how busy is it now" and "how many drivers are already online near you". */
function tip(b, online) {
  const others = b.driversOnlineNear;
  const level = b.now?.level ?? "QUIET";
  const many = others != null && others >= 2;
  if (level === "BUSY") {
    return others === 0 ? "Busy now and no other driver is online near you. Good time to drive."
      : "Busy hour now. Stay online.";
  }
  if (level === "QUIET" && many) {
    return b.nextBusyText
      ? `Quiet now and ${others} drivers are online near you. Busier later: ${b.nextBusyText}.`
      : `Quiet now and ${others} drivers are online near you.`;
  }
  if (!online && b.nextBusyText) return `Best time to go online today: ${b.nextBusyText}.`;
  return b.nextBusyText ? `Busier later today: ${b.nextBusyText}.` : null;
}

/** Drive tab: when orders usually come near you today, so you go online when there is work. */
export function BusyHours({ online }) {
  const { data } = useLoader(() => driverApi("/busy-hours"), [], {
    key: apiKey("/api/v1/driver/busy-hours"), refreshOnFocusMs: 5 * 60_000,
  });
  const b = data?.busyHours;
  if (!b) return null;

  const max = Math.max(1, ...b.hours.map((h) => h.avgOrders));
  const advice = tip(b, online);

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: C.ink }}>Busy hours · {b.day}</Text>
        {b.now ? (
          <Text style={{ fontSize: 13, fontWeight: "700", color: b.now.level === "BUSY" ? C.ink : C.inkSoft }}>
            Now: {LEVEL[b.now.level].text}
          </Text>
        ) : null}
      </View>
      {b.driversOnlineNear != null ? (
        <Text style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>
          {b.driversOnlineNear === 0 ? "No other driver online near you" : `${b.driversOnlineNear} other driver${b.driversOnlineNear === 1 ? "" : "s"} online near you`}
        </Text>
      ) : null}

      {b.totalOrders === 0 ? (
        <Text style={{ fontSize: 14, color: C.inkSoft, marginTop: 10 }}>Not enough orders yet to show busy hours.</Text>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 64, marginTop: 12 }}>
            {b.hours.map((h) => (
              <View key={h.hour} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                <View style={{
                  width: "70%", borderRadius: 3,
                  height: Math.max(4, (h.avgOrders / max) * 56),
                  backgroundColor: h.isNow ? C.mango : LEVEL[h.level].color,
                }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
            {["6 AM", "10 AM", "2 PM", "6 PM", "10 PM"].map((t) => (
              <Text key={t} style={{ fontSize: 11, color: C.inkSoft }}>{t}</Text>
            ))}
          </View>
          {b.busyText ? <Text style={{ fontSize: 14, color: C.ink, marginTop: 10 }}>Usually busy: <Text style={{ fontWeight: "800" }}>{b.busyText}</Text></Text> : null}
        </>
      )}
      {advice ? <Text style={{ fontSize: 14, color: C.mangoInk, backgroundColor: C.mangoWash, borderRadius: 10, padding: 10, marginTop: 10 }}>{advice}</Text> : null}
    </View>
  );
}
