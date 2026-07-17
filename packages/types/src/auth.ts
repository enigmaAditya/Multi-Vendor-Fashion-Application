import { z } from "zod";

// OTP Request Schema
export const OtpRequestSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      "Invalid phone number format (E.164 expected)",
    ),
});

export type OtpRequest = z.infer<typeof OtpRequestSchema>;

// OTP Verify Schema
export const OtpVerifySchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(
      /^\+?[1-9]\d{1,14}$/,
      "Invalid phone number format (E.164 expected)",
    ),
  code: z.string().length(6).regex(/^\d+$/, "OTP must be a 6-digit number"),
});

export type OtpVerify = z.infer<typeof OtpVerifySchema>;

// OAuth Google Schema
export const GoogleAuthSchema = z.object({
  idToken: z.string().min(1, "ID token is required"),
});

export type GoogleAuth = z.infer<typeof GoogleAuthSchema>;

// JWT Claims Schema
export const JwtPayloadSchema = z.object({
  sub: z.string(),
  roles: z.array(z.string()),
  token_version: z.number().int(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

// User Response Schema (for frontend/auth responses)
export const UserResponseSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  roles: z.array(z.string()),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

// Auth Response Schema
export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: UserResponseSchema,
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;
