import { generateUniqueId } from "@/utils/genUniqueId";
import { useEphemeralStore } from "@/stores/EphemeralStore";
import type { ChatMessage } from "@/types/chat";
import type { CodexEvent } from "@/types/codex";
import type { CodexEventHandler } from "./types";
import {
  applyWorktreeDiffUpdate,
  beginWorktreeSnapshot,
  resolveSnapshot,
} from "./diffUtils";
import { snapshotWorktreeSummary } from "@/services/diffService";

const noopHandler: CodexEventHandler = () => {};

const handleAgentMessage: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "agent_message") {
    return;
  }
  const { streamController, currentStreamingMessageId } = context;
  if (!event.msg.message) {
    return;
  }

  if (currentStreamingMessageId.current) {
    streamController.current.finalize(false);
    currentStreamingMessageId.current = null;
  }
};

const ensureReasoningMessage = (event: CodexEvent, context: Parameters<CodexEventHandler>[1]) => {
  const {
    sessionId,
    currentReasoningMessageId,
    reasoningBufferRef,
    addMessageToStore,
  } = context;

  if (currentReasoningMessageId.current) {
    return currentReasoningMessageId.current;
  }

  const reasoningId = `${sessionId}-reasoning-${generateUniqueId()}`;
  currentReasoningMessageId.current = reasoningId;
  reasoningBufferRef.current = "";

  const reasoningMessage: ChatMessage = {
    id: reasoningId,
    role: "system",
    content: "",
    timestamp: new Date().getTime(),
    isStreaming: true,
    messageType: "reasoning",
    eventType: event.msg.type,
  };
  addMessageToStore(reasoningMessage);
  return reasoningId;
};

const handleReasoningDelta: CodexEventHandler = (event, context) => {
  if (
    event.msg.type !== "agent_reasoning_delta" &&
    event.msg.type !== "agent_reasoning_raw_content_delta"
  ) {
    return;
  }

  const deltaText = event.msg.delta ?? "";
  if (!deltaText) {
    return;
  }

  const { sessionId, reasoningBufferRef, updateMessage } = context;
  const reasoningMessageId = ensureReasoningMessage(event, context);

  reasoningBufferRef.current += deltaText;
  updateMessage(sessionId, reasoningMessageId, {
    content: reasoningBufferRef.current,
    eventType: event.msg.type,
  });
};

const handleReasoningSectionBreak: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "agent_reasoning_section_break") {
    return;
  }
  const { currentReasoningMessageId, reasoningBufferRef, updateMessage, sessionId } = context;
  if (!currentReasoningMessageId.current) {
    return;
  }

  const separator = reasoningBufferRef.current.endsWith("\n") ? "\n" : "\n\n";
  reasoningBufferRef.current += separator;
  updateMessage(sessionId, currentReasoningMessageId.current, {
    content: reasoningBufferRef.current,
    eventType: event.msg.type,
  });
};

const handlePlanUpdate: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "plan_update") {
    return;
  }
  const { sessionId, addMessageToStore } = context;
  const planPayload: ChatMessage["plan"] = {
    explanation: event.msg.explanation ?? null,
    plan: Array.isArray(event.msg.plan) ? event.msg.plan : [],
  };

  const planMessage: ChatMessage = {
    id: `${sessionId}-plan-${generateUniqueId()}`,
    role: "system",
    content: "",
    timestamp: new Date().getTime(),
    messageType: "plan_update",
    eventType: event.msg.type,
    plan: planPayload,
  };
  addMessageToStore(planMessage);
};

const handleToolCallBegin: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "mcp_tool_call_begin") {
    return;
  }
  const { sessionId, addMessageToStore } = context;
  const toolName = event.msg.invocation?.tool || "Unknown Tool";
  if (["read", "edit", "write", "glob", "grep"].some((t) => toolName.toLowerCase().includes(t))) {
    const toolCallMessage: ChatMessage = {
      id: `${sessionId}-mcp-${generateUniqueId()}`,
      role: "system",
      title: `🔧 ${toolName}`,
      content: "",
      timestamp: new Date().getTime(),
      messageType: "tool_call",
      eventType: event.msg.type,
    };
    addMessageToStore(toolCallMessage);
  }
};

const handleWebSearchBegin: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "web_search_begin") {
    return;
  }
  const { sessionId, addMessageToStore } = context;
  const searchBeginMessage: ChatMessage = {
    id: `${sessionId}-search-begin-${generateUniqueId()}`,
    role: "system",
    title: `🔍 ${event.msg.query}`,
    content: "Searching web...",
    timestamp: new Date().getTime(),
    eventType: event.msg.type,
  };
  addMessageToStore(searchBeginMessage);
};

const handleAgentMessageDelta: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "agent_message_delta") {
    return;
  }
  const {
    sessionId,
    addMessageToStore,
    streamController,
    currentStreamingMessageId,
    createStreamSink,
  } = context;

  if (!currentStreamingMessageId.current) {
    const messageId = `${sessionId}-stream-${generateUniqueId()}`;
    currentStreamingMessageId.current = messageId;

    const streamingMessage: ChatMessage = {
      id: messageId,
      role: "assistant",
      content: "",
      timestamp: new Date().getTime(),
      isStreaming: true,
      eventType: event.msg.type,
    };
    addMessageToStore(streamingMessage);

    const sink = createStreamSink(messageId);
    streamController.current.begin(sink);
  }

  if (currentStreamingMessageId.current && event.msg.delta) {
    streamController.current.pushAndMaybeCommit(event.msg.delta);
  }
};

const handleTurnDiff: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "turn_diff") {
    return;
  }
  const { sessionId, lastTurnDiffRef } = context;
  const diffText = event.msg.unified_diff || "";
  if (lastTurnDiffRef.current === diffText) {
    return;
  }
  lastTurnDiffRef.current = diffText;
  try {
    useEphemeralStore.getState().setTurnDiff(sessionId, diffText);
  } catch {}
};

const handlePatchApplyBegin: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "patch_apply_begin") {
    return;
  }
  const { sessionId, currentPatchSnapshot } = context;
  beginWorktreeSnapshot(sessionId, currentPatchSnapshot);
};

const handlePatchApplyEnd: CodexEventHandler = (event, context) => {
  if (event.msg.type !== "patch_apply_end") {
    return;
  }
  const { sessionId, lastTurnDiffRef, currentPatchSnapshot } = context;
  void (async () => {
    const before = await resolveSnapshot(sessionId, currentPatchSnapshot);
    const after = await snapshotWorktreeSummary(sessionId);
    if (currentPatchSnapshot) {
      currentPatchSnapshot.current = null;
    }
    await applyWorktreeDiffUpdate(sessionId, before, after);
    lastTurnDiffRef.current = null;
  })();
};

export const messageHandlers: Record<string, CodexEventHandler> = {
  agent_message: handleAgentMessage,
  agent_reasoning: noopHandler,
  agent_reasoning_raw_content: noopHandler,
  agent_reasoning_delta: handleReasoningDelta,
  agent_reasoning_raw_content_delta: handleReasoningDelta,
  agent_reasoning_section_break: handleReasoningSectionBreak,
  plan_update: handlePlanUpdate,
  mcp_tool_call_begin: handleToolCallBegin,
  mcp_tool_call_end: noopHandler,
  patch_apply_begin: handlePatchApplyBegin,
  patch_apply_end: handlePatchApplyEnd,
  web_search_begin: handleWebSearchBegin,
  web_search_end: noopHandler,
  agent_message_delta: handleAgentMessageDelta,
  turn_diff: handleTurnDiff,
};
