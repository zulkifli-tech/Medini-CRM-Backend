/**
 * Administration domain — lifecycle state machines (Sprint 7 T1).
 * Pure functions only: no I/O, no DB. Mirrors whatsapp-lifecycle discipline.
 *
 * Staff lifecycle (approved G2 — additive INVITED):
 *   INVITED → ACTIVE → SUSPENDED → ACTIVE
 *                 ↘ DEACTIVATED ↗ (reactivate → ACTIVE)
 *   No destructive delete. Records are preserved (governance).
 *
 * Role assignment lifecycle (S1, locked):
 *   ACTIVE → SUPERSEDED (when a new ACTIVE assignment supersedes)
 *   No in-place edit; every change = new ACTIVE record + old SUPERSEDED.
 */

export type StaffStatus = 'Invited' | 'Active' | 'Suspended' | 'Deactivated';

const STAFF_TRANSITIONS: Record<StaffStatus, readonly StaffStatus[]> = {
  Invited: ['Active'],
  Active: ['Suspended', 'Deactivated'],
  Suspended: ['Active', 'Deactivated'],
  Deactivated: ['Active'], /* reactivate (HQ only) */
};

export function canTransitionStaffStatus(from: StaffStatus, to: StaffStatus): boolean {
  return (STAFF_TRANSITIONS[from] ?? []).includes(to);
}

/** Lifecycle transition commands exposed by the Administration API. */
export type StaffCommand = 'activate' | 'suspend' | 'deactivate' | 'reactivate';

/** Maps a command to its target status (undefined = not a lifecycle command). */
export function staffCommandTarget(command: StaffCommand): StaffStatus {
  switch (command) {
    case 'activate': return 'Active';
    case 'suspend': return 'Suspended';
    case 'deactivate': return 'Deactivated';
    case 'reactivate': return 'Active';
  }
}
