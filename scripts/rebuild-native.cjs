// Compila o better-sqlite3 especificamente para o ABI do Electron instalado.
// Usar "npm rebuild" diretamente é mais previsível que depender da detecção
// automática do @electron/rebuild no Windows.
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const electronVersion = require("electron/package.json").version;
const nodeFile = path.join(__dirname, "..", "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node");
const prebuildFile = path.join(__dirname, "..", "node_modules", "better-sqlite3", "prebuilds", `${process.platform}-${process.arch}.node`);
const npmCommand = "npm";

execFileSync(npmCommand, ["rebuild", "better-sqlite3", "--build-from-source"], {
  stdio: "inherit",
  // Arquivos .cmd não são executáveis diretamente pelo execFile no Windows;
  // o shell é necessário para resolver o npm.cmd instalado pelo Node.js.
  shell: process.platform === "win32",
  env: {
    ...process.env,
    npm_config_runtime: "electron",
    npm_config_target: electronVersion,
    npm_config_disturl: "https://electronjs.org/headers",
    npm_config_build_from_source: "true",
  },
});

// O npm pode informar sucesso e manter o addon N-API em prebuilds/. Porém,
// o loader do better-sqlite3 procura exclusivamente em build/Release/.
// Materializamos a cópia nesse destino; o workflow testa a abertura do banco
// dentro do Electron logo em seguida, antes de empacotar o instalador.
if (!fs.existsSync(nodeFile) && fs.existsSync(prebuildFile)) {
  fs.mkdirSync(path.dirname(nodeFile), { recursive: true });
  fs.copyFileSync(prebuildFile, nodeFile);
}

if (!fs.existsSync(nodeFile)) {
  throw new Error(`O binário nativo não foi gerado: ${nodeFile}`);
}

console.log(`better-sqlite3 compilado para Electron ${electronVersion}.`);
