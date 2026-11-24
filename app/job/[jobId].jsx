import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { Alert, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";

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
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [proof, setProof] = useState(null);
  const [method, setMethod] = useState(null);
  const [reference, setReference] = useState("");
  const [now, setNow] = useState(Date.now());

  useLayoutEffect(() => { navigation.setOptions({ title: job ? `Order #${job.orderNumber}` : "Delivery" }); }, [navigation, job]);
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
        <Button title="Back to Drive" onPress={() => router.navigate("/")} />
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
          { message: `Delivered! You earned ${money(job.driverPay)}. Keep ${amount} to hand in later (minus your pay).` }),
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

  return (
    <Screen>
      <Notice kind="ok">{done}</Notice>
      <Notice error={error} />

      <Card tone={job.status === "ASSIGNED" ? "attention" : undefined}>
        <Label>1. Pick up at</Label>
        <Text style={[s.body, { fontWeight: "800" }]}>{job.store.name}</Text>
        {job.status === "ASSIGNED" ? (
          <>
            <Body>{ORDER_STATE[job.orderStatus] || ""}</Body>
            <NavButtons location={job.store.location} />
            <Button title="I'm at the store" kind="secondary" style={{ marginTop: 8 }} busy={busy === "ARRIVED_STORE"} disabled={!!busy} onPress={() => step("ARRIVED_STORE")} />
            <Button title="Picked up the order" style={{ marginTop: 8 }} busy={busy === "PICKED_UP"} disabled={!!busy} onPress={() => step("PICKED_UP", {}, { message: "Picked up. Head to the customer." })} />
          </>
        ) : <Pill text="Picked up" tone="done" />}
      </Card>

      <Card tone={job.status !== "ASSIGNED" ? "attention" : undefined}>
        <Label>2. Deliver to</Label>
        <Text style={[s.body, { fontWeight: "800" }]}>{job.customer.name}</Text>
        {job.customer.address ? <Body>{job.customer.address}</Body> : null}
        {job.customer.landmark ? <Text style={s.sub}>Landmark: {job.customer.landmark}</Text> : null}
        {job.notes ? <Text style={[s.sub, { marginTop: 4 }]}>Note: {job.notes}</Text> : null}
        {job.status !== "ASSIGNED" ? <NavButtons location={job.customer.location} /> : null}
        <Button title={`Call ${job.customer.phone || "customer"}`} kind="secondary" style={{ marginTop: 8 }} disabled={!job.customer.phone || !!busy} onPress={callCustomer} />
        {job.status === "PICKED_UP" ? (
          <Button title="I'm at the customer" style={{ marginTop: 8 }} busy={busy === "ARRIVED_CUSTOMER"} disabled={!!busy}
            onPress={() => step("ARRIVED_CUSTOMER", {}, { needGps: true })} />
        ) : null}
      </Card>

      {job.status === "PICKED_UP" || job.status === "ARRIVED" ? (
        <Card>
          <Label>3. Hand over and get paid</Label>
          <Text style={[s.title, { fontSize: 24 }]}>Collect {money(job.payment.amountToCollect)}</Text>
          <Text style={s.sub}>Customer chose {job.payment.method === "GCASH" ? "GCash" : "cash"}. You earn {money(job.driverPay)}.</Text>
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

          <Button title="Delivered" style={{ marginTop: 12 }} busy={busy === "DELIVERED"} disabled={!!busy} onPress={delivered} />
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
