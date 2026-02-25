/**
 * Shared mock instances for use in vi.mock factories.
 *
 * IMPORTANT: This file must NOT import anything from the api package (no routers,
 * no root, no trpc) — it is imported inside vi.mock factories to break the
 * circular import chain that would occur if test-utils.ts (which imports appRouter)
 * were used instead.
 */
import { mockDeep } from 'vitest-mock-extended';
import type { PrismaClient } from '@sparkmotion/database';

export const prismaMock = mockDeep<PrismaClient>();
