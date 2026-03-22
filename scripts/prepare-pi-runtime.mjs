import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const resourceRoot = join(projectRoot, "src-tauri", "resources");
const bundlesDir = join(resourceRoot, "pi-bundles");
const legacyRuntimeDir = join(resourceRoot, "pi-runtime");
const packageJsonPath = join(projectRoot, "package.json");
const sessionBackfillScriptPath = join(scriptDir, "backfill-pi-session.mjs");
const npmExecutableName = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeExecutableName = process.platform === "win32" ? "node.exe" : "node";
const tarExecutableName = process.platform === "win32" ? "tar.exe" : "tar";

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const piVersionRange = packageJson.dependencies?.["@mariozechner/pi-coding-agent"];

if (!piVersionRange) {
  throw new Error("package.json 中没有找到 @mariozechner/pi-coding-agent 依赖。");
}

const stageRoot = mkdtempSync(join(tmpdir(), "pi-runtime-build-"));
const piRuntimeStage = join(stageRoot, "pi-runtime");
const nodeRuntimeStage = join(stageRoot, "node-runtime");
const nodeBinStage = join(nodeRuntimeStage, "bin");

rmSync(bundlesDir, { recursive: true, force: true });
rmSync(legacyRuntimeDir, { recursive: true, force: true });
mkdirSync(bundlesDir, { recursive: true });
mkdirSync(piRuntimeStage, { recursive: true });
mkdirSync(nodeBinStage, { recursive: true });

writeFileSync(
  join(piRuntimeStage, "package.json"),
  JSON.stringify(
    {
      private: true,
      name: "pi-runtime",
      version: "0.0.0",
      dependencies: {
        "@mariozechner/pi-coding-agent": piVersionRange,
      },
    },
    null,
    2,
  ),
);

execFileSync(npmExecutableName, ["install", "--omit=dev", "--ignore-scripts"], {
  cwd: piRuntimeStage,
  stdio: "inherit",
});

const installedPiPackage = JSON.parse(
  readFileSync(
    join(
      piRuntimeStage,
      "node_modules",
      "@mariozechner",
      "pi-coding-agent",
      "package.json",
    ),
    "utf8",
  ),
);

const installedPiVersion = installedPiPackage.version;
const nodeVersion = process.version.replace(/^v/, "");
const runtimeId = [
  `pi-${sanitizeForPath(installedPiVersion)}`,
  `node-${sanitizeForPath(nodeVersion)}`,
  `${process.platform}-${process.arch}`,
].join("__");

const bundledNodePath = join(nodeBinStage, nodeExecutableName);
copyFileSync(process.execPath, bundledNodePath);
chmodSync(bundledNodePath, 0o755);

const nodeInstallRoot = dirname(dirname(process.execPath));
const nodeLicensePath = join(nodeInstallRoot, "LICENSE");
if (existsSync(nodeLicensePath)) {
  copyFileSync(nodeLicensePath, join(nodeRuntimeStage, "LICENSE"));
}

archiveDirectory(stageRoot, "pi-runtime", join(bundlesDir, "pi-runtime.tar.gz"));
archiveDirectory(stageRoot, "node-runtime", join(bundlesDir, "node-runtime.tar.gz"));

writeFileSync(
  join(bundlesDir, "manifest.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      runtimeId,
      piVersion: installedPiVersion,
      nodeVersion,
      platform: process.platform,
      arch: process.arch,
      piArchive: "pi-runtime.tar.gz",
      nodeArchive: "node-runtime.tar.gz",
      cliRelativePath:
        "pi-runtime/node_modules/@mariozechner/pi-coding-agent/dist/cli.js",
      nodeRelativePath: `node-runtime/bin/${nodeExecutableName}`,
    },
    null,
    2,
  ),
);

copyFileSync(sessionBackfillScriptPath, join(bundlesDir, "backfill-pi-session.mjs"));

rmSync(stageRoot, { recursive: true, force: true });

function archiveDirectory(parentDir, dirName, outputPath) {
  execFileSync(tarExecutableName, ["-czf", outputPath, "-C", parentDir, dirName], {
    stdio: "inherit",
  });
}

function sanitizeForPath(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-");
}
