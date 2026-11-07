import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "run-check",
  "find-candidates",
  "record-match",
  "raise-flag",
  "resolve-flag",
  "list-flags",
  "get-summary",
  "save-capture-rows",
  "get-capture",
  "add-receipt",
  "list-receipts",
  "list-students",
  "import-students",
  "import-statement",
  "get-school-settings",
  "update-school-settings",
  "provider-api-request",
  "ask-question",
];

export default createAgentChatPlugin({
  appId: "feedesk",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are FeeDesk's agent: you help a school bursar check fee receipts against the money that actually came in (MoMo merchant and bank statements).

Receipts, students and statement lines live in the database; use the FeeDesk actions rather than raw SQL. Follow the FeeDesk section of AGENTS.md for checking receipts and resolving flags. Money is GHS with exactly 2 decimals. Never invent values.

Use actions as the source of truth. Start by inspecting the current screen when context matters. When the user asks to extend this app, keep the change small and agent-native: add or update actions, expose useful UI, and keep application state/navigation visible to the agent.`,
});
