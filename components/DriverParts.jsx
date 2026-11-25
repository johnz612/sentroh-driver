import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { Text } from "@/components/AppText";

import { s } from "@/components/ui";
import { C } from "@/lib/theme";

/**
 * A trip as a short line of stops: the store first, then each customer.
 * stops: [{ kind: "PICKUP" | "DROP", title, sub }]
 */
export function Route({ stops, dark = false }) {
  const ink = dark ? "#fff" : C.ink;
  const soft = dark ? "#BDBDB8" : C.inkSoft;
  return (
    <View style={{ marginTop: 12 }}>
      {stops.map((st, i) => {
        const last = i === stops.length - 1;
        const pickup = st.kind === "PICKUP";
        return (
          <View key={`${st.kind}-${i}`} style={{ flexDirection: "row" }}>
            <View style={{ width: 28, alignItems: "center" }}>
              <View style={{
                width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center",
                backgroundColor: pickup ? C.mango : dark ? "#fff" : C.ink,
              }}>
                <Ionicons name={pickup ? "storefront" : "home"} size={12} color={pickup ? C.ink : dark ? C.ink : "#fff"} />
              </View>
              {!last ? <View style={{ width: 2, flex: 1, minHeight: 16, backgroundColor: dark ? "#3A3A38" : C.line, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingLeft: 8, paddingBottom: last ? 0 : 12 }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: soft, letterSpacing: 0.4 }}>{pickup ? "PICK UP" : stops.length > 2 ? `DROP-OFF ${i}` : "DROP-OFF"}</Text>
              <Text style={{ fontSize: 16, fontWeight: "700", color: ink }}>{st.title}</Text>
              {st.sub ? <Text style={{ fontSize: 13, color: soft, marginTop: 1 }}>{st.sub}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const STEPS = ["Pick up", "Deliver", "Get paid"];

/** Where the driver is in a delivery: 0 = going to the store, 1 = going to the customer, 2 = at the customer. */
export function StepBar({ current }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 12 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <View key={label} style={{ flex: 1, marginRight: i < STEPS.length - 1 ? 6 : 0 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: done ? C.ink : now ? C.mango : C.line }} />
            <View style={[s.row, { marginTop: 6 }]}>
              {done ? <Ionicons name="checkmark-circle" size={14} color={C.ink} style={{ marginRight: 3 }} /> : null}
              <Text style={{ fontSize: 13, fontWeight: now ? "800" : "600", color: now || done ? C.ink : C.inkSoft }}>{label}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Seconds left as a shrinking bar (mango, red for the last 10 seconds). */
export function TimeBar({ left, total = 30 }) {
  const part = Math.max(0, Math.min(1, left / total));
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: "#3A3A38", overflow: "hidden" }}>
      <View style={{ height: 6, width: `${part * 100}%`, backgroundColor: left <= 10 ? "#FF6B5B" : C.mango }} />
    </View>
  );
}

/** One line of a money breakdown: label on the left, amount on the right. */
export function MoneyLine({ label, value, sign, strong, color }) {
  return (
    <View style={[s.row, { justifyContent: "space-between", paddingVertical: 4 }]}>
      <Text style={[s.body, strong && { fontWeight: "800" }, color && { color }]}>{label}</Text>
      <Text style={[s.body, strong && { fontWeight: "800" }, color && { color }]}>{sign ? `${sign} ` : ""}{value}</Text>
    </View>
  );
}
