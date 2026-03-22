#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

function usage() {
  console.error("Usage: node backfill-pi-session.mjs <source.json> <target.jsonl> [modulePath]");
  process.exit(1);
}

const [, , sourcePath, targetPath] = process.argv;
if (!sourcePath || !targetPath) {
  usage();
}

const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
const sessionId = asString(raw.id) || `session-${randomUUID()}`;
const sessionTitle = asString(raw.title) || "Recovered Session";
const provider = asString(raw.provider) || "unknown";
const model = asString(raw.model) || "unknown";
const createdAt = normalizeTimestamp(raw.createdAt);
const cwd = asString(raw.workspacePath) || process.cwd();
const messages = Array.isArray(raw.messages) ? raw.messages : [];
const toolCallOwners = new Map();
const toolResultsById = new Map();

for (let index = 0; index < messages.length; index += 1) {
  const message = messages[index];
  if (normalizeRole(message?.role) !== "assistant") {
    continue;
  }

  const segments = Array.isArray(message?.segments) ? message.segments : [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") {
      continue;
    }

    if (segment.type === "tool_call") {
      const toolCallId = asString(segment.toolCallId);
      if (toolCallId && !toolCallOwners.has(toolCallId)) {
        toolCallOwners.set(toolCallId, index);
      }
      continue;
    }

    if (segment.type === "tool_result") {
      const toolCallId = asString(segment.toolCallId);
      if (!toolCallId) {
        continue;
      }

      const current = toolResultsById.get(toolCallId);
      if (!current || scoreToolResult(segment) >= scoreToolResult(current)) {
        toolResultsById.set(toolCallId, segment);
      }
    }
  }
}

const lines = [];
let parentId = null;

const headerId = randomUUID();
lines.push(
  jsonLine({
    type: "session",
    version: 3,
    id: headerId,
    timestamp: createdAt,
    cwd,
  }),
);

parentId = pushMeta(lines, {
  type: "model_change",
  parentId,
  timestamp: createdAt,
  provider,
  modelId: model,
});

parentId = pushMeta(lines, {
  type: "thinking_level_change",
  parentId,
  timestamp: createdAt,
  thinkingLevel: "off",
});

parentId = pushMeta(lines, {
  type: "session_info",
  parentId,
  timestamp: createdAt,
  name: sessionTitle,
});

for (let index = 0; index < messages.length; index += 1) {
  const message = messages[index];
  const role = normalizeRole(message?.role);
  if (!role) {
    continue;
  }

  const messageTimestamp = normalizeTimestamp(message?.createdAt) || createdAt;
  const segments = Array.isArray(message?.segments) ? message.segments : [];

  if (role === "user" || role === "system") {
    const content = textSegmentsToContent(segments);
    if (content.length === 0) {
      continue;
    }

    parentId = pushMessage(lines, {
      parentId,
      timestamp: messageTimestamp,
      message: {
        role,
        content,
        timestamp: Date.parse(messageTimestamp),
      },
      id: compactMessageId(message?.id),
    });
    continue;
  }

  const assistantContent = [];
  const ownedToolCallIds = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") {
      continue;
    }

    if (segment.type === "markdown_text") {
      const text = asString(segment.text);
      if (text) {
        assistantContent.push({ type: "text", text });
      }
      continue;
    }

    if (segment.type === "thinking") {
      const text = asString(segment.text);
      if (text) {
        assistantContent.push({ type: "text", text: `Thinking:\n${text}` });
      }
      continue;
    }

    if (segment.type === "tool_call") {
      const toolCallId = asString(segment.toolCallId) || `call_${randomUUID().replace(/-/g, "")}`;
      ownedToolCallIds.push(toolCallId);
      assistantContent.push({
        type: "toolCall",
        id: toolCallId,
        name: asString(segment.toolName) || "unknown",
        arguments: isRecord(segment.args) ? segment.args : {},
      });
    }
  }

  if (assistantContent.length > 0) {
    parentId = pushMessage(lines, {
      parentId,
      timestamp: messageTimestamp,
      id: compactMessageId(message?.id),
      message: {
        role: "assistant",
        content: assistantContent,
        api: "rpc-restore",
        provider: asString(message?.provider) || provider,
        model: asString(message?.model) || model,
        usage: toPiUsage(message?.usage),
        stopReason: asString(message?.stopReason) || inferStopReason(assistantContent),
        timestamp: Date.parse(messageTimestamp),
      },
    });
  }

  for (const toolCallId of ownedToolCallIds) {
    if (toolCallOwners.get(toolCallId) !== index) {
      continue;
    }

    const toolResult = toolResultsById.get(toolCallId);
    if (!toolResult) {
      continue;
    }

    parentId = pushMessage(lines, {
      parentId,
      timestamp: normalizeTimestamp(toolResult.finishedAt) || messageTimestamp,
      id: compactMessageId(`${message?.id}-tool-${toolCallId}`),
      message: {
        role: "toolResult",
        toolCallId,
        toolName: asString(toolResult.toolName) || "unknown",
        content: toolResultContent(toolResult),
        isError: Boolean(toolResult.isError || toolResult.status === "error"),
        timestamp: Date.parse(normalizeTimestamp(toolResult.finishedAt) || messageTimestamp),
      },
    });
  }
}

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, `${lines.join("\n")}\n`, "utf8");

function pushMeta(lines, entry) {
  const id = randomUUID().slice(0, 8);
  lines.push(jsonLine({ ...entry, id }));
  return id;
}

function pushMessage(lines, entry) {
  const id = entry.id || randomUUID().slice(0, 8);
  lines.push(
    jsonLine({
      type: "message",
      id,
      parentId: entry.parentId,
      timestamp: entry.timestamp,
      message: entry.message,
    }),
  );
  return id;
}

function textSegmentsToContent(segments) {
  const content = [];
  for (const segment of segments) {
    if (!segment || typeof segment !== "object") {
      continue;
    }
    if (segment.type !== "markdown_text") {
      continue;
    }
    const text = asString(segment.text);
    if (text) {
      content.push({ type: "text", text });
    }
  }
  return content;
}

function toolResultContent(segment) {
  const parts = [];
  const resultText = extractTextFromPayload(segment.result);
  if (resultText) {
    parts.push({ type: "text", text: resultText });
  }

  if (parts.length === 0) {
    const partialText = extractTextFromPayload(segment.partialResult);
    if (partialText) {
      parts.push({ type: "text", text: partialText });
    }
  }

  if (parts.length === 0) {
    parts.push({ type: "text", text: safeStringify(segment.result ?? segment.partialResult ?? {}) });
  }

  return parts;
}

function extractTextFromPayload(payload) {
  if (!payload) {
    return "";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (!isRecord(payload)) {
    return "";
  }

  const content = Array.isArray(payload.content) ? payload.content : [];
  const texts = content
    .map((item) => (isRecord(item) && item.type === "text" ? asString(item.text) : ""))
    .filter(Boolean);
  return texts.join("\n");
}

function toPiUsage(usage) {
  if (!isRecord(usage)) {
    return undefined;
  }

  const input = numberOrZero(usage.input);
  const output = numberOrZero(usage.output);
  const cacheRead = numberOrZero(usage.cacheRead);
  const cacheWrite = numberOrZero(usage.cacheWrite);
  const totalTokens = numberOrZero(usage.totalTokens || usage.contextTokens);
  const costTotal = numberOrZero(usage.costTotal);

  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: costTotal,
    },
  };
}

function inferStopReason(content) {
  return content.some((item) => item.type === "toolCall") ? "toolUse" : "stop";
}

function compactMessageId(value) {
  const text = asString(value).replace(/[^a-zA-Z0-9]/g, "");
  return text ? text.slice(-8) : undefined;
}

function scoreToolResult(segment) {
  let score = 0;
  if (segment.result !== undefined) {
    score += 4;
  }
  if (segment.partialResult !== undefined) {
    score += 2;
  }
  if (segment.status === "success" || segment.status === "error") {
    score += 1;
  }
  if (segment.isError) {
    score += 1;
  }
  return score;
}

function normalizeRole(role) {
  return role === "user" || role === "assistant" || role === "system" ? role : null;
}

function normalizeTimestamp(value) {
  const text = asString(value);
  if (!text) {
    return new Date().toISOString();
  }

  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) {
    return new Date().toISOString();
  }

  return new Date(timestamp).toISOString();
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function jsonLine(value) {
  return JSON.stringify(value);
}
