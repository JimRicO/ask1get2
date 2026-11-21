import { expect, test } from "bun:test";
import { createCaptureLease } from "./capture-lease";

test("closing during microphone permission releases the late stream", () => {
  let stops = 0;
  const lease = createCaptureLease();
  const ticket = lease.begin();
  lease.release();
  expect(lease.accept(ticket, { getTracks: () => [{ stop: () => stops++ }] })).toBe(false);
  expect(stops).toBe(1);
});
test("cancel releases every active microphone track", () => {
  let stops = 0;
  const lease = createCaptureLease();
  expect(lease.accept(lease.begin(), { getTracks: () => [{ stop: () => stops++ }, { stop: () => stops++ }] })).toBe(true);
  lease.release();
  expect(stops).toBe(2);
});