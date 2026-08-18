const { execFileSync } = require("node:child_process");
const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const logoSvg = readFileSync(path.join(root, "public", "spguard-logo.svg"), "utf8");
const match = logoSvg.match(/data:image\/png;base64,([^"']+)/);

if (!match) throw new Error("A imagem da marca SPGuard não foi encontrada.");

const buildDir = path.join(root, "build");
const sourcePng = path.join(buildDir, "spguard-logo-source.png");
const cleanLogo = path.join(buildDir, "spguard-logo-clean.png");
const shieldPng = path.join(root, "public", "spguard-shield.png");
const wordmarkPng = path.join(root, "public", "spguard-wordmark.png");
const targetIco = path.join(buildDir, "spguard-icon.ico");
mkdirSync(buildDir, { recursive: true });
writeFileSync(sourcePng, Buffer.from(match[1], "base64"));

// A arte original possui um fundo claro. O preenchimento começa no canto
// externo e remove somente esse fundo, preservando os tons prateados da marca.
execFileSync("magick", [
  sourcePng,
  "-alpha", "on",
  "-bordercolor", "white",
  "-border", "1",
  "-fuzz", "5%",
  "-fill", "none",
  "-draw", "color 0,0 floodfill",
  "-shave", "1x1",
  cleanLogo,
], { stdio: "inherit" });

// Recorta somente o escudo para o ícone exibido no cabeçalho, nos atalhos e
// na barra de tarefas do Windows.
execFileSync("magick", [
  cleanLogo,
  "-crop", "540x720+20+140",
  "+repage",
  "-trim",
  "+repage",
  "-resize", "460x460",
  "-gravity", "center",
  "-background", "none",
  "-extent", "512x512",
  shieldPng,
], { stdio: "inherit" });

// O nome usa a tipografia original da marca, preservando a cor e o desenho
// das letras escolhidos para a abertura do SPGuard.
execFileSync("magick", [
  cleanLogo,
  "-crop", "1180x360+540+280",
  "+repage",
  "-trim",
  "+repage",
  wordmarkPng,
], { stdio: "inherit" });

execFileSync("magick", [
  shieldPng,
  "-define", "icon:auto-resize=256,128,64,48,32,16",
  targetIco,
], { stdio: "inherit" });

console.log(`Ícone do SPGuard preparado: ${targetIco}`);
