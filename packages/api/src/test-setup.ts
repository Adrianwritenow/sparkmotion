import { vi } from 'vitest';

// Mock @sparkmotion/auth globally to prevent next-auth from importing next/server.
// Tests use createTestCaller which bypasses createTRPCContext entirely, so auth() is never called.
vi.mock('@sparkmotion/auth', () => ({
  auth: vi.fn().mockResolvedValue(null),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

// Also mock the type augmentation import
vi.mock('@sparkmotion/auth/types/next-auth', () => ({}));
