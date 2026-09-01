import { z } from 'zod'

/** Shared by the login form and the Server Action, so the two cannot drift. */
export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Enter your user ID')
    .max(64)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1, 'Enter your password').max(200),
})

export type LoginInput = z.infer<typeof loginSchema>
