import { expect, test } from "bun:test";
import { fitPhoto } from "./image-size";

test("camera photos keep their portrait orientation and fit within 1600 pixels", () => {
  expect(fitPhoto(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  expect(fitPhoto(4000, 3000)).toEqual({ width: 1600, height: 1200 });
});
test("small label images are never enlarged", () => {
  expect(fitPhoto(400, 600)).toEqual({ width: 400, height: 600 });
});