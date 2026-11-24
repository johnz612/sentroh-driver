import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/AppText";

import { Body, Button, Chip, Field, Notice, Screen, s } from "@/components/ui";
import { api } from "@/lib/api";
import { VEHICLES } from "@/lib/format";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Driver application: name, vehicle and plate. A Sentroh admin approves it. */
export default function Register() {
  const setDriver = useSession((st) => st.setDriver);
  const phone = useSession((st) => st.phone);
  const [fullName, setFullName] = useState("");
  const [vehicleType, setVehicleType] = useState("MOTORCYCLE");
  const [plateNo, setPlateNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const json = await api("/api/v1/driver/register", { method: "POST", body: { fullName, vehicleType, plateNo } });
      setDriver(json.driver);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Body>Deliver Sentroh orders near you and earn for each delivery. Sentroh checks your application and calls you.</Body>
      <View style={{ height: 12 }} />
      <Field label="Full name (as on your driver's license)" value={fullName} onChangeText={setFullName} autoCapitalize="words" maxLength={100} />
      <Text style={s.label}>Vehicle</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
        {VEHICLES.map(([v, text]) => <Chip key={v} label={text} active={vehicleType === v} onPress={() => setVehicleType(v)} />)}
      </View>
      <Field label={vehicleType === "BICYCLE" ? "Plate number (if any)" : "Plate number"} value={plateNo} onChangeText={setPlateNo}
        autoCapitalize="characters" maxLength={15} />
      <Notice error={error} />
      <Button title="Send application" busy={busy} onPress={submit} />
      <Text style={[s.sub, { marginTop: 16 }]}>Signed in as {phone}.</Text>
      <Button title="Sign out" kind="secondary" style={{ marginTop: 8 }} onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
