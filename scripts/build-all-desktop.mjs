import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npm.cmd" : "npm";

function run(args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["run", "build"]);

if (process.platform === "linux") {
  run(["exec", "--", "electron-builder", "--linux", "AppImage", "deb", "--win", "portable", "nsis"]);
  console.log("Linux and Windows packages are in release/. Build the macOS DMG on a macOS machine with npm run dist:mac.");
} else if (process.platform === "darwin") {
  run(["exec", "--", "electron-builder", "--mac", "dmg", "zip"]);
  console.log("macOS packages are in release/. Build Linux and Windows packages on a Linux build machine with npm run dist:all.");
} else if (process.platform === "win32") {
  run(["exec", "--", "electron-builder", "--win", "portable", "nsis"]);
  console.log("Windows packages are in release/. Build Linux packages on Linux and the macOS DMG on macOS.");
} else {
  console.error(`Unsupported build host: ${process.platform}`);
  process.exit(1);
}