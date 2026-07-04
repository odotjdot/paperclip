-- Custom SQL migration file, put your code below! --
-- MM-398 (S5): constrain issues.status to the canonical Paperclip status vocabulary.
-- Source of truth for the allowed set: packages/shared/src/constants.ts ISSUE_STATUSES.
-- These are Paperclip's native state_keys (NOT Plane's state GROUPS). The brain<->board
-- status reconciliation is handled by the MegaMind status map (Plane group -> state_key),
-- not by widening this column. Poka-yoke: the DB now matches the app's declared enum so
-- issues.status can no longer silently drift to a value the app cannot read.
-- Reversal: ALTER TABLE "issues" DROP CONSTRAINT "issues_status_check";
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_check" CHECK ("status" IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'));
