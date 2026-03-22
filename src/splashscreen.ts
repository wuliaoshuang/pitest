import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type RuntimeEnvelope =
  | {
      kind: "runtime";
      title: string;
      detail: string;
      progress: number;
    }
  | {
      kind: "error";
      message: string;
    };

type AppBootstrapSnapshot = {
  phase: "booting" | "ready" | "error";
  title: string;
  detail: string;
  progress: number;
  error?: string;
};

const title = document.getElementById("title");
const detail = document.getElementById("detail");
const phase = document.getElementById("phase");
const percent = document.getElementById("percent");
const progressBar = document.getElementById("progress-bar");
const actions = document.getElementById("actions");
const body = document.body;
const retryButton = document.getElementById("retry-button") as HTMLButtonElement | null;
const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-range-start]"));

updateRuntimeView({
  title: "同步工作区",
  detail: "正在准备本地代理环境。首次启动会自动解压内置 runtime，所以会比后续启动慢一点。",
  progress: 10,
});

void invoke<AppBootstrapSnapshot>("app_bootstrap_state")
  .then((snapshot) => {
    updateRuntimeView({
      title: snapshot.title,
      detail: snapshot.error || snapshot.detail,
      progress: snapshot.progress,
      phaseLabel: snapshot.phase === "error" ? "错误" : "同步中",
    });
  })
  .catch((error) => {
    console.error("Failed to fetch bootstrap state", error);
  });

retryButton?.addEventListener("click", async () => {
  retryButton.disabled = true;

  try {
    await invoke("app_restart_bootstrap");
    updateRuntimeView({
      title: "重新同步工作区",
      detail: "正在重新准备本地代理环境。",
      progress: 12,
      phaseLabel: "同步中",
    });
  } catch (error) {
    console.error("Failed to restart bootstrap", error);
    retryButton.disabled = false;
  }
});

void listen<RuntimeEnvelope>("pi-event", (event) => {
  const envelope = event.payload;

  if (envelope.kind === "runtime") {
    updateRuntimeView(envelope);
    return;
  }

  if (envelope.kind === "error") {
    updateRuntimeView({
      title: "启动遇到问题",
      detail: envelope.message,
      progress: 100,
      phaseLabel: "错误",
    });
  }
});

function updateRuntimeView(input: {
  title: string;
  detail: string;
  progress: number;
  phaseLabel?: string;
}) {
  const normalizedProgress = Math.max(8, Math.min(100, input.progress));
  const nextPhase =
    input.phaseLabel === "错误" ? "error" : normalizedProgress >= 100 ? "ready" : "booting";

  title && setText(title, input.title);
  detail && setText(detail, input.detail);
  phase && setText(phase, input.phaseLabel ?? "同步中");
  percent && setText(percent, `${Math.round(normalizedProgress)}%`);
  body.dataset.phase = nextPhase;

  if (progressBar) {
    progressBar.setAttribute("style", `width: ${normalizedProgress}%`);
  }

  if (actions) {
    actions.classList.toggle("is-visible", input.phaseLabel === "错误");
  }

  if (retryButton) {
    retryButton.disabled = false;
  }

  updateSteps(normalizedProgress);
}

function updateSteps(progress: number) {
  for (const step of steps) {
    const start = Number(step.dataset.rangeStart ?? 0);
    const end = Number(step.dataset.rangeEnd ?? 100);
    const stateLabel = step.querySelector<HTMLElement>(".step-state");

    if (!stateLabel) {
      continue;
    }

    if (progress >= end) {
      step.dataset.state = "done";
      setText(stateLabel, "已完成");
      continue;
    }

    if (progress >= start) {
      step.dataset.state = "active";
      setText(stateLabel, "处理中");
      continue;
    }

    step.dataset.state = "idle";
    setText(stateLabel, "待开始");
  }
}

function setText(node: Element, value: string) {
  node.textContent = value;
}
