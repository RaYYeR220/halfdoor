import { sql } from 'drizzle-orm';
import {
  boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

// Tables are unqualified: they land in the `halfdoor` schema via the role's search_path.
const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const ts = (name: string) => timestamp(name, { withTimezone: true });
const textArray = (name: string) => text(name).array().notNull().default(sql`'{}'::text[]`);

export const churches = pgTable('churches', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  tz: text('tz').notNull().default('America/Chicago'),
  mode: text('mode', { enum: ['sandbox', 'pco', 'live'] }).notNull(),
  pcoOrgId: text('pco_org_id'),
  wrappedDek: text('wrapped_dek').notNull(),
  expiresAt: ts('expires_at'),
  /** Sandboxes only: salted HMAC of the creating client's IP (never the raw IP), for rate limiting. */
  creatorHash: text('creator_hash'),
  createdAt: ts('created_at').notNull().defaultNow(),
});

export const people = pgTable('people', {
  id: id(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['child', 'buddy', 'director', 'parent', 'leader'] }).notNull(),
  firstName: text('first_name').notNull(),
  lastInitial: text('last_initial'),
  lang: text('lang').notNull().default('en'),
  gender: text('gender', { enum: ['f', 'm'] }),
  pcoPersonId: text('pco_person_id'),
  grade: text('grade'),
  inclusionTrainingAt: timestamp('inclusion_training_at', { withTimezone: true }),
  backgroundExpiresAt: timestamp('background_expires_at', { withTimezone: true }),
  skills: textArray('skills'),
  langs: textArray('langs'),
}, (t) => [index('people_church_idx').on(t.churchId)]);

export const householdLinks = pgTable('household_links', {
  parentId: uuid('parent_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.parentId, t.childId] })]);

export const cards = pgTable('cards', {
  id: id(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().unique().references(() => people.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['draft', 'parent_approved', 'acknowledged', 'returned', 'archived'] }).notNull(),
  lang: text('lang').notNull(),
  supportLevel: text('support_level', { enum: ['all_morning', 'parts', 'none'] }),
  itemsEnc: text('items_enc').notNull(),
  teamNotesEnc: text('team_notes_enc'),
  returnedQuestion: text('returned_question'),
  tags: textArray('tags'),
  version: integer('version').notNull().default(1),
  parentApprovedAt: ts('parent_approved_at'),
  directorAckAt: ts('director_ack_at'),
  retainUntil: ts('retain_until'),
});

export const services = pgTable('services', {
  id: id(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  room: text('room'),
  pcoEventId: text('pco_event_id'),
  pcoServiceTypeId: text('pco_service_type_id'),
  pcoPlanId: text('pco_plan_id'),
}, (t) => [index('services_church_idx').on(t.churchId)]);

export const assignments = pgTable('assignments', {
  id: id(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  buddyId: uuid('buddy_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['proposed', 'approved', 'scheduled_in_pco'] }).notNull(),
  reasons: jsonb('reasons').notNull().default(sql`'[]'::jsonb`),
  pcoPlanPersonId: text('pco_plan_person_id'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('assignments_service_child_idx').on(t.serviceId, t.childId)]);

export const checkins = pgTable('checkins', {
  id: id(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  source: text('source', { enum: ['pco', 'demo_station'] }).notNull(),
  pcoCheckInId: text('pco_check_in_id'),
  securityCode: text('security_code'),
  checkedInAt: ts('checked_in_at').notNull(),
  checkedOutAt: ts('checked_out_at'),
});

export const lessons = pgTable('lessons', {
  id: id(),
  churchId: uuid('church_id').notNull().references(() => churches.id, { onDelete: 'cascade' }),
  serviceDate: ts('service_date').notNull(),
  sourceText: text('source_text').notNull(),
  title: text('title').notNull(),
  bigIdeaQuote: text('big_idea_quote'),
  verseRef: text('verse_ref'),
  verseText: text('verse_text'),
  steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
});

export const moments = pgTable('moments', {
  id: id(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  buddyId: uuid('buddy_id').references(() => people.id, { onDelete: 'set null' }),
  stepKey: text('step_key'),
  kind: text('kind', { enum: ['good', 'hard', 'break', 'bathroom', 'note'] }).notNull(),
  helpedItemIds: textArray('helped_item_ids'),
  noteEnc: text('note_enc'),
  at: ts('at').notNull(),
});

export const parentNotes = pgTable('parent_notes', {
  id: id(),
  serviceId: uuid('service_id').notNull().references(() => services.id, { onDelete: 'cascade' }),
  childId: uuid('child_id').notNull().references(() => people.id, { onDelete: 'cascade' }),
  lang: text('lang').notNull(),
  draftEnc: text('draft_enc').notNull(),
  evidence: jsonb('evidence').notNull().default(sql`'[]'::jsonb`),
  status: text('status', { enum: ['draft', 'approved'] }).notNull(),
  approvedAt: ts('approved_at'),
});

export const cardAccessLog = pgTable('card_access_log', {
  id: id(),
  cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
  viewerId: uuid('viewer_id').references(() => people.id, { onDelete: 'set null' }),
  role: text('role').notNull(),
  reason: text('reason', { enum: ['checked_in', 'director', 'parent', 'room_safety'] }).notNull(),
  openedAt: ts('opened_at').notNull().defaultNow(),
  closedAt: ts('closed_at'),
});

export const aiCalls = pgTable('ai_calls', {
  id: id(),
  /** SET NULL: purging a sandbox must not erase its spend from the daily cap. */
  churchId: uuid('church_id').references(() => churches.id, { onDelete: 'set null' }),
  purpose: text('purpose', { enum: ['card', 'translate', 'note', 'lesson'] }).notNull(),
  model: text('model').notNull(),
  e2ee: boolean('e2ee').notNull(),
  attestation: jsonb('attestation'),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  /** null = reserved / in flight (cost_usd holds the worst-case estimate). */
  ok: boolean('ok'),
  attestationMismatch: boolean('attestation_mismatch').notNull().default(false),
  at: ts('at').notNull().defaultNow(),
});
