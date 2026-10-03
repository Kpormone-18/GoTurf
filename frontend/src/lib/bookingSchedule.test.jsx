import { buildBookingSchedule } from "./bookingSchedule";

test("moves a 24/7 package through midnight", () => {
  expect(buildBookingSchedule({ date: "2026-10-22", startHour: 15, duration: 15, openHour: 0, closeHour: 24, is24Hour: true })).toEqual([
    { date: "2026-10-22", startHour: 15, endHour: 24 },
    { date: "2026-10-23", startHour: 0, endHour: 6 },
  ]);
});

test("does not extend a standard pitch beyond its closing time", () => {
  expect(buildBookingSchedule({ date: "2026-10-22", startHour: 15, duration: 15, openHour: 6, closeHour: 23 })).toEqual([]);
});
