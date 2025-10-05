import { z } from "zod";

const currentYear = new Date().getFullYear();

export const wineFormSchema = z.object({
  wine_name: z.string()
    .trim()
    .min(1, { message: "Wine name is required" })
    .max(200, { message: "Wine name must be less than 200 characters" }),
  
  producer: z.string()
    .trim()
    .max(200, { message: "Producer name must be less than 200 characters" })
    .optional()
    .nullable(),
  
  vintage_year: z.number()
    .int()
    .min(1800, { message: "Vintage year must be 1800 or later" })
    .max(currentYear + 1, { message: `Vintage year cannot be later than ${currentYear + 1}` })
    .optional()
    .nullable(),
  
  wine_type: z.enum(['red', 'white', 'rose', 'sparkling', 'dessert', 'fortified'])
    .optional()
    .nullable(),
  
  country: z.string()
    .trim()
    .max(100, { message: "Country must be less than 100 characters" })
    .optional()
    .nullable(),
  
  region: z.string()
    .trim()
    .max(200, { message: "Region must be less than 200 characters" })
    .optional()
    .nullable(),
  
  appellation: z.string()
    .trim()
    .max(200, { message: "Appellation must be less than 200 characters" })
    .optional()
    .nullable(),
  
  alcohol_content: z.number()
    .min(0, { message: "Alcohol content must be 0 or higher" })
    .max(100, { message: "Alcohol content cannot exceed 100%" })
    .optional()
    .nullable(),
  
  current_stock: z.number()
    .int()
    .min(0, { message: "Stock cannot be negative" })
    .max(99999, { message: "Stock value too large" }),
  
  price_per_bottle: z.number()
    .min(0, { message: "Price cannot be negative" })
    .max(999999.99, { message: "Price value too large" })
    .optional()
    .nullable(),
  
  storage_location: z.string()
    .trim()
    .max(500, { message: "Storage location must be less than 500 characters" })
    .optional()
    .nullable(),
  
  notes: z.string()
    .trim()
    .max(2000, { message: "Notes must be less than 2000 characters" })
    .optional()
    .nullable(),
  
  description: z.string()
    .trim()
    .max(2000, { message: "Description must be less than 2000 characters" })
    .optional()
    .nullable(),
  
  grape_varietals: z.string()
    .trim()
    .max(500, { message: "Grape varietals must be less than 500 characters" })
    .optional()
    .nullable(),
  
  optimal_drinking_window: z.string()
    .trim()
    .max(200, { message: "Optimal drinking window must be less than 200 characters" })
    .optional()
    .nullable(),
});

export type WineFormData = z.infer<typeof wineFormSchema>;

// Helper to validate and sanitize form data before submission
export function validateWineData(data: any): { success: boolean; data?: WineFormData; error?: string } {
  try {
    // Convert string inputs to appropriate types
    const processedData = {
      ...data,
      vintage_year: data.vintage_year ? parseInt(data.vintage_year) : null,
      alcohol_content: data.alcohol_content ? parseFloat(data.alcohol_content) : null,
      current_stock: data.current_stock ? parseInt(data.current_stock) : 1,
      price_per_bottle: data.price_per_bottle ? parseFloat(data.price_per_bottle) : null,
    };

    const validated = wineFormSchema.parse(processedData);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return { success: false, error: firstError.message };
    }
    return { success: false, error: "Invalid input data" };
  }
}
