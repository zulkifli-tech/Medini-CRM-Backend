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
/* Sprint 2A T1 — shared by panel_companies + insurance_companies (org-wide payor master data). */
export const payorStatusEnum = pgEnum('payor_status', ['Active', 'Inactive']);
/* Sprint 3 (S3-A) — clinical domain enums (migrations 0007/0008). */
export const encounterStatusEnum = pgEnum('encounter_status', ['open', 'completed', 'cancelled']);
export const planStatusEnum = pgEnum('plan_status', ['draft', 'proposed', 'accepted', 'active', 'completed', 'cancelled']);
export const planItemStatusEnum = pgEnum('plan_item_status', ['pending', 'done']);
export const toothConditionEnum = pgEnum('tooth_condition', ['healthy', 'decayed', 'filled', 'missing', 'crowned', 'root_canal', 'implant']);
export const consentMethodEnum = pgEnum('consent_method', ['verbal', 'written', 'electronic']);
export const imagingKindEnum = pgEnum('imaging_kind', ['xray', 'cbct', 'opg', 'photo', 'before_after', 'consent', 'document']);
export const adverseSeverityEnum = pgEnum('adverse_severity', ['mild', 'moderate', 'severe']);
export const referralStatusEnum = pgEnum('referral_status', ['pending', 'sent', 'acknowledged', 'completed']);

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
   12. PANEL_COMPANIES — org-wide payor master data (Sprint 2A T1).
   NO branch_id by design: payer references are reusable across branches.
   NO invoice/payment/revenue/outstanding/bukku columns (ADR-004).
   RLS (0006): read = hq/branch_manager; write = hq only.
   ==========================================================================*/
export const panelCompanies = pgTable('panel_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: varchar('code', { length: 32 }).notNull(),              /* PNL-#### (allocator: 2A-T2) */
  name: varchar('name', { length: 256 }).notNull(),
  pic: varchar('pic', { length: 256 }),
  phone: varchar('phone', { length: 64 }),
  address: text('address'),
  status: payorStatusEnum('status').notNull().default('Active'),
  source: varchar('source', { length: 16 }).notNull().default('custom'), /* custom|builtin|seed */
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('panel_companies_org_code_uq').on(t.orgId, t.code),
  index('panel_companies_org_status_idx').on(t.orgId, t.status),
  /* case-insensitive name uniqueness per org = partial functional index
     (org_id, lower(name)) WHERE deleted_at IS NULL — SQL in 0006 migration
     (same convention as nullable patients_org_ic_uq: live rows only). */
]);

/* ============================================================================
   13. INSURANCE_COMPANIES — org-wide insurance master data (initially empty).
   Same conventions as panel_companies.
   ==========================================================================*/
export const insuranceCompanies = pgTable('insurance_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: varchar('code', { length: 32 }).notNull(),              /* INS-#### (allocator: 2A-T2) */
  name: varchar('name', { length: 256 }).notNull(),
  pic: varchar('pic', { length: 256 }),
  phone: varchar('phone', { length: 64 }),
  address: text('address'),
  status: payorStatusEnum('status').notNull().default('Active'),
  source: varchar('source', { length: 16 }).notNull().default('custom'),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('insurance_companies_org_code_uq').on(t.orgId, t.code),
  index('insurance_companies_org_status_idx').on(t.orgId, t.status),
]);

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

/* ============================================================================
   14. TREATMENT_CATALOG — org-wide clinical reference data (Sprint 3 S3-A).
   NO price/cost/invoice columns (ADR-004): Clinical owns treatment IDENTITY;
   Finance will reference treatment_id later. RLS (0007): read all roles,
   write HQ only.
   ==========================================================================*/
export const treatmentCatalog = pgTable('treatment_catalog', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  code: varchar('code', { length: 32 }).notNull(),               /* TRT-#### */
  name: varchar('name', { length: 256 }).notNull(),
  category: varchar('category', { length: 64 }).notNull(),
  durationMin: integer('duration_min').notNull().default(30),
  isActive: boolean('is_active').notNull().default(true),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('treatment_catalog_org_code_uq').on(t.orgId, t.code),
  index('treatment_catalog_org_cat_idx').on(t.orgId, t.category),
  check('treatment_catalog_duration_positive', sql`duration_min > 0`),
]);

/* ============================================================================
   15. ENCOUNTERS — canonical clinical case (Sprint 3). ENC-####.
   ==========================================================================*/
export const encounters = pgTable('encounters', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  appointmentId: uuid('appointment_id').references(() => appointments.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  encounterCode: varchar('encounter_code', { length: 32 }).notNull(),
  status: encounterStatusEnum('status').notNull().default('open'),
  chiefComplaint: varchar('chief_complaint', { length: 512 }),
  allergyAcknowledgedAt: timestamp('allergy_acknowledged_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('encounters_org_code_uq').on(t.orgId, t.encounterCode),
  index('encounters_patient_idx').on(t.patientId),
  index('encounters_branch_idx').on(t.branchId),
  index('encounters_doctor_idx').on(t.doctorId),
  index('encounters_appt_idx').on(t.appointmentId),
  check('encounters_completed_requires_ts', sql`status <> 'completed' OR completed_at IS NOT NULL`),
]);

/* ============================================================================
   16. CLINICAL_NOTES — SOAP, immutable after sign (ADR-009). Append-only
   versions: amendment = new row with amendsNoteId. No updated_at/deleted_at.
   ==========================================================================*/
export const clinicalNotes = pgTable('clinical_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').notNull().references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  soapSubjective: text('soap_subjective'),
  soapObjective: text('soap_objective'),
  soapAssessment: text('soap_assessment'),
  soapPlan: text('soap_plan'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  signedBy: uuid('signed_by'),
  amendsNoteId: uuid('amends_note_id'),
  supersededByNoteId: uuid('superseded_by_note_id'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  index('clinical_notes_encounter_idx').on(t.encounterId),
  index('clinical_notes_patient_idx').on(t.patientId),
  index('clinical_notes_doctor_idx').on(t.doctorId),
  check('clinical_notes_signed_complete', sql`signed_at IS NULL OR signed_by IS NOT NULL`),
]);

/* ============================================================================
   17. TOOTH_RECORDS — FDI chart snapshot per encounter (permanent dentition).
   ==========================================================================*/
export const toothRecords = pgTable('tooth_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').notNull().references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  fdiNo: integer('fdi_no').notNull(),
  condition: toothConditionEnum('condition').notNull(),
  surfaces: jsonb('surfaces'),
  notes: varchar('notes', { length: 512 }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('tooth_records_enc_tooth_uq').on(t.encounterId, t.fdiNo),
  index('tooth_records_patient_idx').on(t.patientId, t.fdiNo),
]);

/* ============================================================================
   18. TREATMENT_PLANS — lifecycle draft→proposed→accepted→active→completed|
   cancelled (Blueprint §5/§28). TPL-####. consent_required gates acceptance.
   ==========================================================================*/
export const treatmentPlans = pgTable('treatment_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  planCode: varchar('plan_code', { length: 32 }).notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  status: planStatusEnum('status').notNull().default('draft'),
  consentRequired: boolean('consent_required').notNull().default(false),
  proposedAt: timestamp('proposed_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  activatedAt: timestamp('activated_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: varchar('cancel_reason', { length: 512 }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('treatment_plans_org_code_uq').on(t.orgId, t.planCode),
  index('treatment_plans_patient_idx').on(t.patientId),
  index('treatment_plans_branch_idx').on(t.branchId),
  index('treatment_plans_doctor_idx').on(t.doctorId),
  index('treatment_plans_encounter_idx').on(t.encounterId),
]);

/* ============================================================================
   19. TREATMENT_PLAN_ITEMS — catalog-referenced lines. NO price (ADR-004).
   ==========================================================================*/
export const treatmentPlanItems = pgTable('treatment_plan_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  planId: uuid('plan_id').notNull().references(() => treatmentPlans.id, { onDelete: 'cascade' }),
  treatmentId: uuid('treatment_id').references(() => treatmentCatalog.id, { onDelete: 'restrict' }),
  description: varchar('description', { length: 256 }).notNull(),
  toothFdi: integer('tooth_fdi'),
  quantity: integer('quantity').notNull().default(1),
  status: planItemStatusEnum('status').notNull().default('pending'),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('treatment_plan_items_plan_idx').on(t.planId),
  index('treatment_plan_items_treatment_idx').on(t.treatmentId),
  check('treatment_plan_items_qty_positive', sql`quantity > 0`),
]);

/* ============================================================================
   20. TREATMENT_SESSIONS — append-only performed sessions of a plan.
   ==========================================================================*/
export const treatmentSessions = pgTable('treatment_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  planId: uuid('plan_id').notNull().references(() => treatmentPlans.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  sessionNo: integer('session_no').notNull(),
  performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  summary: varchar('summary', { length: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  uniqueIndex('treatment_sessions_plan_no_uq').on(t.planId, t.sessionNo),
  index('treatment_sessions_plan_idx').on(t.planId),
]);

/* ============================================================================
   21. CONSENT_TEMPLATES — org-wide, versioned (new version = new row).
   ==========================================================================*/
export const consentTemplates = pgTable('consent_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  uniqueIndex('consent_templates_title_version_uq').on(t.orgId, sql`lower(${t.title})`, t.version),
]);

/* ============================================================================
   22. CONSENT_RECORDS — immutable proof of consent (ADR-009). SELECT/INSERT.
   ==========================================================================*/
export const consentRecords = pgTable('consent_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  templateId: uuid('template_id').notNull().references(() => consentTemplates.id, { onDelete: 'restrict' }),
  templateVersion: integer('template_version').notNull(),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id').references(() => treatmentPlans.id, { onDelete: 'restrict' }),
  method: consentMethodEnum('method').notNull(),
  consentedBy: varchar('consented_by', { length: 256 }).notNull(),
  witnessedBy: uuid('witnessed_by').references(() => staff.id, { onDelete: 'restrict' }),
  recordedBy: uuid('recorded_by').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
  notes: varchar('notes', { length: 1024 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  index('consent_records_patient_idx').on(t.patientId),
  index('consent_records_plan_idx').on(t.planId),
]);

/* ============================================================================
   23. IMAGING_RECORDS — metadata ONLY (file bytes = future Documents domain).
   ==========================================================================*/
export const imagingRecords = pgTable('imaging_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  uploadedBy: uuid('uploaded_by').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  kind: imagingKindEnum('kind').notNull(),
  title: varchar('title', { length: 256 }).notNull(),
  fileRef: varchar('file_ref', { length: 512 }),
  takenAt: timestamp('taken_at', { withTimezone: true }),
  notes: varchar('notes', { length: 512 }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('imaging_records_patient_idx').on(t.patientId),
  index('imaging_records_branch_idx').on(t.branchId),
  index('imaging_records_encounter_idx').on(t.encounterId),
]);

/* ============================================================================
   24. PRESCRIPTIONS — medication orders (encounter doctor).
   ==========================================================================*/
export const prescriptions = pgTable('prescriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  medication: varchar('medication', { length: 256 }).notNull(),
  dosage: varchar('dosage', { length: 128 }),
  frequency: varchar('frequency', { length: 128 }),
  durationDays: integer('duration_days'),
  notes: varchar('notes', { length: 512 }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('prescriptions_patient_idx').on(t.patientId),
  index('prescriptions_branch_idx').on(t.branchId),
  index('prescriptions_doctor_idx').on(t.doctorId),
  check('prescriptions_duration_positive', sql`duration_days IS NULL OR duration_days > 0`),
]);

/* ============================================================================
   25. ADVERSE_EVENTS — immutable safety record (SELECT/INSERT only).
   ==========================================================================*/
export const adverseEvents = pgTable('adverse_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  reportedBy: uuid('reported_by').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  severity: adverseSeverityEnum('severity').notNull(),
  description: text('description').notNull(),
  actionTaken: text('action_taken'),
  reportedAt: timestamp('reported_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
}, (t) => [
  index('adverse_events_patient_idx').on(t.patientId),
]);

/* ============================================================================
   26. REFERRALS — outgoing specialist referrals.
   ==========================================================================*/
export const referrals = pgTable('referrals', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'restrict' }),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'restrict' }),
  encounterId: uuid('encounter_id').references(() => encounters.id, { onDelete: 'restrict' }),
  doctorId: uuid('doctor_id').notNull().references(() => staff.id, { onDelete: 'restrict' }),
  toSpecialty: varchar('to_specialty', { length: 128 }).notNull(),
  toProvider: varchar('to_provider', { length: 256 }),
  reason: text('reason').notNull(),
  status: referralStatusEnum('status').notNull().default('pending'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  ...auditCols,
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  index('referrals_patient_idx').on(t.patientId),
  index('referrals_branch_idx').on(t.branchId),
  index('referrals_doctor_idx').on(t.doctorId),
]);

/* ============================================================================
   27. CLINICAL_TIMELINE_EVENTS — append-only derived feed (patient 360).
   ==========================================================================*/
export const clinicalTimelineEvents = pgTable('clinical_timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  patientId: uuid('patient_id').notNull().references(() => patients.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 64 }).notNull(),
  summary: varchar('summary', { length: 512 }).notNull(),
  payload: jsonb('payload'),
  actorId: uuid('actor_id'),
  actorRole: varchar('actor_role', { length: 32 }),
  correlationId: varchar('correlation_id', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('clinical_timeline_patient_idx').on(t.patientId, t.createdAt),
  index('clinical_timeline_type_idx').on(t.type),
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
export type PanelCompany = typeof panelCompanies.$inferSelect;
export type InsuranceCompany = typeof insuranceCompanies.$inferSelect;
/* Sprint 3 — clinical domain types */
export type TreatmentCatalogEntry = typeof treatmentCatalog.$inferSelect;
export type Encounter = typeof encounters.$inferSelect;
export type ClinicalNote = typeof clinicalNotes.$inferSelect;
export type ToothRecord = typeof toothRecords.$inferSelect;
export type TreatmentPlan = typeof treatmentPlans.$inferSelect;
export type TreatmentPlanItem = typeof treatmentPlanItems.$inferSelect;
export type TreatmentSession = typeof treatmentSessions.$inferSelect;
export type ConsentTemplate = typeof consentTemplates.$inferSelect;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type ImagingRecord = typeof imagingRecords.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;
export type AdverseEvent = typeof adverseEvents.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type ClinicalTimelineEvent = typeof clinicalTimelineEvents.$inferSelect;
