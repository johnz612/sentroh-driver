const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 });

export const money = (v) => (v == null ? "—" : peso.format(Number(v)));

/** Time in the Philippines, like "9:50 PM" (with the day when not today). */
export function clock(value) {
  if (!value) return "";
  const d = new Date(value);
  const opts = { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" };
  const sameDay = new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }) === d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
  return sameDay ? d.toLocaleTimeString("en-PH", opts) : d.toLocaleString("en-PH", { ...opts, weekday: "short", month: "short", day: "numeric" });
}

/** "Mon, Nov 3" for a YYYY-MM-DD day. */
export const dayLabel = (ymd) => new Date(`${ymd}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });

export const km = (v) => (v == null ? "" : `${Number(v).toFixed(1)} km`);

export const VEHICLES = [["MOTORCYCLE", "Motorcycle"], ["BICYCLE", "Bicycle"], ["TRICYCLE", "Tricycle"], ["CAR", "Car"]];
