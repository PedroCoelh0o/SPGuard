# Biz People Nexus — Instalador para Windows

Este projeto já foi preparado com um wrapper Electron. Ele empacota o app
(TanStack Start + Supabase) dentro de um servidor Node local e abre numa
janela nativa do Windows — sem depender de navegador nem de hospedagem
externa.

O que foi adicionado ao projeto original:

- `electron/main.cjs` — processo principal do Electron: sobe o servidor
  Node embutido e abre a janela apontando para ele.
- `build/icon.ico` — ícone do app (gerado a partir do `public/favicon.png`;
  troque por um `.ico` em maior resolução quando quiser).
- `.github/workflows/build-windows.yml` — workflow do GitHub Actions que
  gera o instalador automaticamente num runner Windows de verdade.
- `package.json` / `vite.config.ts` — pequenos ajustes: script de build do
  Nitro passou a gerar um servidor Node "standalone" (em vez do padrão
  Cloudflare), e foram adicionadas as dependências/configuração do
  `electron-builder`.

As chaves do Supabase (`.env`) continuam as mesmas do projeto — são a chave
pública ("publishable"/anon), protegida por RLS, então não tem problema
ela ir embutida no instalador.

## Opção A — Gerar o instalador sem precisar de um PC Windows (recomendado)

Eu não consigo compilar um `.exe` de verdade aqui (cross-compilar Windows a
partir de Linux sem o Windows real dá problema com os componentes nativos
do instalador NSIS). A forma confiável é deixar o **GitHub Actions**
compilar num Windows de verdade — e isso já está configurado.

1. Suba estas mudanças para o seu repositório no GitHub (branch `main`).
2. No GitHub, vá em **Actions** → **Build Windows Installer** → **Run workflow**.
3. Aguarde uns 3–5 minutos até o job terminar.
4. Abra o workflow concluído e baixe o artifact
   **biz-people-nexus-windows-installer** (é um `.zip`).
5. Dentro dele está o instalador, algo como
   `Biz People Nexus Setup 1.0.0.exe`. É só rodar no Windows.

O workflow também roda sozinho a cada push na `main`, então depois de
configurado você só precisa entrar em Actions e baixar o artifact mais
recente sempre que quiser uma nova versão.

## Opção B — Gerar localmente, direto num PC Windows

Se você tiver acesso a um Windows (o seu ou de outra pessoa):

```bash
# 1. Instale o Node.js 22 LTS (https://nodejs.org)
# 2. Na pasta do projeto:
npm install
npm run dist:win
```

O instalador sai em `dist_electron\Biz People Nexus Setup <versão>.exe`.

## Testar em modo desenvolvimento (sem gerar instalador)

```bash
npm install
npm run build      # gera .output/ com o servidor Node
npm run electron   # abre o app numa janela Electron
```

## Por que não simplesmente abrir o site num "navegador empacotado"?

O projeto usa TanStack Start (renderização no servidor). Por isso o app
Electron sobe um pequeno servidor Node local (o mesmo código que roda em
produção) e só então abre a janela apontando para
`http://localhost:3777`. Isso garante que o app se comporta exatamente
igual ao publicado, incluindo as rotas e o carregamento inicial.

## Observações

- O app continua precisando de internet, pois os dados ficam no Supabase
  (nuvem). Ele não funciona 100% offline.
- Se um dia quiser trocar de projeto Supabase, atualize tanto o `.env`
  quanto os valores em `SUPABASE_DEFAULTS` no topo de `electron/main.cjs`.
- O ícone atual foi gerado a partir de um favicon pequeno (64×64), então
  pode ficar um pouco borrado em tamanhos grandes. Troque
  `build/icon.ico` por um ícone maior (256×256) quando tiver um.
