import { useState } from "react";
import { ActivityIndicator, Pressable, Switch, View } from "react-native";
import { Text } from "@/components/AppText";

import { useLoader } from "@/components/hooks";
import { driverApi } from "@/lib/api";
import { apiKey, forgetCached } from "@/lib/cache";
import { clock, money } from "@/lib/format";
import { C } from "@/lib/theme";

const ENTRY = { AUTOSAVE: "Saved from pay", TOPUP: "Top-up", REFUND: "Paid back to you", ADJUST: "Adjustment" };

/**
 * Cash wallet: how much customers' cash the driver may carry (deposit + Sentroh allowance - cash not
 * yet handed in), the hand-in deadline, and the choice to save part of each pay as deposit.
 */
export function WalletCard() {
  const { data, reload } = useLoader(() => driverApi("/wallet"), [], { key: apiKey("/api/v1/driver/wallet"), refreshOnFocusMs: 15000 });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const w = data?.wallet;
  if (!w) return null;

  async function toggle(on) {
    setBusy(true);
    try {
      await driverApi("/wallet/autosave", { method: "POST", body: { on } });
      forgetCached("/api/v1/driver/wallet");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const full = w.deposit >= w.target;
  return (
    <View style={{ backgroundColor: C.surface, borderRadius: 20, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: w.overdueSince ? C.red : C.line }}>
      <Text style={{ fontSize: 16, fontWeight: "800", color: C.ink }}>Cash wallet</Text>

      {w.overdueSince ? (
        <Text style={{ backgroundColor: C.redWash, color: C.red, borderRadius: 10, padding: 10, marginTop: 8, fontWeight: "700" }}>
          Hand in your cash now. It is more than {w.remitByHours} hours old, so you get no cash orders until you do.
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{money(w.cashRoom)}</Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>more cash you can carry now</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.ink }}>{money(w.deposit)}</Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>your deposit</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, color: C.inkSoft, marginTop: 8 }}>
        You can carry up to {money(w.canCarry)} of customers' cash{w.allowance > 0 ? ` (your deposit + ${money(w.allowance)} from Sentroh)` : " (your deposit)"}.
        {" "}Bigger cash orders need a bigger deposit. Hand in cash within {w.remitByHours} hours.
      </Text>

      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>Save {w.autosavePercent}% of my pay to my deposit</Text>
          <Text style={{ fontSize: 12, color: C.inkSoft }}>
            {full ? `Your deposit reached ${money(w.target)}. Saving has stopped.` : `Until it reaches ${money(w.target)}. You can turn it off any time.`}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={C.ink} /> : (
          <Switch value={w.autosave} onValueChange={toggle} disabled={full} accessibilityLabel="Save part of my pay to my deposit"
            trackColor={{ true: C.ink, false: C.line }} thumbColor={w.autosave ? C.mango : "#fff"} />
        )}
      </View>
      <Text style={{ fontSize: 12, color: C.inkSoft, marginTop: 8 }}>
        To add to your deposit now, give it to Sentroh by GCash or at the RSCY counter. You get your deposit back when you stop driving, minus anything you still owe.
      </Text>

      {data.entries?.length ? (
        <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" style={{ marginTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, textDecorationLine: "underline" }}>{open ? "Hide deposit history" : "Deposit history"}</Text>
        </Pressable>
      ) : null}
      {open ? data.entries.map((e) => (
        <View key={e.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
          <Text style={{ fontSize: 13, color: C.inkSoft }}>{ENTRY[e.kind] || e.kind} · {clock(e.at)}</Text>
          <Text style={{ fontSize: 13, fontWeight: "700", color: e.amount < 0 ? C.red : C.ink }}>{money(e.amount)}</Text>
        </View>
      )) : null}
    </View>
  );
}
