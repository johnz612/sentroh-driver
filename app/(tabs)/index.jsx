import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Switch, View } from "react-native";
import { Text } from "@/components/AppText";

import { Body, Button, Card, Label, Notice, Pill, s } from "@/components/ui";
import { driverApi } from "@/lib/api";
import { useDriver } from "@/lib/driver";
import { clock, km, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { C } from "@/lib/theme";

const STEP = { ASSIGNED: "Go to the store", PICKED_UP: "On the way to the customer", ARRIVED: "At the customer" };

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
  return (
    <Card tone="attention">
      <View style={[s.row, { justifyContent: "space-between" }]}>
        <Pill text={standard ? `Standard run · ${offer.stops.length} stops` : shared ? `Shared trip · ${offer.stops.length} stops` : "Express delivery"} tone="attention" />
        <Text style={{ fontSize: 22, fontWeight: "800", color: left <= 10 ? C.red : C.ink }}>{left}s</Text>
      </View>
      <Text style={[s.title, { fontSize: 26, marginTop: 8 }]}>You earn {money(offer.driverPay)}</Text>
      <Body>Pick up at {offer.store.name || "the store"} · {km(offer.distanceToStoreKm)} away</Body>
      {standard && offer.departureAt ? <Body>Leaves at {clock(offer.departureAt)}</Body> : null}
      {shared ? <Body>Two neighbours' orders from the same store. Pick up both, deliver one after the other.</Body> : null}
      {offer.stops.map((st) => (
        <Text key={st.orderNumber} style={s.sub}>Order #{st.orderNumber}: {st.barangay || "nearby"}{st.deliveryDistanceKm != null ? `, ${km(st.deliveryDistanceKm)} from the store` : ""}</Text>
      ))}
      <Text style={[s.sub, { marginTop: 4 }]}>Collect {money(offer.amountToCollect)} from {standard || shared ? "each customer" : "the customer"} (cash or GCash).</Text>
      <View style={[s.row, { marginTop: 12 }]}>
        <Button title="Decline" kind="secondary" disabled={busy} onPress={() => onAnswer(false)} style={{ flex: 1, marginRight: 8 }} />
        <Button title="Accept" busy={busy} disabled={busy || left === 0} onPress={() => onAnswer(true)} style={{ flex: 2 }} />
      </View>
    </Card>
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
      <Text style={s.title}>Hi, {driver?.fullName?.split(" ")[0] || "driver"}</Text>

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
        <Card tone={online ? undefined : "attention"}>
          <View style={[s.row, { justifyContent: "space-between" }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.body, { fontWeight: "800", fontSize: 18 }]}>{online ? "You're online" : "You're offline"}</Text>
              <Text style={s.sub}>{online ? (jobs.length ? "Finish your delivery to get the next offer." : "Waiting for offers near you…") : "Go online to receive delivery offers."}</Text>
            </View>
            <Switch value={online} onValueChange={toggle} disabled={busy === "online" || (online && jobs.length > 0)}
              trackColor={{ true: C.green, false: "#CFCFCA" }} thumbColor="#fff" accessibilityLabel="Online" />
          </View>
        </Card>
      )}

      <Notice kind="ok">{info}</Notice>
      <Notice error={error} />

      {online && offer && jobs.length === 0 ? <OfferCard offer={offer} busy={busy === "offer"} onAnswer={answer} /> : null}

      {jobs.length ? <Label>Your deliveries</Label> : null}
      {jobs.map((j) => (
        <Pressable key={j.deliveryJobId} onPress={() => router.push(`/job/${j.deliveryJobId}`)} accessibilityRole="button">
          <Card>
            <View style={[s.row, { justifyContent: "space-between" }]}>
              <Text style={[s.body, { fontWeight: "800" }]}>Order #{j.orderNumber}</Text>
              <Pill text={STEP[j.status] || j.status} tone="active" />
            </View>
            <Body>{j.status === "ASSIGNED" ? j.store.name : j.customer.address || j.customer.name}</Body>
            <Text style={s.sub}>Collect {money(j.payment.amountToCollect)} ({j.payment.method === "GCASH" ? "GCash" : "cash"}) · you earn {money(j.driverPay)}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
