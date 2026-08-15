/**
 * ============================================================================
 * CANONICAL DATABASE SCHEMA — Medini CRM (Sprint 1: Database Foundation)
 * ============================================================================
 * Derived from the locked Production Backend Blueprint v1.0 (§B2) and the
 * MEDINI_ARCHITECTURE contract. Single-tenant (org_id reserved), 14 canonical
 * branches, role-based + branch-scoped. Drizzle ORM / PostgreSQL 16.
 *
 * Conventions:
 *  - uuid PKs (gen_random_uuid()), human codes as unique natural keys (mrn, code)
 *  - audit fields on every table: created_at/created_by/updated_at/updated_by
 *  - soft delete via deleted_at (mutable business records only)
 *  - org_id + branch_id for tenant/branch isolation
 *  - Drizzle check() for DB-enforced invariants
 * ============================================================================
 */
import {
  pgTable, uuid, text, varchar, integer, boolean, date, time,
  timestamp, jsonb, pgEnum, uniqueIndex, index, check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/* ---------- Enums (match locked contract) ---------- */
export const roleEnum = pgEnum('role', ['hq', 'branch_manager', 'branch_admin', 'doctor']);
export const branchTypeEnum = pgEnum('branch_type', ['main', 'affiliate']);
export const branchStatusEnum = pgEnum('branch_status', ['active', 'inactive']);
export const staffStatusEnum = pgEnum('staff_status', ['Active', 'Suspended', 'Deactivated']);
export const roleAssignmentStatusEnum = pgEnum('role_assignment_status', ['ACTIVE', 'SUPERSEDED']);
export const patientStatusEnum = pgEnum('patient_status', ['Active', 'VIP', 'Recall Due', 'Inactive']);
export const paymentStatusEnum = pgEnum('payment_status_type', ['PENDING', 'PAID', 'OVERDUE']);
export const appointmentStatusEnum = pgEnum('appointment_status', [
  'booked', 'confirmed', 'checked-in', 'waiting', 'called', 'in-progress', 'completed', 'cancelled', 'no-show',
]);
export const auditSourceEnum = pgEnum('audit_source', ['api', 'worker', 'integration', 'system']);
export const idempotencyStatusEnum = pgEnum('idempotency_status', ['in_progress', 'completed', 'failed']);

/* ---------- shared audit column helpers ---------- */
const auditCols = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by'),
};

/* ============================================================================
   1. BRANCHES — 14 canonical (10 Medini Dental Clinics + 4 affiliated)
   ==========================================================================*/
export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: varchar('code', { length: 64 }).notNull(),            /* stable string id e.g. 'gelang-patah' */
  shortName: varchar('short_name', { length: 128 }).notNull(),
  fullName: varchar('full_name', { length: 256 }).notNull(),
  location: varchar('location', { length: 256 }),
  type: branchTypeEnum('type').notNull().default('main'),
  status: branchStatusEnum('status').notNull().default('active'),
  whatsappSession: varchar('whatsapp_session', { length: 128 }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('branches_org_code_uq').on(t.orgId, t.code),
  index('branches_org_idx').on(t.orgId),
]);

/* ============================================================================
   2. STAFF — demo users + employees. username immutable.
   ==========================================================================*/
export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 256 }).notNull(),
  username: varchar('username', { length: 128 }).notNull(),     /* immutable after create */
  email: varchar('email', { length: 256 }),
  phone: varchar('phone', { length: 64 }),
  role: roleEnum('role').notNull(),
  status: staffStatusEnum('status').notNull().default('Active'),
  specialization: varchar('specialization', { length: 256 }),
  passwordHash: text('password_hash'),                          /* Argon2id — set in auth task */
  doctorRef: varchar('doctor_ref', { length: 64 }),             /* maps to doctor identity for doctor role */
  mfaEnabled: boolean('mfa_enabled').notNull().default(false),
  mfaSecret: text('mfa_secret'),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('staff_org_username_uq').on(t.orgId, t.username),
  index('staff_branch_idx').on(t.branchId),
  index('staff_role_idx').on(t.role),
  /* NOTE: column refs must be literal — any JS ${} inside sql`` becomes a $1 bind param */
  check('staff_non_hq_requires_branch', sql.raw(`"role" = 'hq' OR branch_id IS NOT NULL`)),
]);

/* ============================================================================
   3. ROLE_ASSIGNMENTS — versioned (never edit in place; SUPERSEDE + new ACTIVE)
   ==========================================================================*/
export const roleAssignments = pgTable('role_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  staffId: uuid('staff_id').notNull().references(() => staff.id, { onDelete: 'cascade' }),
  role: roleEnum('role').notNull(),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'restrict' }),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
  status: roleAssignmentStatusEnum('status').notNull().default('ACTIVE'),
  assignedBy: uuid('assigned_by'),
  ...auditCols,
}, (t) => [
  index('role_assign_staff_idx').on(t.staffId, t.status),
  /* only one ACTIVE assignment per staff — enforced via partial unique index in SQL migration */
]);

/* ============================================================================
   4. PATIENTS — master identity. MRN + IC unique.
   ==========================================================================*/
export const patients = pgTable('patients', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  mrn: varchar('mrn', { length: 32 }).notNull(),                /* MDN-#### */
  name: varchar('name', { length: 256 }).notNull(),
  ic: varchar('ic', { length: 64 }),                            /* IC/Passport — unique when present */
  dob: date('dob'),
  gender: varchar('gender', { length: 8 }),
  nationality: varchar('nationality', { length: 128 }),
  phone: varchar('phone', { length: 64 }),
  whatsapp: varchar('whatsapp', { length: 64 }),
  email: varchar('email', { length: 256 }),
  patientType: varchar('patient_type', { length: 32 }).default('adult'),
  contactType: varchar('contact_type', { length: 32 }).default('own'),
  guardianId: uuid('guardian_id'),
  registrationReason: varchar('registration_reason', { length: 128 }),
  preferredContact: varchar('preferred_contact', { length: 32 }),
  lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
  status: patientStatusEnum('status').notNull().default('Active'),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('patients_org_mrn_uq').on(t.orgId, t.mrn),
  uniqueIndex('patients_org_ic_uq').on(t.orgId, t.ic),
  index('patients_branch_idx').on(t.branchId),
  index('patients_name_idx').on(t.name),
]);

/* ============================================================================
   5. PATIENT_RELATIONSHIPS — family/guardian links
   ==========================================================================*/
export const patientRelationships = pgTable('patient_relationships', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  relatedPatientId: uuid('related_patient_id').references(() => patients.id, { onDelete: 'set null' }),
  relatedName: varchar('related_name', { length: 256 }),        /* when not a registered patient */
  type: varchar('type', { length: 32 }).notNull(),              /* spouse|father|mother|child|sibling|guardian|dependent */
  ...auditCols,
}, (t) => [
  index('patient_rel_patient_idx').on(t.patientId),
  index('patient_rel_related_idx').on(t.relatedPatientId),
]);

/* ============================================================================
   6A. PATIENT_TIMELINE_EVENTS — append-only feed (Sprint 2 T1).
   NOT a source of truth for patient state — a derived activity feed only.
   No updated_at / deleted_at (same append-only discipline as audit_log).
   ==========================================================================*/
export const patientTimelineEvents = pgTable('patient_timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 64 }).notNull(),             /* e.g. registration|relationship_added|appointment_* */
  summary: varchar('summary', { length: 512 }).notNull(),      /* human one-liner */
  payload: jsonb('payload'),                                   /* structured context (no secrets/PII dumps) */
  actorId: uuid('actor_id'),
  actorRole: varchar('actor_role', { length: 32 }),
  source: varchar('source', { length: 32 }).notNull().default('api'),
  correlationId: varchar('correlation_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('patient_timeline_patient_idx').on(t.patientId, t.createdAt),
  index('patient_timeline_type_idx').on(t.type),
]);
/* NOTE: patient_timeline_events has NO updated_at / deleted_at — append-only. */

/* ============================================================================
   6. APPOINTMENTS — appointmentMaster. Status flow enforced.
   ==========================================================================*/
export const appointments = pgTable('appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 32 }).notNull(),              /* APT-#### */
  patientId: uuid('patient_id').references(() => patients.id, { onDelete: 'restrict' }),
  patientName: varchar('patient_name', { length: 256 }).notNull(),
  doctorId: uuid('doctor_id').references(() => staff.id, { onDelete: 'restrict' }),
  treatmentRef: varchar('treatment_ref', { length: 256 }),
  scheduledDate: date('scheduled_date').notNull(),
  scheduledTime: time('scheduled_time').notNull(),
  durationMin: integer('duration_min').notNull().default(30),
  status: appointmentStatusEnum('status').notNull().default('booked'),
  notes: text('notes'),
  version: integer('version').notNull().default(1),             /* optimistic locking */
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('appt_org_code_uq').on(t.orgId, t.code),
  index('appt_branch_date_idx').on(t.branchId, t.scheduledDate),
  index('appt_doctor_date_idx').on(t.doctorId, t.scheduledDate),
  index('appt_patient_idx').on(t.patientId),
  check('appt_duration_positive', sql`duration_min > 0`),
]);

/* ============================================================================
   7. PAYMENT_STATUS — CRM = STATUS LAYER ONLY (v1.1). External payment.
   PENDING / PAID / OVERDUE. NOT a payment gateway.
   ==========================================================================*/
export const paymentStatus = pgTable('payment_status', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  status: paymentStatusEnum('status').notNull().default('PENDING'),
  paidDate: date('paid_date'),
  updatedByRole: varchar('updated_by_role', { length: 32 }),
  paymentReference: varchar('payment_reference', { length: 128 }), /* external ref (FPX/Card) */
  ...auditCols,
}, (t) => [
  uniqueIndex('payment_status_patient_uq').on(t.patientId),
  index('payment_status_branch_idx').on(t.branchId),
  index('payment_status_status_idx').on(t.status),
]);

/* ============================================================================
   8. AUDIT_LOG — append-only, immutable governance/audit trail.
   ==========================================================================*/
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id'),
  actorId: uuid('actor_id'),
  actorRole: varchar('actor_role', { length: 32 }).notNull(),
  action: varchar('action', { length: 128 }).notNull(),
  entity: varchar('entity', { length: 128 }).notNull(),
  entityId: varchar('entity_id', { length: 128 }),
  before: jsonb('before'),
  after: jsonb('after'),
  source: auditSourceEnum('source').notNull().default('api'),
  correlationId: varchar('correlation_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_entity_idx').on(t.entity, t.entityId),
  index('audit_actor_idx').on(t.actorId),
  index('audit_branch_idx').on(t.branchId),
  index('audit_created_idx').on(t.createdAt),
  index('audit_before_gin').using('gin', t.before),
  index('audit_after_gin').using('gin', t.after),
]);
/* NOTE: audit_log has NO updated_at / deleted_at — append-only by design. */

/* ============================================================================
   9. DOMAIN_EVENTS — transactional outbox.
   ==========================================================================*/
export const domainEvents = pgTable('domain_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id'),
  eventType: varchar('event_type', { length: 128 }).notNull(),
  payload: jsonb('payload').notNull(),
  correlationId: varchar('correlation_id', { length: 128 }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
}, (t) => [
  index('domain_events_type_idx').on(t.eventType),
  index('domain_events_unpublished_idx').on(t.publishedAt),
]);

/* ============================================================================
   10. PROCESSED_EVENTS — consumer idempotency (effectively-once).
   ==========================================================================*/
export const processedEvents = pgTable('processed_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  consumer: varchar('consumer', { length: 128 }).notNull(),
  eventId: uuid('event_id').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('processed_events_consumer_event_uq').on(t.consumer, t.eventId),
]);

/* ============================================================================
   11. IDEMPOTENCY_KEYS — duplicate-submission prevention (persistent).
   ==========================================================================*/
export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 256 }).notNull(),
  scope: varchar('scope', { length: 256 }).notNull(),           /* route+actor — prevents cross-user replay */
  status: idempotencyStatusEnum('status').notNull().default('in_progress'),
  response: jsonb('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  uniqueIndex('idempotency_scope_key_uq').on(t.scope, t.key),
  index('idempotency_expires_idx').on(t.expiresAt),
]);

/* ---------- Type exports ---------- */
export type Branch = typeof branches.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type RoleAssignment = typeof roleAssignments.$inferSelect;
export type Patient = typeof patients.$inferSelect;
export type PatientRelationship = typeof patientRelationships.$inferSelect;
export type PatientTimelineEvent = typeof patientTimelineEvents.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type PaymentStatus = typeof paymentStatus.$inferSelect;
export type AuditLog = typeof auditLog.$inferSelect;
export type DomainEvent = typeof domainEvents.$inferSelect;
export type ProcessedEvent = typeof processedEvents.$inferSelect;
export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
