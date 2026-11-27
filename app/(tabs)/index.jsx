import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";

import { BusyHours } from "@/components/BusyHours";
import { Route, TimeBar } from "@/components/DriverParts";
import { useLoader } from "@/components/hooks";
import { Body, Button, Card, Label, Notice, s } from "@/components/ui";
import { driverApi } from "@/lib/api";
import { apiKey } from "@/lib/cache";
import { useDriver } from "@/lib/driver";
import { clock, km, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { C } from "@/lib/theme";

const STEP = { ASSIGNED: "Go to the store", PICKED_UP: "Bring it to the customer", ARRIVED: "Hand it over and get paid" };
const STEP_NO = { ASSIGNED: 1, PICKED_UP: 2, ARRIVED: 3 };

/** Seconds left until `iso`, ticking every second. */
function useSecondsLeft(iso) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iso) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;
}

function OfferCard({ offer, onAnswer, busy }) {
  const left = useSecondsLeft(offer.expiresAt);
  const standard = offer.kind === "STANDARD_RUN";
  // Shared delivery: two neighbours' Express orders from one store, one trip, picked up now.
  const shared = offer.kind === "SHARED_RUN";
  const kind = standard ? `Standard run · ${offer.stops.length} stops` : shared ? `Shared trip · ${offer.stops.length} stops` : "Express delivery";
  const stops = [
    { kind: "PICKUP", title: offer.store.name || "The store", sub: `${km(offer.distanceToStoreKm)} from you${standard && offer.departureAt ? ` · leaves ${clock(offer.departureAt)}` : ""}` },
    ...offer.stops.map((st) => ({
      kind: "DROP", title: st.barangay || "Nearby",
      sub: `Order #${st.orderNumber}${st.deliveryDistanceKm != null ? ` · ${km(st.deliveryDistanceKm)} from the store` : ""}`,
    })),
  ];
  return (
    <View style={{ backgroundColor: C.ink, borderRadius: 20, padding: 18, marginBottom: 12 }}>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 10 }]}>
        <Text style={{ color: C.mango, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 }}>NEW OFFER · {kind.toUpperCase()}</Text>
        <Text style={{ color: left <= 10 ? "#FF6B5B" : "#fff", fontSize: 18, fontWeight: "800" }}>{left}s</Text>
      </View>
      <TimeBar left={left} />

      <Text style={{ color: "#BDBDB8", fontSize: 14, fontWeight: "600", marginTop: 14 }}>You earn</Text>
      <Text style={{ color: "#fff", fontSize: 40, fontWeight: "800", lineHeight: 46 }}>{money(offer.driverPay)}</Text>
      {offer.deliveryFee ? <Text style={{ color: "#BDBDB8", fontSize: 13 }}>Your share of the {money(offer.deliveryFee)} delivery fee</Text> : null}

      <Route stops={stops} dark />
      {shared ? <Text style={{ color: "#BDBDB8", fontSize: 13, marginTop: 10 }}>Two neighbours, one store. Pick up both orders, then deliver one after the other.</Text> : null}

      <View style={{ backgroundColor: "#262624", borderRadius: 12, padding: 12, marginTop: 14, flexDirection: "row", alignItems: "center" }}>
        <Ionicons name="cash-outline" size={20} color={C.mango} style={{ marginRight: 10 }} />
        <Text style={{ color: "#fff", fontSize: 14, flex: 1 }}>
          Collect <Text style={{ fontWeight: "800" }}>{money(offer.amountToCollect)}</Text> from {standard || shared ? "each customer" : "the customer"} (cash or GCash)
        </Text>
      </View>

      <View style={[s.row, { marginTop: 14 }]}>
        <Pressable onPress={() => onAnswer(false)} disabled={busy} accessibilityRole="button"
          style={({ pressed }) => [{ flex: 1, minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: "#5A5A57", alignItems: "center", justifyContent: "center", marginRight: 10 }, pressed && { opacity: 0.7 }]}>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>Decline</Text>
        </Pressable>
        <Pressable onPress={() => onAnswer(true)} disabled={busy || left === 0} accessibilityRole="button"
          style={({ pressed }) => [{ flex: 2, minHeight: 52, borderRadius: 999, backgroundColor: C.mango, alignItems: "center", justifyContent: "center" }, (busy || left === 0) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={C.ink} /> : <Text style={{ color: C.ink, fontSize: 17, fontWeight: "800" }}>Accept</Text>}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Cards for the Drive tab: a trip still at the store is one card (one pickup for all its
 * orders); once picked up, one card per stop, nearest first (the API sends them in order).
 */
function tripCards(jobs) {
  const cards = [];
  const atStore = new Map();
  for (const j of jobs) {
    if (j.runId && j.status === "ASSIGNED") {
      if (atStore.has(j.runId)) { atStore.get(j.runId).jobs.push(j); continue; }
      const card = { key: `run-${j.runId}`, jobs: [j] };
      atStore.set(j.runId, card);
      cards.push(card);
    } else {
      cards.push({ key: j.deliveryJobId, jobs: [j] });
    }
  }
  return cards;
}

/** Online / offline: one big switch the driver can't miss. */
function StatusCard({ online, hasJob, busy, onToggle }) {
  return (
    <View style={{ backgroundColor: online ? C.ink : C.surface, borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: online ? 0 : 1, borderColor: C.line }}>
      <View style={s.row}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: online ? "#3DDC84" : "#BDBDB8", marginRight: 8 }} />
        <Text style={{ fontSize: 20, fontWeight: "800", color: online ? "#fff" : C.ink }}>{online ? (hasJob ? "On a delivery" : "You're online") : "You're offline"}</Text>
      </View>
      <Text style={{ fontSize: 14, color: online ? "#BDBDB8" : C.inkSoft, marginTop: 4 }}>
        {online
          ? hasJob ? "Finish this delivery to get the next offer." : "Waiting for offers near you. Keep the app open."
          : "Go online to get delivery offers near you."}
      </Text>
      {online ? (
        !hasJob ? (
          <Pressable onPress={() => onToggle(false)} disabled={busy} accessibilityRole="button"
            style={({ pressed }) => [{ marginTop: 14, minHeight: 46, borderRadius: 999, borderWidth: 1, borderColor: "#5A5A57", alignItems: "center", justifyContent: "center" }, pressed && { opacity: 0.7 }]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>Go offline</Text>}
          </Pressable>
        ) : null
      ) : (
        <Button title="Go online" kind="attention" busy={busy} onPress={() => onToggle(true)} style={{ marginTop: 14, minHeight: 54 }} />
      )}
    </View>
  );
}

/**
 * Drive: go online, answer offers (30 seconds each), see current deliveries.
 * Offers arrive by push and are also checked every few seconds while online.
 */
export default function Drive() {
  const router = useRouter();
  const driver = useSession((st) => st.driver);
  const setDriver = useSession((st) => st.setDriver);
  const online = useDriver((st) => st.online);
  const offer = useDriver((st) => st.offer);
  const jobs = useDriver((st) => st.jobs);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const approved = driver?.approvalStatus === "APPROVED";
  const { data: pay } = useLoader(() => driverApi("/earnings"), [], { key: apiKey("/api/v1/driver/earnings"), refreshOnFocusMs: 15000 });
  const today = pay?.earnings?.today;
  const { data: walletData } = useLoader(() => driverApi("/wallet"), [], { key: apiKey("/api/v1/driver/wallet"), refreshOnFocusMs: 15000 });
  const wallet = walletData?.wallet;
  const toHandIn = pay?.earnings?.cash?.toRemit ?? 0;

  const sync = useCallback(async () => {
    try {
      const me = await driverApi("/me");
      setDriver(me.driver);
      useDriver.getState().setOnlineFlag(me.driver.availability === "ONLINE");
      if (me.driver.approvalStatus !== "APPROVED") return;
      const d = useDriver.getState();
      await Promise.all([d.refreshJobs(), d.online ? d.refreshOffer() : Promise.resolve()]);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, [setDriver]);

  // On opening the tab and every 5 s while online and free (push is the fast path; this is the backup).
  useFocusEffect(useCallback(() => {
    sync();
    const t = setInterval(() => {
      const d = useDriver.getState();
      if (!d.online) return;
      if (d.jobs.length === 0) d.refreshOffer().catch(() => {});
      else d.refreshJobs().catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [sync]));

  async function toggle(next) {
    setBusy("online"); setError(null); setInfo(null);
    try {
      if (next) await useDriver.getState().goOnline(); else await useDriver.getState().goOffline();
      setInfo(next ? "You're online. Keep Sentroh Driver open to receive offers." : "You're offline.");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function answer(accept) {
    if (!offer) return;
    setBusy("offer"); setError(null);
    try {
      const json = await driverApi(`/offers/${offer.offerId}/respond`, { method: "POST", body: { accept } });
      useDriver.getState().setOffer(null);
      if (accept) {
        useDriver.getState().setJobs(json.jobs);
        if (json.jobs?.[0]) router.push(`/job/${json.jobs[0].deliveryJobId}`);
      }
    } catch (err) {
      useDriver.getState().setOffer(null);
      setError(err.code === "OFFER_EXPIRED" ? new Error("Too late: that offer went to another driver.") : err);
    } finally {
      setBusy(null);
    }
  }

  async function pull() {
    setRefreshing(true);
    await sync();
    setRefreshing(false);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={C.teal} />}>
      <View style={[s.row, { justifyContent: "space-between", marginBottom: 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.sub}>Hi, {driver?.fullName?.split(" ")[0] || "driver"}</Text>
          <Text style={[s.title, { fontSize: 22 }]}>{today ? `${money(today.earned)} today` : "Today"}</Text>
          {today ? <Text style={s.sub}>{today.deliveries} deliver{today.deliveries === 1 ? "y" : "ies"}</Text> : null}
        </View>
        {toHandIn > 0 ? (
          <Pressable onPress={() => router.navigate("/earnings")} accessibilityRole="button"
            style={{ backgroundColor: C.mangoWash, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, alignItems: "flex-end" }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.mangoInk }}>To hand in</Text>
            <Text style={{ fontSize: 16, fontWeight: "800", color: C.ink }}>{money(toHandIn)}</Text>
          </Pressable>
        ) : null}
      </View>

      {!approved ? (
        <Card tone="attention">
          <Label>{driver?.approvalStatus === "PENDING" ? "Waiting for approval" : driver?.approvalStatus === "SUSPENDED" ? "Account suspended" : "Not approved"}</Label>
          <Body>
            {driver?.approvalStatus === "PENDING"
              ? "Sentroh is checking your application and will call you. You can go online once you're approved."
              : "You cannot receive deliveries right now. Contact Sentroh for help."}
          </Body>
        </Card>
      ) : (
        <StatusCard online={online} hasJob={jobs.length > 0} busy={busy === "online"} onToggle={toggle} />
      )}

      {approved && wallet?.overdueSince ? (
        <Pressable onPress={() => router.navigate("/earnings")} accessibilityRole="button">
          <Card tone="danger">
            <Label>Hand in your cash</Label>
            <Body>Your cash is more than {wallet.remitByHours} hours old. You get no cash orders until you hand it in.</Body>
          </Card>
        </Pressable>
      ) : approved && wallet && wallet.cashRoom < 300 ? (
        <Pressable onPress={() => router.navigate("/earnings")} accessibilityRole="button">
          <Card tone="attention">
            <Label>Room for cash orders: {money(wallet.cashRoom)}</Label>
            <Body>You only get orders the customer already paid, or small cash orders. Hand in cash or add to your deposit to get more.</Body>
          </Card>
        </Pressable>
      ) : null}

      <Notice kind="ok">{info}</Notice>
      <Notice error={error} />

      {online && offer && jobs.length === 0 ? <OfferCard offer={offer} busy={busy === "offer"} onAnswer={answer} /> : null}

      {jobs.length ? <Label>Your delivery</Label> : null}
      {tripCards(jobs).map((card) => {
        const j = card.jobs[0];
        const pickup = card.jobs.every((x) => x.status === "ASSIGNED");
        const many = card.jobs.length > 1;
        const collect = card.jobs.reduce((sum, x) => sum + Number(x.payment.amountToCollect || 0), 0);
        const pay = card.jobs.reduce((sum, x) => sum + Number(x.driverPay || 0), 0);
        const title = many && pickup ? `Pick up ${card.jobs.length} orders` : j.stopCount > 1 ? `Stop ${j.stopNumber} of ${j.stopCount} · #${j.orderNumber}` : `Order #${j.orderNumber}`;
        return (
          <Pressable key={card.key} onPress={() => router.push(`/job/${j.deliveryJobId}`)} accessibilityRole="button"
            style={({ pressed }) => [s.card, { borderColor: C.ink, borderWidth: 2 }, pressed && { opacity: 0.8 }]}>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={[s.body, { fontWeight: "800", fontSize: 17 }]}>{title}</Text>
              <Text style={[s.sub, { fontWeight: "700" }]}>Step {STEP_NO[j.status] || 1} of 3</Text>
            </View>
            {many && pickup ? <Text style={s.sub}>{card.jobs.map((x) => `#${x.orderNumber}`).join(" + ")} · one trip</Text> : null}
            <View style={[s.row, { marginTop: 8 }]}>
              <Ionicons name={pickup ? "storefront" : "home"} size={18} color={C.ink} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={[s.body, { fontWeight: "700" }]}>{STEP[j.status] || j.status}</Text>
                <Text style={s.sub}>{pickup ? j.store.name : j.customer.address || j.customer.name}</Text>
              </View>
            </View>
            <View style={[s.row, { justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }]}>
              <Text style={s.sub}>Collect <Text style={{ fontWeight: "800", color: C.ink }}>{money(collect)}</Text>{many && pickup ? " in all" : ` (${j.payment.method === "GCASH" ? "GCash" : "cash"})`}</Text>
              <Text style={s.sub}>You earn <Text style={{ fontWeight: "800", color: C.ink }}>{money(pay)}</Text></Text>
            </View>
            <Text style={[s.body, { fontWeight: "800", marginTop: 10, textAlign: "center" }]}>Open delivery ›</Text>
          </Pressable>
        );
      })}

      {approved && !offer && jobs.length === 0 ? <BusyHours online={online} /> : null}

      {approved && online && !offer && jobs.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Ionicons name="radio-outline" size={36} color={C.inkSoft} />
          <Text style={[s.sub, { marginTop: 6, textAlign: "center" }]}>Offers show here and ring your phone.{"\n"}You have 30 seconds to accept each one.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
