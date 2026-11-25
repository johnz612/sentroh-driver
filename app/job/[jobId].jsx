import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";

import { StepBar } from "@/components/DriverParts";
import { Body, Button, Card, Chip, Label, Notice, Pill, Screen, s } from "@/components/ui";
import { driverApi } from "@/lib/api";
import { currentPosition, useDriver } from "@/lib/driver";
import { clock, money } from "@/lib/format";
import { call, navigateTo } from "@/lib/nav";
import { fileBytes, prepareProofPhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { C } from "@/lib/theme";

const ORDER_STATE = {
  PREPARING: "The store is preparing it.",
  CONFIRMED: "The store is preparing it.",
  STOCK_ISSUE: "The store is checking stock with the customer. Wait at the store.",
  READY_FOR_PICKUP: "Ready: ask the store for the order.",
  OUT_FOR_DELIVERY: "With you.",
};

function NavButtons({ location }) {
  if (!location) return <Text style={[s.sub, { marginTop: 6 }]}>No map pin. Use the address and landmark.</Text>;
  return (
    <View style={[s.row, { marginTop: 8 }]}>
      <Button title="Google Maps" kind="secondary" onPress={() => navigateTo(location, "google")} style={{ flex: 1, marginRight: 8 }} />
      <Button title="Waze" kind="secondary" onPress={() => navigateTo(location, "waze")} style={{ flex: 1 }} />
    </View>
  );
}

/**
 * One delivery, step by step: store → picked up → at the customer → photo
 * and payment → delivered. Failed is allowed after the waiting time and the
 * required calls.
 */
export default function JobScreen() {
  const { jobId } = useLocalSearchParams();
  const router = useRouter();
  const navigation = useNavigation();
  const job = useDriver((st) => st.jobs.find((j) => j.deliveryJobId === jobId));
  const allJobs = useDriver((st) => st.jobs);
  // Shared trip or Standard run: the other orders picked up with this one (nearest drop-off first).
  // Remember the trip after this job is delivered (it then leaves the list) to offer the next stop.
  const runRef = useRef(null);
  if (job?.runId) runRef.current = job.runId;
  const tripJobs = runRef.current ? allJobs.filter((j) => j.runId === runRef.current) : [];
  const atStore = tripJobs.filter((j) => j.status === "ASSIGNED");
  const together = job?.status === "ASSIGNED" && atStore.length > 1;
  const nextStop = tripJobs.find((j) => j.deliveryJobId !== jobId && j.status !== "ASSIGNED");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [proof, setProof] = useState(null);
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState("");
  const [now, setNow] = useState(Date.now());

  useLayoutEffect(() => {
    navigation.setOptions({
      title: !job ? "Delivery" : together ? `Pick up ${atStore.length} orders` : job.stopCount > 1 ? `Stop ${job.stopNumber} of ${job.stopCount} · #${job.orderNumber}` : `Order #${job.orderNumber}`,
    });
  }, [navigation, job, together, atStore.length]);
  useEffect(() => { useDriver.getState().refreshJobs().catch(setError); }, []);
  useEffect(() => { if (job && !method) setMethod(job.payment.method); }, [job, method]);
  useEffect(() => {
    if (!job?.failAllowedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [job?.failAllowedAt]);

  if (!job) {
    return (
      <Screen>
        {done ? <Card><Pill text="Done" tone="done" /><Body style={{ marginTop: 8 }}>{done}</Body></Card> : <Body muted>This delivery is no longer with you.</Body>}
        <Notice error={error} />
        {nextStop ? (
          <Button title={`Next: stop ${nextStop.stopNumber} · ${nextStop.customer.name}`} kind="attention" style={{ minHeight: 54, marginBottom: 8 }}
            onPress={() => router.replace(`/job/${nextStop.deliveryJobId}`)} />
        ) : null}
        <Button title="Back to Drive" kind={nextStop ? "secondary" : "primary"} onPress={() => router.navigate("/")} />
      </Screen>
    );
  }

  async function step(action, extra = {}, { needGps = false, message } = {}) {
    setBusy(action); setError(null);
    try {
      let pos = {};
      if (needGps) pos = await currentPosition();
      else pos = await currentPosition().catch(() => ({}));
      const json = await driverApi(`/jobs/${job.deliveryJobId}/actions`, { method: "POST", body: { action, ...pos, ...extra } });
      useDriver.getState().setJobs(json.jobs);
      if (message) setDone(message);
      if (json.result?.customerDeliveryBlocked) setDone("Marked as failed. Bring the order back to the store.");
    } catch (err) {
      setError(err.code === "INVALID_TRANSITION" && action === "PICKED_UP" ? new Error("The store has not marked the order ready yet. Ask them, then try again.") : err);
    } finally {
      setBusy(null);
    }
  }

  /** One step for every order of the trip at the store (at the store / picked up). */
  async function tripStep(action) {
    setBusy(action); setError(null);
    try {
      const pos = await currentPosition().catch(() => ({}));
      const json = await driverApi(`/runs/${job.runId}/actions`, { method: "POST", body: { action, ...pos } });
      useDriver.getState().setJobs(json.jobs);
      if (action === "PICKED_UP") {
        const first = (json.jobs || []).find((j) => j.runId === job.runId && j.status === "PICKED_UP");
        if (first && first.deliveryJobId !== job.deliveryJobId) router.replace(`/job/${first.deliveryJobId}`);
        else setDone(`Picked up all ${atStore.length} orders. Go to stop 1 first.`);
      }
    } catch (err) {
      setError(err.code === "ORDERS_NOT_READY"
        ? new Error(`The store has not marked order${err.details?.orderNumbers?.length === 1 ? "" : "s"} ${(err.details?.orderNumbers || []).map((n) => `#${n}`).join(" and ")} ready yet. Ask them, then try again.`)
        : err);
    } finally {
      setBusy(null);
    }
  }

  async function takeProof(fromCamera = true) {
    setError(null);
    const permission = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return setError(new Error("Allow the camera to take the proof-of-delivery photo."));
    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
    if (picked.canceled || !picked.assets?.[0]) return;
    setBusy("proof");
    try {
      const photo = await prepareProofPhoto(picked.assets[0]);
      const { upload } = await driverApi(`/jobs/${job.deliveryJobId}/proof/upload-url`, { method: "POST" });
      const up = await supabase.storage.from("delivery-proofs").uploadToSignedUrl(upload.path, upload.token, await fileBytes(photo.uri), { contentType: "image/jpeg" });
      if (up.error) throw new Error("The photo did not upload. Check your connection and try again.");
      const json = await driverApi(`/jobs/${job.deliveryJobId}/proof`, { method: "POST", body: { path: upload.path } });
      useDriver.getState().setJobs(json.jobs);
      setProof(photo);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  function delivered() {
    if (!job.hasProof) return setError(new Error("Take the proof-of-delivery photo first (the order handed over, or at the door)."));
    if (method === "GCASH" && !reference.trim()) return setError(new Error("Type the GCash reference number from the customer's receipt."));
    const amount = money(job.payment.amountToCollect);
    Alert.alert("Delivered?", `You received ${amount} by ${method === "GCASH" ? "GCash" : "cash"}.`, [
      { text: "Not yet", style: "cancel" },
      {
        text: "Yes, delivered",
        onPress: () => step("DELIVERED", { paymentMethod: method, paymentReference: method === "GCASH" ? reference.trim() : undefined },
          { message: `Delivered! You earned ${money(job.driverPay)}. Keep ${amount} to hand in later (minus your pay).${tripJobs.some((j) => j.deliveryJobId !== job.deliveryJobId && ["PICKED_UP", "ARRIVED"].includes(j.status)) ? " Now go to the next stop." : ""}` }),
      },
    ]);
  }

  function failed() {
    Alert.alert("Mark as failed?", "Only if the customer cannot be reached. Bring the order back to the store.", [
      { text: "Keep trying", style: "cancel" },
      { text: "Mark failed", style: "destructive", onPress: () => step("FAILED", { note: "Customer not reachable" }, { message: "Marked as failed. Bring the order back to the store." }) },
    ]);
  }

  function callCustomer() {
    call(job.customer.phone);
    // Calls count toward "failed delivery" only once at the customer.
    if (job.status === "PICKED_UP" || job.status === "ARRIVED") step("LOG_CALL");
  }

  const failOpen = job.status === "ARRIVED" && job.failAllowedAt && now >= new Date(job.failAllowedAt).getTime()
    && (job.callsRequired == null || job.callAttempts >= job.callsRequired);

  const stepNow = job.status === "ASSIGNED" ? 0 : job.status === "PICKED_UP" ? 1 : 2;

  return (
    <Screen>
      <StepBar current={stepNow} />
      <Notice kind="ok">{done}</Notice>
      <Notice error={error} />

      <Card tone={job.status === "ASSIGNED" ? "attention" : undefined}>
        <View style={[s.row, { justifyContent: "space-between" }]}>
          <Label>1. Pick up at</Label>
          {job.status !== "ASSIGNED" ? <Pill text="Picked up" tone="done" /> : null}
        </View>
        <Text style={[s.body, { fontWeight: "800", fontSize: 17 }]}>{job.store.name}</Text>
        {together ? (
          <>
            <Body>Get all {atStore.length} orders of this trip:</Body>
            {atStore.map((j) => (
              <View key={j.deliveryJobId} style={[s.row, { justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F3D36B" }]}>
                <Text style={[s.body, { fontWeight: "700" }]}>Order #{j.orderNumber}</Text>
                <Pill text={j.orderStatus === "READY_FOR_PICKUP" ? "Ready" : "Being prepared"} tone={j.orderStatus === "READY_FOR_PICKUP" ? "done" : "attention"} />
              </View>
            ))}
            <NavButtons location={job.store.location} />
            <Button title="I'm at the store" kind="secondary" style={{ marginTop: 8 }} busy={busy === "ARRIVED_STORE"} disabled={!!busy} onPress={() => tripStep("ARRIVED_STORE")} />
            <Button title={`I picked up all ${atStore.length} orders`} kind="attention" style={{ marginTop: 8, minHeight: 54 }} busy={busy === "PICKED_UP"} disabled={!!busy} onPress={() => tripStep("PICKED_UP")} />
          </>
        ) : job.status === "ASSIGNED" ? (
          <>
            <Body>{ORDER_STATE[job.orderStatus] || ""}</Body>
            <NavButtons location={job.store.location} />
            <Button title="I'm at the store" kind="secondary" style={{ marginTop: 8 }} busy={busy === "ARRIVED_STORE"} disabled={!!busy} onPress={() => step("ARRIVED_STORE")} />
            <Button title="I picked up the order" kind="attention" style={{ marginTop: 8, minHeight: 54 }} busy={busy === "PICKED_UP"} disabled={!!busy} onPress={() => step("PICKED_UP", {}, { message: "Picked up. Head to the customer." })} />
          </>
        ) : null}
      </Card>

      <Card tone={job.status !== "ASSIGNED" ? "attention" : undefined}>
        <Label>{job.stopCount > 1 ? `2. Stop ${job.stopNumber} of ${job.stopCount}: deliver to` : "2. Deliver to"}</Label>
        <Text style={[s.body, { fontWeight: "800", fontSize: 17 }]}>{job.customer.name}</Text>
        {job.customer.address ? <Body>{job.customer.address}</Body> : null}
        {job.customer.landmark ? <Text style={s.sub}>Landmark: {job.customer.landmark}</Text> : null}
        {job.notes ? <Text style={[s.sub, { marginTop: 4 }]}>Note: {job.notes}</Text> : null}
        {job.status !== "ASSIGNED" ? <NavButtons location={job.customer.location} /> : null}
        <Button title={`Call ${job.customer.phone || "customer"}`} kind="secondary" style={{ marginTop: 8 }} disabled={!job.customer.phone || !!busy} onPress={callCustomer} />
        {job.status === "PICKED_UP" ? (
          <Button title="I'm at the customer" kind="attention" style={{ marginTop: 8, minHeight: 54 }} busy={busy === "ARRIVED_CUSTOMER"} disabled={!!busy}
            onPress={() => step("ARRIVED_CUSTOMER", {}, { needGps: true })} />
        ) : null}
      </Card>

      {job.status === "PICKED_UP" || job.status === "ARRIVED" ? (
        <Card>
          <Label>3. Hand over and get paid</Label>
          <View style={{ backgroundColor: C.ink, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: "#BDBDB8", fontSize: 13, fontWeight: "600" }}>Collect from the customer</Text>
            <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800" }}>{money(job.payment.amountToCollect)}</Text>
            <Text style={{ color: "#BDBDB8", fontSize: 13 }}>
              Items and fees for the order. They chose {job.payment.method === "GCASH" ? "GCash" : "cash"}.
            </Text>
            <View style={{ height: 1, backgroundColor: "#3A3A38", marginVertical: 10 }} />
            {job.deliveryFee != null ? (
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={{ color: "#BDBDB8", fontSize: 14 }}>Delivery fee in it</Text>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>{money(job.deliveryFee)}</Text>
              </View>
            ) : null}
            <View style={[s.row, { justifyContent: "space-between", marginTop: 4 }]}>
              <Text style={{ color: "#BDBDB8", fontSize: 14 }}>
                Your pay{job.deliveryFee ? ` (${Math.round((Number(job.driverPay) / Number(job.deliveryFee)) * 100)}% of the delivery fee)` : ""}
              </Text>
              <Text style={{ color: C.mango, fontSize: 16, fontWeight: "800" }}>{money(job.driverPay)}</Text>
            </View>
            <Text style={{ color: "#BDBDB8", fontSize: 12, marginTop: 6 }}>Keep your pay. The rest is the store's and Sentroh's: hand it in later.</Text>
          </View>
          <Text style={[s.body, { fontWeight: "700", marginTop: 12 }]}>How did they pay?</Text>
          <View style={[s.row, { marginTop: 8 }]}>
            <Chip label="Cash" active={method === "CASH"} onPress={() => setMethod("CASH")} />
            <Chip label="GCash" active={method === "GCASH"} onPress={() => setMethod("GCASH")} />
          </View>
          {method === "GCASH" ? (
            <TextInput placeholder="GCash reference number" placeholderTextColor={C.inkSoft} value={reference} onChangeText={setReference}
              style={[s.input, { marginTop: 8 }]} keyboardType="number-pad" maxLength={30} accessibilityLabel="GCash reference number" />
          ) : null}

          <Text style={[s.body, { fontWeight: "700", marginTop: 12 }]}>Proof of delivery</Text>
          <Text style={s.sub}>A photo of the order with the customer, or at the door.</Text>
          {proof ? <Image source={{ uri: proof.uri }} style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 8, marginTop: 8 }} contentFit="cover" /> : null}
          {job.hasProof && !proof ? <Pill text="Photo saved" tone="done" /> : null}
          <View style={[s.row, { marginTop: 8 }]}>
            <Button title={job.hasProof ? "Retake photo" : "Take photo"} kind={job.hasProof ? "secondary" : "primary"} busy={busy === "proof"} disabled={!!busy}
              onPress={() => takeProof(true)} style={{ flex: 2, marginRight: 8 }} />
            <Button title="Gallery" kind="secondary" disabled={!!busy} onPress={() => takeProof(false)} style={{ flex: 1 }} />
          </View>

          <Button title="Delivered" kind="attention" style={{ marginTop: 12, minHeight: 54 }} busy={busy === "DELIVERED"} disabled={!!busy} onPress={delivered} />
        </Card>
      ) : null}

      {job.status === "ARRIVED" ? (
        <Card>
          <Label>Customer not answering?</Label>
          <Body muted>
            {failOpen
              ? "You waited and called enough. You can mark the delivery failed."
              : `Wait until ${clock(job.failAllowedAt)} and call at least ${job.callsRequired ?? 2} times (calls so far: ${job.callAttempts}).`}
          </Body>
          <Button title="Mark delivery failed" kind="danger" style={{ marginTop: 8 }} disabled={!failOpen || !!busy} busy={busy === "FAILED"} onPress={failed} />
        </Card>
      ) : null}

      <Text style={[s.sub, { textAlign: "center", marginTop: 8, color: C.inkSoft }]}>Keep the app open during the delivery so the customer can follow you.</Text>
    </Screen>
  );
}
