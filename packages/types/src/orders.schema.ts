import { z } from 'zod';

export const ShippingAddressSchema = z.object({
  fullName: z.string().optional(),
  street: z.string().optional(),
  address: z.string().optional(),
  line1: z.string().optional(),
  city: z.string().optional(),
  pincode: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default('India'),
  phone: z.string().optional(),
});

export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;
