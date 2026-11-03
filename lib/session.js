import { create } from "zustand";

import { api } from "./api";
import { cached, clearCache, loadCache, remember } from "./cache";
import { supabase } from "./supabase";

const ROLES_KEY = "me|roles";

/**
 * Sign-in state and the driver profile.
 * status: loading | signed-out | not-registered | ready | error
 * driver: { riderId, fullName, approvalStatus, availability, canReceiveJobs, ... }
 */
export const useSession = create((set) => ({
  status: "loading",
  phone: null,
  driver: null,
  error: null,

  /** Opens with the profile saved on this phone, then checks with Sentroh. */
  async load() {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) {
      await clearCache();
      return set({ status: "signed-out", driver: null });
    }

    await loadCache(data.session.user.id);
    const saved = cached(ROLES_KEY);
    if (saved) apply(saved);
    else set({ status: "loading", error: null });

    try {
      const json = await api("/api/v1/me/roles");
      const fresh = { phone: json.phone, driver: json.roles?.driver || null };
      remember(ROLES_KEY, fresh);
      apply(fresh);
    } catch (err) {
      if (err.status === 401) {
        await clearCache();
        return set({ status: "signed-out", driver: null });
      }
      if (!saved) set({ status: "error", error: err.message });
    }

    function apply({ phone, driver }) {
      set({ status: driver ? "ready" : "not-registered", phone, driver, error: null });
    }
  },

  /** After sign-up, approval changes or going online/offline. */
  setDriver(driver) {
    const current = cached(ROLES_KEY) || {};
    remember(ROLES_KEY, { ...current, driver });
    set({ driver, status: driver ? "ready" : "not-registered" });
  },
}));
