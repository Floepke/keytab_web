import { spawn } from "node:child_process";

const electron = process.platform === "win32" ? "electron.cmd" : "electron";
const args = process.platform === "linux" && process.env.XDG_SESSION_TYPE === "wayland"
  ? ["--ozone-platform=x11", "."]
  : ["."];
const child = spawn(electron, args, { stdio: "inherit" });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});