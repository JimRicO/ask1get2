import { expect, test } from "bun:test";
import { restaurantEntriesSchema } from "./restaurant-list";

test("multi-page wine lists retain entries beyond the former 200-row ceiling", () => {
  const entries = Array.from({ length: 201 }, (_, i) => ({ id: `w${i}`, name: `Test wine ${i}`, producer: null, vintage: null, region: null, colour: "unknown", price: null, byTheGlass: false }));
  expect(restaurantEntriesSchema.parse(entries)).toHaveLength(201);
});
test("removing the row ceiling does not accept malformed wines", () => {
  expect(restaurantEntriesSchema.safeParse([{ id: "w0" }]).success).toBe(false);
});