import { z } from 'zod'

/** Shared by the user forms and their Server Actions. */

export const USER_ROLES = ['ADMIN', 'ACCOUNTANT', 'COUNSELOR', 'AGENT', 'VIEWER'] as const

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'User ID: 3–32 lowercase letters, digits, dots, dashes or underscores')

const password = z
  .string()
  .min(10, 'Passwords need at least 10 characters')
  .max(200, 'Passwords are limited to 200 characters')

const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email')
  .transform((v) => v || undefined)
  .optional()

const optionalId = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional()

export const createUserSchema = z
  .object({
    username,
    name: z.string().trim().min(2, 'Name is required').max(100),
    email: optionalEmail,
    role: z.enum(USER_ROLES, { message: 'Choose a role' }),
    tempPassword: password,
    counselorId: optionalId,
    agentId: optionalId,
  })
  .refine((v) => v.tempPassword.toLowerCase() !== v.username, {
    path: ['tempPassword'],
    message: 'The password cannot be the user ID',
  })

export type CreateUserInput = z.infer<typeof createUserSchema>

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, 'Name is required').max(100),
  email: optionalEmail,
  role: z.enum(USER_ROLES, { message: 'Choose a role' }),
  counselorId: optionalId,
  agentId: optionalId,
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  tempPassword: password,
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(200),
    newPassword: password,
    confirmPassword: z.string().max(200),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'The two new passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a password you have not used',
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
