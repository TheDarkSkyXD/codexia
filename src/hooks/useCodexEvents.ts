import { useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { CodexEvent } from "@/types/codex";
import type { ChatMessage } from "@/types/chat";
import { StreamController, StreamControllerSink } from "@/utils/streamController";
import { useConversationStore } from "../stores/ConversationStore";
import { useCodexStore } from "@/stores/CodexStore";
import { handleCodexEvent } from "./codexEvents/handler";
import { normalizeRawEvent, type RawCodexEventPayload } from "./codexEvents/normalizeRawEvent";
import type { CodexEventHandlerContext, UseCodexEventsProps } from "./codexEvents/types";

export const useCodexEvents = ({ sessionId, onStopStreaming }: UseCodexEventsProps) => {
  const {
    addMessage,
    updateMessage,
    setSessionLoading,
    createConversation,
    conversations,
    setResumeMeta,
  } = useConversationStore();
  const sandboxMode = useCodexStore((state) => state.config.sandboxMode);
  const autoApproveApprovals =
    sandboxMode === "workspace-write" || sandboxMode === "danger-full-access";

  const streamController = useRef(new StreamController());
  const currentStreamingMessageId = useRef<string | null>(null);
  const currentReasoningMessageId = useRef<string | null>(null);
  const reasoningBufferRef = useRef<string>("");
  const currentCommandMessageId = useRef<string | null>(null);
  const currentCommandInfo = useRef<{ command: string[]; cwd: string } | null>(null);
  const lastTurnDiffRef = useRef<string | null>(null);
  const handlerContextRef = useRef<CodexEventHandlerContext | null>(null);

  const addMessageToStore = useCallback(
    (message: ChatMessage) => {
      const conversationExists = conversations.find((conv) => conv.id === sessionId);
      if (!conversationExists) {
        console.log(`Creating conversation for session ${sessionId} from event`);
        createConversation("New Chat", sessionId);
      }

      const conversationMessage = {
        id: message.id,
        role:
          message.role === "user"
            ? ("user" as const)
            : message.role === "assistant"
            ? ("assistant" as const)
            : message.role === "approval"
            ? ("approval" as const)
            : ("system" as const),
        content: message.content,
        title: message.title,
        timestamp: message.timestamp,
        ...(message.approvalRequest && { approvalRequest: message.approvalRequest }),
        ...(message.messageType && { messageType: message.messageType }),
        ...(message.eventType && { eventType: message.eventType }),
        ...(message.plan && { plan: message.plan }),
      };

      addMessage(sessionId, conversationMessage);
    },
    [addMessage, conversations, createConversation, sessionId],
  );

  const createStreamSink = useCallback(
    (messageId: string): StreamControllerSink => {
      let accumulatedContent = "";

      return {
        insertLines: (lines: string[]) => {
          const newContent = lines.join("\n");
          if (accumulatedContent) {
            accumulatedContent += "\n" + newContent;
          } else {
            accumulatedContent = newContent;
          }
          updateMessage(sessionId, messageId, { content: accumulatedContent });
        },
        startAnimation: () => {},
        stopAnimation: () => {},
      };
    },
    [sessionId, updateMessage],
  );

  handlerContextRef.current = {
    sessionId,
    onStopStreaming,
    addMessageToStore,
    updateMessage,
    setSessionLoading,
    setResumeMeta,
    autoApproveApprovals,
    streamController,
    currentStreamingMessageId,
    currentReasoningMessageId,
    reasoningBufferRef,
    currentCommandMessageId,
    currentCommandInfo,
    lastTurnDiffRef,
    createStreamSink,
  };

  useEffect(() => {
    if (!sessionId) return;

    const eventUnlisten = listen<CodexEvent>("codex-events", (event) => {
      const codexEvent = event.payload;

      if (
        codexEvent.msg.type !== "agent_message_delta" &&
        codexEvent.msg.type !== "agent_reasoning_delta" &&
        codexEvent.msg.type !== "agent_reasoning_raw_content_delta"
      ) {
        console.log(`📨 Codex structured event [${sessionId}]:`, codexEvent.msg);
      }

      const context = handlerContextRef.current;
      if (context) {
        handleCodexEvent(codexEvent, context);
      }
    });

    const rawEventUnlisten = listen<RawCodexEventPayload>("codex-raw-events", (event) => {
      const rawEvent = event.payload;

      // const rawMsgType = rawEvent.data.msg.type;
      console.log(`📨 Raw codex event [${sessionId}]:`, rawEvent.data);

      const convertedEvent = normalizeRawEvent(rawEvent);
      if (!convertedEvent) {
        return;
      }

      const context = handlerContextRef.current;
      if (context) {
        console.log(`📨 Raw codex event handleCodexEvent [${sessionId}]:`, rawEvent.data);
        handleCodexEvent(convertedEvent, context);
      }
    });

    return () => {
      eventUnlisten.then((fn) => fn());
      rawEventUnlisten.then((fn) => fn());
      streamController.current.clearAll();
      currentStreamingMessageId.current = null;
    };
  }, [sessionId, createStreamSink]);

  return {};
};

export type { UseCodexEventsProps };
