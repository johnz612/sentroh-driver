import Ionicons from "@expo/vector-icons/Ionicons";
import { RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";

import { useLoader } from "@/components/hooks";
import { MoneyLine } from "@/components/DriverParts";
import { LevelCard } from "@/components/LevelCard";
import { WalletCard } from "@/components/WalletCard";
import { Body, Card, Label, Notice, Pill, Skeleton, s } from "@/components/ui";
import { driverApi } from "@/lib/api";
import { apiKey } from "@/lib/cache";
import { clock, dayLabel, money } from "@/lib/format";
import { C } from "@/lib/theme";

const METHOD = { GCASH: "GCash", BANK: "Bank", CASH: "Cash" };

/**
 * Earnings, in plain words: what the driver earned, and the customers' money they still
 * have to hand in to Sentroh (cash collected minus their pay minus what they already handed in).
 */
export default function Earnings() {
  const { data, error, refreshing, refresh } = useLoader(() => driverApi("/earnings"), [], { key: apiKey("/api/v1/driver/earnings"), refreshOnFocusMs: 5000 });

  if (!data) {
    return <ScrollView style={s.screen} contentContainerStyle={s.content}>{error ? <Notice error={error} /> : <Skeleton kind="cards" rows={3} pad={0} what="Loading earnings" />}</ScrollView>;
  }
  const e = data.earnings;
  const cash = e.cash;
  const owe = Number(cash.toRemit) > 0;

  // Deliveries grouped by day, newest first.
  const days = [];
  for (const d of e.recentDeliveries) {
    const key = dayLabel(new Date(d.deliveredAt).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
    if (!days.length || days[days.length - 1].key !== key) days.push({ key, items: [] });
    days[days.length - 1].items.push(d);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.ink} />}>
      <Notice error={error} />

      {/* 1. What you earned */}
      <View style={{ backgroundColor: C.ink, borderRadius: 20, padding: 18, marginBottom: 12 }}>
        <Text style={{ color: "#BDBDB8", fontSize: 14, fontWeight: "600" }}>You earned today</Text>
        <Text style={{ color: "#fff", fontSize: 40, fontWeight: "800", lineHeight: 46 }}>{money(e.today.earned)}</Text>
        <Text style={{ color: "#BDBDB8", fontSize: 13 }}>{e.today.deliveries} deliver{e.today.deliveries === 1 ? "y" : "ies"} today</Text>
        <View style={{ height: 1, backgroundColor: "#3A3A38", marginVertical: 12 }} />
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Text style={{ color: "#BDBDB8", fontSize: 14 }}>Last 7 days</Text>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>{money(e.last7Days.earned)} · {e.last7Days.deliveries} deliver{e.last7Days.deliveries === 1 ? "y" : "ies"}</Text>
        </View>
      </View>

      {/* 2. Cash to hand in, as a simple sum */}
      <Card tone={owe ? "attention" : undefined}>
        <Label>{owe ? "Hand in to Sentroh" : "Cash with you"}</Label>
        <Text style={{ fontSize: 32, fontWeight: "800", color: C.ink }}>{owe ? money(cash.toRemit) : "All handed in"}</Text>
        <View style={{ marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: owe ? "#F3D36B" : C.line }}>
          <MoneyLine label="Collected from customers" value={money(cash.collected)} />
          <MoneyLine label="Your pay" value={money(cash.earned)} sign="−" />
          {Number(cash.saved) > 0 ? <MoneyLine label="Saved to your deposit (hand it in)" value={money(cash.saved)} sign="+" /> : null}
          {Number(cash.remitted) > 0 ? <MoneyLine label="Already handed in" value={money(cash.remitted)} sign="−" /> : null}
          <View style={{ height: 1, backgroundColor: owe ? "#F3D36B" : C.line, marginVertical: 4 }} />
          <MoneyLine label="Still to hand in" value={money(cash.toRemit)} sign="=" strong />
        </View>
        <Text style={[s.sub, { marginTop: 8 }]}>
          {owe ? "Hand it in by cash or GCash. Sentroh records it and it shows below." : "Nothing to hand in right now."}
          {cash.lastRemittedAt ? ` Last handover ${clock(cash.lastRemittedAt)}.` : ""}
        </Text>
      </Card>

      {/* Cash wallet: how much cash you can carry, deposit, auto-save */}
      <WalletCard />

      {/* Your level: rating and offers accepted */}
      <LevelCard />

      {/* 3. Deliveries by day */}
      <Card>
        <Label>Deliveries</Label>
        {days.length === 0 ? <Body muted>No deliveries yet. Go online on the Drive tab.</Body> : days.map((d) => (
          <View key={d.key} style={{ marginTop: 6 }}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={[s.sub, { fontWeight: "700" }]}>{d.key}</Text>
              <Text style={[s.sub, { fontWeight: "700" }]}>{money(d.items.reduce((sum, x) => sum + Number(x.earned), 0))}</Text>
            </View>
            {d.items.map((x) => (
              <View key={x.deliveryJobId} style={[s.row, { justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }]}>
                <View style={[s.row, { flex: 1 }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.green} style={{ marginRight: 8 }} />
                  <View>
                    <Text style={[s.body, { fontWeight: "700" }]}>Order #{x.orderNumber}</Text>
                    <Text style={s.sub}>{new Date(x.deliveredAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}</Text>
                  </View>
                </View>
                <Text style={[s.body, { fontWeight: "800" }]}>+{money(x.earned)}</Text>
              </View>
            ))}
          </View>
        ))}
      </Card>

      {/* 4. Handovers Sentroh received */}
      {e.handovers.length ? (
        <Card>
          <Label>Handed in to Sentroh</Label>
          {e.handovers.map((h) => (
            <View key={h.id} style={[s.row, { justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "700" }]}>{money(h.amount)}</Text>
                <Text style={s.sub}>{clock(h.at)} · {METHOD[h.method] || "Cash"}</Text>
              </View>
              <Pill text="Received" tone="done" />
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
