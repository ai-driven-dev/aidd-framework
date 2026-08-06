/** Normalizes the hook fields shared by Claude, Codex, Cursor, and Copilot. */
function normalizeHookEvent(payload) {
  const event = payload?.hook_event_name ?? payload?.hookEventName ?? payload?.event_name ?? payload?.eventName ?? "";
  const rawInput = payload?.tool_input ?? payload?.toolArgs ?? payload?.tool_input_json ?? {};
  let toolInput = rawInput;
  if (typeof rawInput === "string") {
    try {
      toolInput = JSON.parse(rawInput);
    } catch {
      toolInput = rawInput;
    }
  }
  return {
    raw: payload,
    event: String(event).toLowerCase(),
    sessionId: String(
      payload?.session_id ?? payload?.sessionId ?? payload?.conversation_id ?? payload?.conversationId ??
      payload?.thread_id ?? payload?.threadId ?? payload?.task_id ?? payload?.taskId ?? payload?.transcript_path ?? "",
    ),
    cwd: payload?.cwd ?? payload?.workspaceRoot ?? payload?.workspace_roots?.[0] ?? process.cwd(),
    toolName: payload?.tool_name ?? payload?.toolName ?? "",
    toolInput,
    toolOutput:
      payload?.tool_response ?? payload?.tool_result ?? payload?.toolResult ?? payload?.tool_output ?? null,
  };
}

function toCheckerPayload(event) {
  return {
    ...event.raw,
    cwd: event.cwd,
    tool_name: event.toolName,
    tool_input: event.toolInput,
    tool_response: event.toolOutput,
  };
}

function isPotentialWrite(event) {
  if (/(?:bash|shell|exec|write|create|edit|update|patch|delete|move)/i.test(event.toolName)) return true;
  const hasWriteInput = (value) => {
    if (!value || typeof value !== "object") return false;
    return Object.entries(value).some(([key, item]) =>
      /^(?:content|patch|old_string|oldString|new_string|newString|changes)$/i.test(key) || hasWriteInput(item),
    );
  };
  return hasWriteInput(event.toolInput);
}

module.exports = { isPotentialWrite, normalizeHookEvent, toCheckerPayload };
