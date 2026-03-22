import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Terminal } from "@xterm/xterm";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import "@xterm/xterm/css/xterm.css";
import {
  openEmbeddedTerminal,
  resizeEmbeddedTerminal,
  sendEmbeddedTerminalInput,
  type TerminalEvent,
  type TerminalSnapshot,
} from "@/lib/pi";
import { AppTerminalTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

type EmbeddedTerminalProps = {
  theme: AppTerminalTheme;
  visible: boolean;
  workspacePath: string;
  variant?: "panel" | "docked";
  onError: (message: string) => void;
};

const terminalWrapperClassName =
  "overflow-hidden border-t border-white/55 px-3 transition-[max-height,opacity,transform,padding] duration-200 dark:border-white/10";
const TERMINAL_BUFFER_STORAGE_KEY = "pitest-terminal-buffer";
const terminalBufferCache = new Map<string, PersistedTerminalBuffer>();

type PersistedTerminalBuffer = {
  workspacePath: string;
  instanceId: number;
  shell: string;
  cwd: string;
  serialized: string;
  capturedAt: number;
};

export function EmbeddedTerminal({
  theme,
  visible,
  workspacePath,
  variant = "docked",
  onError,
}: EmbeddedTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const activeInstanceIdRef = useRef<number | null>(null);
  const openedWorkspaceRef = useRef<string | null>(null);
  const bufferedEventsRef = useRef<Map<number, TerminalEvent[]>>(new Map());
  const persistTimeoutRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const snapshotRef = useRef<TerminalSnapshot | null>(null);
  const [snapshot, setSnapshot] = useState<TerminalSnapshot | null>(null);
  const [opening, setOpening] = useState(false);

  const restorePersistedBuffer = (nextWorkspacePath: string, nextSnapshot: TerminalSnapshot) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return false;
    }

    const persistedBuffer = readPersistedTerminalBuffer(nextWorkspacePath);
    if (
      !persistedBuffer ||
      persistedBuffer.instanceId !== nextSnapshot.instanceId ||
      !persistedBuffer.serialized
    ) {
      return false;
    }

    terminal.reset();
    lastSizeRef.current = null;
    terminal.write(persistedBuffer.serialized, () => {
      schedulePersistTerminalBuffer();
      syncTerminalViewport({ forceResize: true, wakeShell: true });
    });
    return true;
  };

  const persistTerminalBuffer = () => {
    const terminal = terminalRef.current;
    const serializeAddon = serializeAddonRef.current;
    const currentSnapshot = snapshotRef.current;
    const currentWorkspace = openedWorkspaceRef.current;
    const instanceId = activeInstanceIdRef.current;
    if (!terminal || !serializeAddon || !currentSnapshot || !currentWorkspace || !instanceId) {
      return;
    }

    const serialized = serializeAddon.serialize();
    const nextBuffer: PersistedTerminalBuffer = {
      workspacePath: currentWorkspace,
      instanceId,
      shell: currentSnapshot.shell,
      cwd: currentSnapshot.cwd,
      serialized,
      capturedAt: Date.now(),
    };

    terminalBufferCache.set(currentWorkspace, nextBuffer);
    writePersistedTerminalBuffer(nextBuffer);
  };

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const schedulePersistTerminalBuffer = () => {
    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current);
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      persistTimeoutRef.current = null;
      persistTerminalBuffer();
    }, 120);
  };

  const syncTerminalViewport = (options?: {
    focus?: boolean;
    forceResize?: boolean;
    wakeShell?: boolean;
  }) => {
    if (!visible) {
      return;
    }

    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }

    fitAddon.fit();
    terminal.refresh(0, Math.max(terminal.rows - 1, 0));
    if (options?.focus) {
      terminal.focus();
    }

    const cols = Math.max(terminal.cols, 1);
    const rows = Math.max(terminal.rows, 1);
    const lastSize = lastSizeRef.current;
    const sizeChanged = lastSize?.cols !== cols || lastSize?.rows !== rows;
    lastSizeRef.current = { cols, rows };

    if (sizeChanged || options?.forceResize) {
      void resizeEmbeddedTerminal({ cols, rows }).catch((error) => {
        onError(formatTerminalError(error));
      });
    }

    if (options?.wakeShell && rows > 1) {
      window.setTimeout(() => {
        if (!visible || activeInstanceIdRef.current !== snapshotRef.current?.instanceId) {
          return;
        }

        void resizeEmbeddedTerminal({ cols, rows: rows - 1 })
          .then(() => resizeEmbeddedTerminal({ cols, rows }))
          .catch((error) => {
            onError(formatTerminalError(error));
          });
      }, 40);
    }
  };

  useEffect(() => {
    if (!visible || terminalRef.current) {
      return;
    }

    const host = hostRef.current;
    if (!host) {
      return;
    }

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      cursorWidth: 1,
      fontFamily:
        '"SFMono-Regular", "JetBrains Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1.35,
      scrollback: 5000,
      theme,
    });
    const fitAddon = new FitAddon();
    const serializeAddon = new SerializeAddon();
    fitAddonRef.current = fitAddon;
    serializeAddonRef.current = serializeAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(serializeAddon);
    terminal.open(host);
    terminalRef.current = terminal;

    terminal.onData((data) => {
      void sendEmbeddedTerminalInput(data).catch((error) => {
        onError(formatTerminalError(error));
      });
    });

    return undefined;
  }, [visible, onError, theme]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }

    terminal.options.theme = theme;
    terminal.refresh(0, Math.max(terminal.rows - 1, 0));
  }, [theme]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
      }
      persistTerminalBuffer();
      activeInstanceIdRef.current = null;
      bufferedEventsRef.current.clear();
      lastSizeRef.current = null;
      fitAddonRef.current = null;
      serializeAddonRef.current = null;
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    const writeEvent = (event: TerminalEvent) => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      if (event.kind === "data") {
        terminal.write(event.data, () => {
          schedulePersistTerminalBuffer();
        });
        return;
      }

      const color = event.kind === "error" ? "31" : "90";
      terminal.write(`\r\n\x1b[${color}m[${event.message}]\x1b[0m\r\n`, () => {
        schedulePersistTerminalBuffer();
      });
    };

    const bufferEvent = (event: TerminalEvent) => {
      const bucket = bufferedEventsRef.current.get(event.instanceId) ?? [];
      bucket.push(event);
      if (bucket.length > 120) {
        bucket.shift();
      }
      bufferedEventsRef.current.set(event.instanceId, bucket);
    };

    const flushBufferedEvents = (instanceId: number) => {
      const buffered = bufferedEventsRef.current.get(instanceId);
      if (!buffered?.length) {
        return;
      }
      buffered.forEach(writeEvent);
      bufferedEventsRef.current.delete(instanceId);
    };

    void listen<TerminalEvent>("terminal-event", ({ payload }) => {
      if (disposed || !payload?.instanceId) {
        return;
      }

      if (payload.kind === "exit") {
        setSnapshot((current) =>
          current && current.instanceId === payload.instanceId
            ? { ...current, running: false }
            : current,
        );
      }

      if (payload.instanceId === activeInstanceIdRef.current) {
        writeEvent(payload);
      } else {
        bufferEvent(payload);
      }
    })
      .then((nextUnlisten) => {
        unlisten = nextUnlisten;
        const currentInstanceId = activeInstanceIdRef.current;
        if (currentInstanceId) {
          flushBufferedEvents(currentInstanceId);
        }
      })
      .catch((error) => {
        onError(formatTerminalError(error));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [onError]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (snapshot?.running && openedWorkspaceRef.current === workspacePath) {
      window.requestAnimationFrame(() => {
        syncTerminalViewport({ forceResize: true, wakeShell: true });
      });
      setOpening(false);
      return;
    }

    let disposed = false;
    setOpening(true);

    void openEmbeddedTerminal(workspacePath)
      .then((nextSnapshot) => {
        if (disposed) {
          return;
        }

        const terminal = terminalRef.current;

        if (terminal && (!nextSnapshot.reused || activeInstanceIdRef.current !== nextSnapshot.instanceId)) {
          terminal.reset();
          lastSizeRef.current = null;
        }

        activeInstanceIdRef.current = nextSnapshot.instanceId;
        openedWorkspaceRef.current = workspacePath;
        setSnapshot(nextSnapshot);
        restorePersistedBuffer(workspacePath, nextSnapshot);
        const buffered = bufferedEventsRef.current.get(nextSnapshot.instanceId);
        if (buffered?.length && terminal) {
          buffered.forEach((event) => {
            if (event.kind === "data") {
              terminal.write(event.data);
            } else {
              const color = event.kind === "error" ? "31" : "90";
              terminal.write(`\r\n\x1b[${color}m[${event.message}]\x1b[0m\r\n`);
            }
          });
          bufferedEventsRef.current.delete(nextSnapshot.instanceId);
          schedulePersistTerminalBuffer();
        }
      })
      .catch((error) => {
        if (!disposed) {
          onError(formatTerminalError(error));
        }
      })
      .finally(() => {
        if (!disposed) {
          setOpening(false);
        }
      });

    return () => {
      disposed = true;
      setOpening(false);
    };
  }, [visible, workspacePath, snapshot?.running, onError]);

  useEffect(() => {
    if (visible) {
      return;
    }

    persistTerminalBuffer();
  }, [visible, snapshot]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const host = hostRef.current;
    if (!terminal || !host) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      syncTerminalViewport({ forceResize: true, wakeShell: true });
    });
    const refreshPasses = [140, 280, 520].map((delay) =>
      window.setTimeout(() => {
        syncTerminalViewport({
          forceResize: delay === 140,
          wakeShell: delay === 280,
        });
      }, delay),
    );

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        syncTerminalViewport({ forceResize: true });
      });
    });
    observer.observe(host);
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = observer;

    return () => {
      window.cancelAnimationFrame(frame);
      refreshPasses.forEach((timer) => {
        window.clearTimeout(timer);
      });
      observer.disconnect();
      if (resizeObserverRef.current === observer) {
        resizeObserverRef.current = null;
      }
    };
  }, [visible, snapshot?.instanceId, onError]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const handleWindowFocus = () => {
      syncTerminalViewport({ forceResize: true, wakeShell: true });
      window.setTimeout(() => {
        syncTerminalViewport({ wakeShell: true });
      }, 180);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleWindowFocus();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [visible, snapshot?.instanceId]);

  const shellLabel = snapshot?.shell || "zsh";
  const cwdLabel = snapshot?.cwd || workspacePath;
  const showLoadingOverlay = opening && !snapshot?.running;
  const terminalBorderColor = hexToRgba(theme.foreground, 0.12);
  const terminalMutedColor = hexToRgba(theme.foreground, 0.62);
  const terminalSecondaryMutedColor = hexToRgba(theme.foreground, 0.48);
  const terminalPanelShadow = hexToRgba(theme.foreground, 0.16);
  const terminalGlowTop = hexToRgba(theme.blue, 0.16);
  const terminalFadeTop = hexToRgba(theme.background, 0.34);

  return (
    <div
      className={cn(
        variant === "panel"
          ? "flex h-full min-h-0 min-w-0 flex-1 pt-1.5"
          : terminalWrapperClassName,
        variant === "panel"
          ? !visible && "pointer-events-none hidden"
          : visible
            ? "max-h-[26rem] translate-y-0 px-3 py-3 opacity-100"
            : "pointer-events-none max-h-0 -translate-y-2 px-3 py-0 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          variant === "panel"
            ? "flex h-full min-h-0 w-full flex-1 flex-col border-t dark:border-white/10"
            : "mx-auto w-full max-w-5xl overflow-hidden rounded-[1.2rem] border dark:border-white/10",
        )}
        style={{
          backgroundColor: theme.background,
          borderColor: terminalBorderColor,
          boxShadow: variant === "panel" ? undefined : `0 20px 48px ${terminalPanelShadow}`,
        }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3 dark:border-white/10"
          style={{ borderColor: terminalBorderColor }}
        >
          <div className="min-w-0">
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: terminalMutedColor }}
            >
              Terminal · {shellLabel}
            </p>
            <p className="truncate font-mono text-[12px]" style={{ color: theme.foreground }}>
              {cwdLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {opening ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--app-accent-border)] bg-[var(--app-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--app-accent-text-strong)] dark:bg-[rgba(74,163,255,0.12)]">
                <LoaderCircle className="size-3 animate-spin" />
                启动中
              </span>
            ) : (
              <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200 dark:border-emerald-400/20 dark:bg-emerald-400/12 dark:text-emerald-200">
                已就绪
              </span>
            )}
          </div>
        </div>

        <div
          className="relative flex min-h-0 flex-1 px-3 py-3"
          style={{
            background: `radial-gradient(circle at top, ${terminalGlowTop}, transparent 40%), linear-gradient(180deg, ${theme.background} 0%, ${theme.background} 100%)`,
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-12"
            style={{ background: `linear-gradient(180deg, ${terminalFadeTop}, transparent)` }}
          />
          {showLoadingOverlay ? (
            <div className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center">
              <div className="inline-flex max-w-sm items-center gap-2 rounded-full border border-[color:var(--app-accent-border)] bg-[var(--app-surface-tint-strong)] px-3.5 py-2 text-[11px] font-semibold tracking-[0.01em] text-[color:var(--app-accent-text-strong)] shadow-[0_18px_40px_var(--app-shadow-strong)] backdrop-blur-xl">
                <LoaderCircle className="size-3.5 animate-spin text-[color:var(--app-accent-text)]" />
                正在连接 zsh 终端
              </div>
            </div>
          ) : null}
          <div
            ref={hostRef}
            className={cn(
              "overflow-hidden border bg-transparent px-1 py-1",
              variant === "panel" ? "h-full min-h-0 flex-1" : "h-64 rounded-[0.95rem]",
            )}
            style={{ borderColor: terminalBorderColor }}
            onMouseDown={() => {
              terminalRef.current?.focus();
            }}
          />
        </div>

        {variant === "panel" ? (
          <div
            className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[11px]"
            style={{ borderColor: terminalBorderColor, color: terminalMutedColor }}
          >
            <span className="truncate text-slate-600 dark:text-slate-300">真实 PTY 会话，支持 zsh 补全、光标和全屏终端应用。</span>
            <span
              className="inline-flex items-center gap-1"
              style={{ color: terminalSecondaryMutedColor }}
            >
              <TriangleAlert className="size-3.5" />
              收起后会保留当前终端状态
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-[11px]"
            style={{ borderColor: terminalBorderColor, color: terminalMutedColor }}
          >
            <span className="truncate">真实 PTY 会话，支持 zsh 补全、光标和全屏终端应用。</span>
            <span
              className="inline-flex items-center gap-1"
              style={{ color: terminalSecondaryMutedColor }}
            >
              <TriangleAlert className="size-3.5" />
              隐藏后会保留当前终端状态
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value) || expanded.length !== 6) {
    return hex;
  }

  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function formatTerminalError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "终端操作失败";
}

function writePersistedTerminalBuffer(buffer: PersistedTerminalBuffer) {
  try {
    window.localStorage.setItem(
      `${TERMINAL_BUFFER_STORAGE_KEY}:${buffer.workspacePath}`,
      JSON.stringify(buffer),
    );
  } catch {
    // Ignore local storage failures and keep in-memory cache only.
  }
}

function readPersistedTerminalBuffer(workspacePath: string) {
  const cachedBuffer = terminalBufferCache.get(workspacePath);
  if (cachedBuffer) {
    return cachedBuffer;
  }

  try {
    const raw = window.localStorage.getItem(`${TERMINAL_BUFFER_STORAGE_KEY}:${workspacePath}`);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as PersistedTerminalBuffer;
    if (
      !parsed ||
      parsed.workspacePath !== workspacePath ||
      typeof parsed.instanceId !== "number" ||
      typeof parsed.serialized !== "string"
    ) {
      return null;
    }

    terminalBufferCache.set(workspacePath, parsed);
    return parsed;
  } catch {
    return null;
  }
}
