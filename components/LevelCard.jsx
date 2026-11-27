import { View } from "react-native";
import { Text } from "@/components/AppText";

import { useLoader } from "@/components/hooks";
import { driverApi } from "@/lib/api";
import { apiKey } from "@/lib/cache";
import { C } from "@/lib/theme";

const TAG = {
  FRIENDLY: "Friendly", FAST: "Fast", CAREFUL: "Careful with items",
  LATE: "Late", RUDE: "Rude", DAMAGED: "Items damaged", HARD_TO_REACH: "Hard to reach",
};
const LOOK = {
  TOP: { bg: C.greenWash, fg: C.green },
  GOOD: { bg: C.soft, fg: C.ink },
  NEW: { bg: C.mangoWash, fg: C.mangoInk },
  NEEDS_WORK: { bg: C.redWash, fg: C.red },
};

/**
 * Your level (last 30 days): customer rating and offers accepted. Top drivers get offers first
 * among drivers who are about as near the store; Needs work gets them last. With tips to move up
 * and the latest customer ratings (no names).
 */
export function LevelCard() {
  const { data } = useLoader(() => driverApi("/level"), [], { key: apiKey("/api/v1/driver/level"), refreshOnFocusMs: 60_000 });
  const l = data?.level;
  if (!l) return null;
  const look = LOOK[l.level] || LOOK.GOOD;

  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 16, fontWeight: "800", color: C.ink }}>Your level</Text>
        <View style={{ backgroundColor: look.bg, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
          <Text style={{ color: look.fg, fontWeight: "800", fontSize: 14 }}>{l.levelText}</Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", marginTop: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>
            {l.rating.average != null ? <><Text style={{ color: C.mango }}>★</Text> {l.rating.average.toFixed(1)}</> : "—"}
          </Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>{l.rating.count} customer rating{l.rating.count === 1 ? "" : "s"}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{l.acceptance.percent != null ? `${l.acceptance.percent}%` : "—"}</Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>offers accepted</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{l.deliveries}</Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>deliveries</Text>
        </View>
      </View>
      <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 6 }}>Last {l.days} days</Text>

      {l.tips.map((tip) => (
        <Text key={tip} style={{ fontSize: 14, color: C.ink, marginTop: 8 }}>• {tip}</Text>
      ))}

      {data.ratings?.length ? (
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: C.inkSoft, marginBottom: 4 }}>Latest customer ratings</Text>
          {data.ratings.slice(0, 5).map((r, i) => (
            <View key={`${r.at}-${i}`} style={{ paddingVertical: 6 }}>
              <Text style={{ fontSize: 14, color: C.mango }}>{"★".repeat(r.stars)}<Text style={{ color: C.line }}>{"★".repeat(5 - r.stars)}</Text>
                {r.tags.length ? <Text style={{ color: C.inkSoft, fontSize: 13 }}>  {r.tags.map((t) => TAG[t] || t).join(" · ")}</Text> : null}
              </Text>
              {r.comment ? <Text style={{ fontSize: 13, color: C.ink }}>“{r.comment}”</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
