const dateAtNoon = (value) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
};
export const dateForCalendar = dateAtNoon;
const dateKey = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;

export function buildBookingSchedule({ date, startHour, duration, openHour, closeHour, is24Hour = false }) {
  if (startHour == null || openHour == null || closeHour == null) return [];
  if (!is24Hour && startHour + duration > closeHour) return [];
  const slots = [];
  let day = dateAtNoon(date);
  let hour = startHour;
  let remaining = duration;
  while (remaining > 0) {
    for (let slot = hour; slot < closeHour && remaining > 0; slot += 1) {
      slots.push({ date: dateKey(day), hour: slot });
      remaining -= 1;
    }
    if (remaining > 0) {
      day.setDate(day.getDate() + 1);
      hour = 0;
    }
  }
  return slots.reduce((segments, slot) => {
    const current = segments[segments.length - 1];
    if (!current || current.date !== slot.date) segments.push({ date: slot.date, startHour: slot.hour, endHour: slot.hour + 1 });
    else current.endHour = slot.hour + 1;
    return segments;
  }, []);
}

export const hoursLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;
export const dateLabel = (value) => new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
