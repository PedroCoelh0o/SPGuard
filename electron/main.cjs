// Processo principal do Electron.
// Sobe o servidor Node (gerado pelo build do TanStack Start / Nitro) e abre
// uma janela nativa apontando para ele em http://127.0.0.1:PORT.
//
// Arquivo em CommonJS (.cjs) porque o package.json do projeto usa
// "type": "module" — o processo principal do Electron continua sendo
// carregado normalmente como CommonJS através dessa extensão.

const { app, BrowserWindow, shell, Menu, dialog, ipcMain } = require("electron");
const path = require("node:path");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

// Garante que o nome do app fique "SPGuard" em tempo de execução também
// (barra de tarefas do Windows, agrupamento de janelas, notificações) —
// não só no instalador/atalhos, que já vêm do "productName" configurado
// no package.json.
app.setName("SPGuard");
if (process.platform === "win32") {
  app.setAppUserModelId("com.spguard.app");
}

const PORT = process.env.PORT || 3777;
// Usa 127.0.0.1 explicitamente (não "localhost") para a janela carregar a
// página. Em alguns ambientes "localhost" pode resolver para IPv6 (::1)
// para algumas requisições e IPv4 para outras, o que causa falhas
// intermitentes de conexão quando o app faz chamadas para o servidor local
// depois da carga inicial. Usando o IP direto, todas as requisições da
// página (inclusive as relativas, feitas pelo próprio app) ficam
// consistentes.
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const SERVER_ORIGIN = new URL(SERVER_URL).origin;
// Segredo efêmero: protege as RPCs locais de outros processos. Nunca é
// persistido e é entregue ao renderer somente pela ponte IPC confiável.
const LOCAL_RPC_TOKEN = crypto.randomBytes(32).toString("hex");

// Pasta onde ficam o banco SQLite e os arquivos anexados (fotos e
// documentos dos colaboradores). Usa a pasta de dados do usuário do
// Windows (ex.: C:\Users\<voce>\AppData\Roaming\SPGuard), então os dados
// sobrevivem a atualizações/reinstalações do app. Em desenvolvimento
// (fora do pacote instalável), usa uma pasta local no próprio projeto.
const LOCAL_DATA_DIR = app.isPackaged
  ? path.join(app.getPath("userData"), "data")
  : path.join(__dirname, "..", "local-data");

// Em produção (empacotado), os arquivos do servidor ficam em
// resources/app-server (copiados via "extraResources" no build do
// electron-builder). Em desenvolvimento, usamos o .output gerado
// localmente por `npm run build`.
const SERVER_ENTRY = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "server", "index.mjs")
  : path.join(__dirname, "..", ".output", "server", "index.mjs");

const PUBLIC_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app-server", "public")
  : path.join(__dirname, "..", ".output", "public");

let mainWindow = null;

const PLANILHAS_PERMITIDAS = new Set(["spguard-dados.xlsx", "spguard-eletronicos.xlsx"]);
const DIRETORIO_CONFIG = "spguard-planilhas.json";

function caminhoConfigPlanilhas() {
  return path.join(app.getPath("userData"), DIRETORIO_CONFIG);
}

async function diretorioPlanilhas() {
  try {
    const raw = await fs.readFile(caminhoConfigPlanilhas(), "utf8");
    const value = JSON.parse(raw);
    return typeof value?.directory === "string" ? value.directory : null;
  } catch {
    return null;
  }
}

async function salvarDiretorioPlanilhas(directory) {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(caminhoConfigPlanilhas(), JSON.stringify({ directory }), "utf8");
}

function validarNomePlanilha(name) {
  if (!PLANILHAS_PERMITIDAS.has(name)) throw new Error("Arquivo de planilha inválido");
}

function senderConfiavel(webContents) {
  try { return new URL(webContents.getURL()).origin === SERVER_ORIGIN; } catch { return false; }
}

function exigirSenderConfiavel(event) {
  if (!senderConfiavel(event.sender)) throw new Error("Origem não autorizada");
}

async function caminhoPlanilha(name) {
  validarNomePlanilha(name);
  const directory = await diretorioPlanilhas();
  if (!directory) throw new Error("Selecione uma pasta primeiro");
  const spguard = path.join(directory, "SPGuard");
  return { spguard, file: path.join(spguard, name) };
}

ipcMain.handle("spguard-files:select-directory", async (event) => {
  exigirSenderConfiavel(event);
  const result = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: "Selecione a pasta para as planilhas do SPGuard",
    properties: ["openDirectory", "createDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) throw new Error("Seleção de pasta cancelada");
  await salvarDiretorioPlanilhas(result.filePaths[0]);
  return path.basename(result.filePaths[0]);
});

ipcMain.handle("spguard-files:get-directory-name", async (event) => {
  exigirSenderConfiavel(event);
  const directory = await diretorioPlanilhas();
  return directory ? path.basename(directory) : null;
});

ipcMain.handle("spguard-files:file-exists", async (_event, name) => {
  exigirSenderConfiavel(_event);
  const { file } = await caminhoPlanilha(name);
  try { await fs.access(file); return true; } catch { return false; }
});

ipcMain.handle("spguard-files:write-file", async (_event, name, contents) => {
  exigirSenderConfiavel(_event);
  const { spguard, file } = await caminhoPlanilha(name);
  await fs.mkdir(spguard, { recursive: true });
  await fs.writeFile(file, Buffer.from(contents));
});

ipcMain.handle("spguard-files:read-file", async (_event, name) => {
  exigirSenderConfiavel(_event);
  const { file } = await caminhoPlanilha(name);
  return new Uint8Array(await fs.readFile(file));
});

ipcMain.handle("spguard-runtime:get-rpc-token", async (event) => {
  exigirSenderConfiavel(event);
  return LOCAL_RPC_TOKEN;
});

// O servidor roda DENTRO do próprio processo principal do Electron (não
// como um processo filho separado via child_process.fork). É um padrão
// comum para esse tipo de app e evita a complexidade de gerenciar um
// processo filho separado (pipes, IPC, sinais de encerramento).
function startServer() {
  process.env.PORT = String(PORT);
  process.env.NITRO_PORT = String(PORT);
  process.env.HOST = "127.0.0.1";
  process.env.NITRO_PUBLIC_DIR = PUBLIC_DIR;
  process.env.LOCAL_DATA_DIR = LOCAL_DATA_DIR;
  process.env.LOCAL_RPC_TOKEN = LOCAL_RPC_TOKEN;

  // O bundle do Nitro é um módulo ESM (.mjs) que, ao ser importado, já
  // sobe o servidor HTTP como efeito colateral (é o mesmo arquivo que
  // `node .output/server/index.mjs` roda diretamente).
  return import(pathToFileURL(SERVER_ENTRY).href);
}

// Faz polling em / até o servidor responder, em vez de assumir que já
// está pronto logo após o import (a inicialização do Nitro é assíncrona).
function waitForServer(resolve, reject, attempt = 0) {
  const MAX_ATTEMPTS = 100; // ~20s
  const req = http.get(SERVER_URL, () => {
    req.destroy();
    resolve();
  });
  req.on("error", () => {
    req.destroy();
    if (attempt >= MAX_ATTEMPTS) {
      reject(new Error("Servidor não respondeu a tempo."));
      return;
    }
    setTimeout(() => waitForServer(resolve, reject, attempt + 1), 200);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#0f172a",
    icon: path.join(__dirname, "..", "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
    show: false,
  });

  Menu.setApplicationMenu(null);

  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Links externos (ex.: target="_blank") abrem no navegador padrão,
  // não dentro da janela do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let origin;
    try { origin = new URL(url).origin; } catch { return { action: "deny" }; }
    if (origin !== SERVER_ORIGIN) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      if (new URL(url).origin === SERVER_ORIGIN) return;
    } catch { /* URL inválida também é bloqueada */ }
    event.preventDefault();
    shell.openExternal(url);
  });

  mainWindow.loadURL(SERVER_URL);
}

app.whenReady().then(async () => {
  try {
    await startServer();
    await new Promise((resolve, reject) => waitForServer(resolve, reject));
    createWindow();
  } catch (err) {
    console.error("Falha ao iniciar o servidor embutido:", err);
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
