import { z } from "zod";

export const LIST_COLOURS = ["red", "white", "rose", "sparkling", "sweet", "fortified", "unknown"] as const;
export const listEntrySchema = z.object({
  id: z.string().min(1).max(16),
  name: z.string().min(1).max(200),
  producer: z.string().max(200).nullable(),
  vintage: z.number().nullable(),
  region: z.string().max(200).nullable(),
  colour: z.enum(LIST_COLOURS),
  price: z.string().max(80).nullable(),
  byTheGlass: z.boolean(),
});
export const restaurantEntriesSchema = z.array(listEntrySchema).min(1);