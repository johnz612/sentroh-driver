import Ionicons from "@expo/vector-icons/Ionicons";
import { Tabs } from "expo-router";

import { C } from "@/lib/theme";

export default function TabsLayout() {
  const icon = (name) => ({ color, size }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.teal, headerTintColor: C.ink, sceneStyle: { backgroundColor: C.paper } }}>
      <Tabs.Screen name="index" options={{ title: "Drive", tabBarIcon: icon("navigate-circle-outline") }} />
      <Tabs.Screen name="earnings" options={{ title: "Earnings", tabBarIcon: icon("wallet-outline") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-circle-outline") }} />
    </Tabs>
  );
}
