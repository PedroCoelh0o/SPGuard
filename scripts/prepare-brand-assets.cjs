const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const logoSvg = readFileSync(path.join(root, "public", "spguard-logo.svg"), "utf8");
const match = logoSvg.match(/data:image\/png;base64,([^"']+)/);

if (!match) throw new Error("A imagem da marca SPGuard não foi encontrada.");

const buildDir = path.join(root, "build");
const sourcePng = path.join(buildDir, "spguard-logo-source.png");
const targetIco = path.join(buildDir, "spguard-icon.ico");
mkdirSync(buildDir, { recursive: true });
writeFileSync(sourcePng, Buffer.from(match[1], "base64"));

// Recorta somente o escudo da marca e cria tamanhos adequados para o
// ícone do executável, atalho e barra de tarefas do Windows.
execFileSync("magick", [
  sourcePng,
  "-alpha", "on",
  "-fuzz", "3%",
  "-transparent", "white",
  "-crop", "620x720+0+140",
  "+repage",
  "-trim",
  "+repage",
  "-resize", "460x460",
  "-gravity", "center",
  "-background", "none",
  "-extent", "512x512",
  "-define", "icon:auto-resize=256,128,64,48,32,16",
  targetIco,
], { stdio: "inherit" });

console.log(`Ícone do SPGuard preparado: ${targetIco}`);
