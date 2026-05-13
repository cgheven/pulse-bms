/**
 * Cache-tag constants used by lib/auth.ts and module data helpers.
 * Mutation server actions call revalidateTag(...) to invalidate.
 */
export const cacheTags = {
  profile:  (userId: string)     => `bms-profile-${userId}`,
  building: (buildingId: string) => `bms-building-${buildingId}`,
  flats:    (buildingId: string) => `bms-flats-${buildingId}`,
  residents:(buildingId: string) => `bms-residents-${buildingId}`,
  staff:    (buildingId: string) => `bms-staff-${buildingId}`,
  invoices: (buildingId: string) => `bms-invoices-${buildingId}`,
  payments: (buildingId: string) => `bms-payments-${buildingId}`,
  expenses: (buildingId: string) => `bms-expenses-${buildingId}`,
  notices:  (buildingId: string) => `bms-notices-${buildingId}`,
  union:    (buildingId: string) => `bms-union-${buildingId}`,
  facility: (buildingId: string) => `bms-facility-${buildingId}`,
  proposals:(buildingId: string) => `bms-proposals-${buildingId}`,
} as const;
