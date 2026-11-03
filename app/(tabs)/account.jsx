import Constants from "expo-constants";
import { useState } from "react";
import { ScrollView, Text } from "react-native";

import { Body, Button, Card, Label, Notice, Pill, s } from "@/components/ui";
import { useDriver } from "@/lib/driver";
import { VEHICLES } from "@/lib/format";
import { registerForPush, unregisterPush } from "@/lib/push";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { C } from "@/lib/theme";

const STATUS = { APPROVED: ["Approved", "done"], PENDING: ["Waiting for approval", "attention"], SUSPENDED: ["Suspended", "stopped"], REJECTED: ["Not approved", "stopped"] };

export default function Account() {
  const driver = useSession((st) => st.driver);
  const phone = useSession((st) => st.phone);
  const online = useDriver((st) => st.online);
  const jobs = useDriver((st) => st.jobs);
  const [error, setError] = useState(null);
  const [pushInfo, setPushInfo] = useState(null);

  const [statusText, tone] = STATUS[driver?.approvalStatus] || ["—", "muted"];
  const vehicle = VEHICLES.find(([v]) => v === driver?.vehicleType)?.[1];

  async function signOut() {
    setError(null);
    try {
      if (jobs.length) throw new Error("Finish your delivery before signing out.");
      if (online) await useDriver.getState().goOffline();
      await unregisterPush();
      await supabase.auth.signOut();
    } catch (err) {
      setError(err);
    }
  }

  async function testAlerts() {
    const r = await registerForPush();
    setPushInfo(r.ok ? "Offer alerts are on." : r.reason);
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Card>
        <Label>Driver</Label>
        <Text style={[s.body, { fontWeight: "800", fontSize: 18 }]}>{driver?.fullName}</Text>
        <Text style={s.sub}>{phone}</Text>
        {vehicle ? <Text style={s.sub}>{vehicle}{driver?.plateNo ? ` · ${driver.plateNo}` : ""}</Text> : null}
        <Pill text={statusText} tone={tone} />
      </Card>
      <Card>
        <Label>Offer alerts</Label>
        <Body muted>Offers ring and vibrate. You have 30 seconds to accept each one.</Body>
        <Button title="Check offer alerts" kind="secondary" style={{ marginTop: 8 }} onPress={testAlerts} />
        <Notice kind="info">{pushInfo}</Notice>
      </Card>
      <Card>
        <Label>How you get paid</Label>
        <Body muted>
          Customers pay you for each delivery (cash or GCash). You keep your share of the delivery fee and hand in the rest to
          Sentroh. See the Earnings tab.
        </Body>
      </Card>
      <Notice error={error} />
      <Button title="Sign out" kind="secondary" onPress={signOut} />
      <Text style={[s.sub, { textAlign: "center", marginTop: 24, color: C.inkSoft }]}>Sentroh Driver {Constants.expoConfig?.version || ""}</Text>
    </ScrollView>
  );
}
