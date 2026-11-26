#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FeedbackApi } from './api.js';
import { buildServer } from './tools.js';

const { FEEDBACK_API_URL, FEEDBACK_TOKEN } = process.env;
if (!FEEDBACK_API_URL || !FEEDBACK_TOKEN) {
  // stderr: stdout is the protocol channel.
  console.error('feedback-mcp: set FEEDBACK_API_URL and FEEDBACK_TOKEN');
  process.exit(1);
}

await buildServer(new FeedbackApi(FEEDBACK_API_URL, FEEDBACK_TOKEN)).connect(new StdioServerTransport());
