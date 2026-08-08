// Compila o better-sqlite3 especificamente para o ABI do Electron instalado.
// Usar "npm rebuild" diretamente é mais previsível que depender da detecção
// automática do @electron/rebuild no Windows.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const electronVersion = require("electron/package.json").version;
const nodeFile = path.join(__dirname, "..", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

execFileSync(npmCommand, ["rebuild", "better-sqlite3", "--build-from-source"], {
  stdio: "inherit",
  env: {
    ...process.env,
    npm_config_runtime: "electron",
    npm_config_target: electronVersion,
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_build_from_source: "true",
  },
});

if (!fs.existsSync(nodeFile)) {
  throw new Error(`O binário nativo não foi gerado: ${nodeFile}`);
}

console.log(`better-sqlite3 compilado para Electron ${electronVersion}.`);
