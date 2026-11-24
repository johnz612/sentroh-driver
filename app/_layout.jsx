import {
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold, useFonts,
} from "@expo-google-fonts/archivo";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { FONT } from "@/components/AppText";
import { Button, Loading, Notice, Screen, Title } from "@/components/ui";
import { clearCache } from "@/lib/cache";
import { useDriver } from "@/lib/driver";
import { listenForAlerts, registerForPush } from "@/lib/push";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { C } from "@/lib/theme";

/** Sends people to sign-in, driver sign-up, or the tabs. */
function useGate() {
  const status = useSession((st) => st.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const top = segments[0];
    if (status === "signed-out" && top !== "sign-in") router.replace("/sign-in");
    else if (status === "not-registered" && top !== "register") router.replace("/register");
    else if (status === "ready" && (top === "sign-in" || top === "register")) router.replace("/");
  }, [status, segments, router]);
}

/** Offer alerts: an offer push refreshes the offer at once; tapping a job alert opens the Drive tab. */
function usePush() {
  const status = useSession((st) => st.status);
  const router = useRouter();

  useEffect(() => {
    if (status === "ready") registerForPush();
  }, [status]);

  useEffect(() => listenForAlerts({
    onReceive: (data) => {
      if (data.type === "NEW_OFFER" || data.type === "OFFER_WITHDRAWN") useDriver.getState().refreshOffer().catch(() => {});
    },
    onOpen: (data) => {
      if (data.type === "NEW_OFFER") useDriver.getState().refreshOffer().catch(() => {});
      router.navigate("/");
    },
  }), [router]);
}

function Root() {
  const status = useSession((st) => st.status);
  const error = useSession((st) => st.error);
  const load = useSession((st) => st.load);

  useEffect(() => {
    load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearCache();
        useDriver.getState().setOnlineFlag(false);
        useSession.setState({ status: "signed-out", driver: null });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  useGate();
  usePush();

  if (status === "loading") return <Screen><Loading what="Opening Sentroh Driver" /></Screen>;
  if (status === "error") {
    return (
      <Screen>
        <Title>Cannot reach Sentroh</Title>
        <Notice>{error}</Notice>
        <Button title="Try again" onPress={load} />
      </Screen>
    );
  }

  return (
    <Stack screenOptions={{ headerTintColor: C.ink, headerStyle: { backgroundColor: C.surface }, headerTitleStyle: { fontFamily: FONT[800], fontSize: 18 }, headerShadowVisible: false, contentStyle: { backgroundColor: C.paper } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="register" options={{ title: "Become a Sentroh driver" }} />
      <Stack.Screen name="job/[jobId]" options={{ title: "Delivery" }} />
    </Stack>
  );
}

export default function Layout() {
  // Archivo ships inside the app; wait the moment it takes so no screen shows in the wrong font.
  const [fontsReady] = useFonts({ Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, Archivo_800ExtraBold });
  if (!fontsReady) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
