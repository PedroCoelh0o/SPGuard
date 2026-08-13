import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CircleHelp, Database, FileKey, FileScan, FileSpreadsheet, History, RotateCcw, Save, Search, Settings, Smartphone, Trash2, Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ajuda")({ component: Ajuda });

type Guia = { icon: typeof Users; titulo: string; descricao: string; passos: string[] };

const guias: Guia[] = [
  {
    icon: Users,
    titulo: "Colaboradores",
    descricao: "Cadastre e mantenha as fichas dos colaboradores atualizadas.",
    passos: [
      "Clique em Novo colaborador para abrir uma ficha vazia.",
      "Preencha ao menos o nome e a empresa; depois complete os demais dados nas abas da ficha.",
      "O nome é padronizado automaticamente; as partículas da, das, de, do e dos ficam em minúsculas.",
      "Se houver um cadastro com o mesmo nome normalizado na mesma empresa, o SPGuard o unifica, preservando documentos, eletrônicos e as informações do registro atualizado mais recentemente.",
      "Na aba Observações, registre informações importantes que devem acompanhar o colaborador.",
      "Abra o ícone de olho para consultar a ficha, anexar documentos, visualizar anexos e conferir eletrônicos vinculados.",
      "Use os botões CSV, XLSX ou PDF para exportar somente os colaboradores que aparecem na pesquisa atual.",
    ],
  },
  {
    icon: Search,
    titulo: "Consulta",
    descricao: "Encontre colaboradores rapidamente e gere relatórios com filtros.",
    passos: [
      "Digite nome, CPF, matrícula, empresa, cargo ou cidade no campo de pesquisa.",
      "Combine os filtros de empresa, função, cidade, situação, presença de documentos e período de admissão ou desligamento.",
      "A lista é atualizada conforme os critérios preenchidos; não é necessário clicar em Salvar.",
      "Confira o resultado antes de exportar: CSV, XLSX e PDF sempre usam os registros mostrados na tela.",
    ],
  },
  {
    icon: Smartphone,
    titulo: "Eletrônicos",
    descricao: "Controle dispositivos vinculados e a autorização de cada colaborador.",
    passos: [
      "Pesquise o colaborador pelo nome, setor ou função; também é possível filtrar por empresa.",
      "Use o ícone de olho para abrir a lista de celulares, notebooks e tablets daquele colaborador.",
      "Use o ícone de autorização para alternar entre Autorizado e Revogado. Revogar não exclui os dispositivos.",
      "Use a lixeira para escolher um ou mais dispositivos específicos que devem ser removidos; eles podem ser restaurados por 15 dias.",
      "Clique em Exportar PDF para criar um relatório somente com os colaboradores filtrados na tela.",
    ],
  },
  {
    icon: FileScan,
    titulo: "Autorização digitalizada de eletrônicos",
    descricao: "Lê o formulário padrão da autorização e prepara o cadastro do celular e/ou notebook.",
    passos: [
      "Abra a ficha do colaborador, entre na aba Eletrônicos e clique em Ler autorização.",
      "Escolha o formulário digitalizado em PDF, PNG, JPG ou JPEG. O SPGuard gira e analisa a primeira página no próprio computador.",
      "O sistema lê somente os dados do portador, a descrição do celular, a descrição do notebook e a justificativa. Assinaturas e carimbos não são analisados.",
      "Confira todos os campos. Informações duvidosas ou ilegíveis podem ficar vazias ou destacadas e devem ser corrigidas manualmente.",
      "Marque quais equipamentos devem ser cadastrados e clique em Confirmar e cadastrar. Nada é gravado antes dessa confirmação.",
      "O formulário original fica anexado à ficha e a justificativa acompanha os equipamentos cadastrados.",
      "A leitura é 100% offline: nenhum documento ou dado é enviado à internet, nuvem, GitHub ou serviço externo.",
    ],
  },
  {
    icon: History,
    titulo: "Histórico de alterações",
    descricao: "Mostra a rastreabilidade dos cadastros e das mudanças realizadas no computador.",
    passos: [
      "Nas telas Colaboradores ou Eletrônicos, clique em Histórico.",
      "Cada registro informa data e hora, tipo de registro, ação realizada, campos alterados e o responsável identificado como Usuário local.",
      "O histórico inclui cadastros, edições, itens enviados para a lixeira e restaurações.",
    ],
  },
  {
    icon: Trash2,
    titulo: "Lixeira de segurança",
    descricao: "Evita a perda imediata de colaboradores e eletrônicos removidos por engano.",
    passos: [
      "Ao excluir um colaborador ou eletrônico, o item vai para a Lixeira em vez de ser apagado imediatamente.",
      "Na tela Colaboradores ou Eletrônicos, clique em Lixeira para localizar o item e usar Restaurar.",
      "Colaboradores restaurados mantêm seus documentos vinculados. Os itens ficam na lixeira por 15 dias e depois são excluídos definitivamente; você também pode excluir permanentemente um item a qualquer momento.",
    ],
  },
];

const configuracoes: Guia[] = [
  {
    icon: Database,
    titulo: "Armazenamento local dos dados em planilha .xlsx",
    descricao: "Cria uma cópia dos dados cadastrais em Excel na pasta que você escolher.",
    passos: [
      "Abra Configurações pelo ícone de engrenagem no canto superior direito.",
      "Clique em Selecionar pasta e escolha uma pasta de sua preferência no computador ou em um disco externo.",
      "Clique em Salvar dados agora. O SPGuard cria a pasta SPGuard e o arquivo spguard-dados.xlsx.",
      "Esse arquivo contém empresas, colaboradores, observações, eletrônicos, histórico e itens da lixeira; ele não inclui os documentos anexados.",
    ],
  },
  {
    icon: Save,
    titulo: "Backup completo com documentos",
    descricao: "É a cópia mais completa do sistema e a mais indicada antes de atualizações importantes.",
    passos: [
      "Depois de selecionar a pasta, clique em Criar backup completo (.zip).",
      "O arquivo spguard-backup-completo.zip reúne os dados em planilha, histórico, itens da lixeira e todos os documentos anexados nas fichas.",
      "Os documentos são organizados em subpastas pelo nome de cada colaborador.",
      "Guarde esse ZIP em local seguro, como um pendrive ou disco externo. Ele é criado localmente e não é enviado ao GitHub ou à nuvem pelo SPGuard.",
    ],
  },
  {
    icon: FileKey,
    titulo: "Backup criptografado com senha",
    descricao: "Protege o backup completo contra a leitura por pessoas que tenham acesso à pasta ou ao arquivo.",
    passos: [
      "Clique em Criar backup com senha e defina uma senha de pelo menos 12 caracteres.",
      "Confirme a mesma senha. O SPGuard cria o arquivo spguard-backup-criptografado.spguard com dados e documentos protegidos.",
      "A senha é usada apenas nesse backup; ela não cria login para usar o SPGuard e não é armazenada pelo sistema.",
      "Para restaurar, clique em Restaurar backup com senha, escolha o arquivo e informe a senha correta.",
      "Guarde a senha em local seguro. Se ela for esquecida, o backup não poderá ser recuperado.",
    ],
  },
  {
    icon: RotateCcw,
    titulo: "Restaurar dados do backup",
    descricao: "Use quando precisar recuperar uma cópia anterior dos dados.",
    passos: [
      "Para restaurar somente empresas, colaboradores e eletrônicos, use Restaurar da pasta ou Escolher arquivo e selecione spguard-dados.xlsx.",
      "Para restaurar também os documentos anexados, use Restaurar backup completo e selecione spguard-backup-completo.zip.",
      "Confirme a ação com atenção: registros com o mesmo ID são atualizados pelo conteúdo do backup.",
      "Após a restauração, o sistema é recarregado para exibir os dados recuperados.",
    ],
  },
  {
    icon: FileSpreadsheet,
    titulo: "Planilha de entrada manual",
    descricao: "Permite cadastrar ou atualizar muitos colaboradores e eletrônicos por uma única planilha.",
    passos: [
      "Clique em Criar planilha de entrada para gerar spguard-eletronicos.xlsx na pasta SPGuard.",
      "Preencha as abas Colaboradores e Eletronicos sem alterar os nomes das colunas.",
      "Use Validar planilha para conferir erros antes de gravar qualquer alteração.",
      "Quando a validação estiver correta, clique em Atualizar agora. Registros existentes podem ser atualizados pelo CPF, matrícula ou identificadores do eletrônico.",
      "A atualização automática pode ser ativada nessa mesma área; ainda assim, é recomendável manter um backup antes de mudanças grandes.",
    ],
  },
];

function GuiaCard({ guia }: { guia: Guia }) {
  const Icon = guia.icon;
  return <Card><CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Icon className="h-5 w-5 text-primary" /> {guia.titulo}</CardTitle><p className="text-sm font-normal text-muted-foreground">{guia.descricao}</p></CardHeader><CardContent><ol className="space-y-3">{guia.passos.map((passo, index) => <li key={passo} className="flex gap-3 text-sm"><Badge className="h-6 w-6 shrink-0 rounded-full grid place-items-center p-0">{index + 1}</Badge><span className="pt-1">{passo}</span></li>)}</ol></CardContent></Card>;
}

function Ajuda() {
  return <div className="space-y-6 max-w-4xl"><div><h1 className="text-2xl font-bold flex items-center gap-2"><CircleHelp className="h-6 w-6 text-primary" /> Ajuda</h1><p className="text-sm text-muted-foreground mt-1">Guia rápido para usar o SPGuard e preservar seus dados com segurança.</p></div><section className="space-y-4"><h2 className="text-lg font-semibold">Operações do dia a dia</h2><div className="grid gap-4">{guias.map((guia) => <GuiaCard key={guia.titulo} guia={guia} />)}</div></section><section className="space-y-4"><h2 className="text-lg font-semibold flex items-center gap-2"><Settings className="h-5 w-5 text-primary" /> Configurações e backups</h2><div className="grid gap-4">{configuracoes.map((guia) => <GuiaCard key={guia.titulo} guia={guia} />)}</div></section></div>;
}
