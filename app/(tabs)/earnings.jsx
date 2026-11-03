import { RefreshControl, ScrollView, Text, View } from "react-native";

import { useLoader } from "@/components/hooks";
import { Body, Card, Label, Notice, Skeleton, s } from "@/components/ui";
import { driverApi } from "@/lib/api";
import { apiKey } from "@/lib/cache";
import { clock, dayLabel, money } from "@/lib/format";
import { C } from "@/lib/theme";

function Big({ label, value, sub }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.sub}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: "800", color: C.ink }}>{value}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

/**
 * Earnings: what the driver made (their share of each delivery fee) and the
 * customers' money still to hand in to Sentroh.
 */
export default function Earnings() {
  const { data, error, refreshing, refresh } = useLoader(() => driverApi("/earnings"), [], { key: apiKey("/api/v1/driver/earnings"), refreshOnFocusMs: 5000 });

  if (!data) {
    return <ScrollView style={s.screen} contentContainerStyle={s.content}>{error ? <Notice error={error} /> : <Skeleton kind="cards" rows={3} pad={0} what="Loading earnings" />}</ScrollView>;
  }
  const e = data.earnings;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.teal} />}>
      <Notice error={error} />
      <Card>
        <View style={s.row}>
          <Big label="Today" value={money(e.today.earned)} sub={`${e.today.deliveries} deliveries`} />
          <Big label="Last 7 days" value={money(e.last7Days.earned)} sub={`${e.last7Days.deliveries} deliveries`} />
        </View>
      </Card>

      <Card tone={e.cash.toRemit > 0 ? "attention" : undefined}>
        <Label>Cash to hand in to Sentroh</Label>
        <Text style={{ fontSize: 28, fontWeight: "800", color: C.ink }}>{money(e.cash.toRemit)}</Text>
        <Body muted>
          You collected {money(e.cash.collected)} from customers and keep {money(e.cash.earned)} as your pay
          {e.cash.remitted ? `; ${money(e.cash.remitted)} already handed in` : ""}. Hand in the rest by cash or GCash; Sentroh records it.
        </Body>
        {e.cash.lastRemittedAt ? <Text style={[s.sub, { marginTop: 4 }]}>Last handover {clock(e.cash.lastRemittedAt)}</Text> : null}
      </Card>

      {e.byDay.length ? (
        <Card>
          <Label>By day</Label>
          {e.byDay.map((d) => (
            <View key={d.day} style={[s.row, { justifyContent: "space-between", paddingVertical: 3 }]}>
              <Text style={s.body}>{dayLabel(d.day)}</Text>
              <Text style={s.body}>{d.deliveries} × · {money(d.earned)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Label>Recent deliveries</Label>
        {e.recentDeliveries.length === 0 ? <Body muted>No deliveries yet. Go online on the Drive tab.</Body> : e.recentDeliveries.map((d) => (
          <View key={d.deliveryJobId} style={[s.row, { justifyContent: "space-between", paddingVertical: 3 }]}>
            <Text style={[s.body, { flex: 1 }]}>#{d.orderNumber} · {clock(d.deliveredAt)}</Text>
            <Text style={s.body}>+{money(d.earned)}</Text>
          </View>
        ))}
      </Card>

      {e.handovers.length ? (
        <Card>
          <Label>Handovers</Label>
          {e.handovers.map((h) => (
            <View key={h.id} style={[s.row, { justifyContent: "space-between", paddingVertical: 3 }]}>
              <Text style={[s.body, { flex: 1 }]}>{clock(h.at)} · {h.method === "GCASH" ? "GCash" : h.method === "BANK" ? "Bank" : "Cash"}</Text>
              <Text style={s.body}>{money(h.amount)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
