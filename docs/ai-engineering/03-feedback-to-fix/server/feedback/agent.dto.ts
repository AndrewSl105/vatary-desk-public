import { z } from 'zod';

const MAX_REASON_LENGTH = 500;
const MAX_NOTE_LENGTH = 5000;
const MAX_SUMMARY_LENGTH = 5000;
const MAX_BRANCH_LENGTH = 255;
const COMMIT_SHA = /^[0-9a-fA-F]{7,40}$/;

export const AgentStartWorkSchema = z.object({
  reason: z.string().trim().max(MAX_REASON_LENGTH).optional(),
});
export type AgentStartWorkDto = z.infer<typeof AgentStartWorkSchema>;

export const AgentNoteSchema = z.object({
  text: z.string().trim().min(1).max(MAX_NOTE_LENGTH),
});
export type AgentNoteDto = z.infer<typeof AgentNoteSchema>;

export const AgentFixSchema = z.object({
  commitSha: z.string().trim().regex(COMMIT_SHA, 'Not a commit sha'),
  branch: z.string().trim().min(1).max(MAX_BRANCH_LENGTH).optional(),
  summary: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH),
});
export type AgentFixDto = z.infer<typeof AgentFixSchema>;
