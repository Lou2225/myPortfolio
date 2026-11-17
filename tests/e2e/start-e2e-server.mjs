import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";

const projectRoot = process.cwd();
const dataDir =
  process.env.PORTFOLIO_DATA_DIR ||
  path.resolve(projectRoot, "test-results", ".e2e-data");

// Start every E2E suite with an empty isolated JSON store so live `data/` is untouched.
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

const nextBin = path.resolve(
  projectRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

const buildIdPath = path.join(projectRoot, ".next", "BUILD_ID");
if (!fs.existsSync(buildIdPath)) {
  const buildResult = spawnSync(
    process.execPath,
    [nextBin, "build", "--webpack"],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }
  );
  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

const child = spawn(
  process.execPath,
  [nextBin, "start", "-p", "3100", "-H", "127.0.0.1"],
  {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  }
);

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
