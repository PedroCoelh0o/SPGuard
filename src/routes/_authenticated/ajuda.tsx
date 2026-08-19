import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CircleHelp,
  Database,
  FileKey,
  FileSpreadsheet,
  History,
  Save,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Trash2,
  Users,
  ShieldAlert,
} from "lucide-react";

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
      "O CPF informado é conferido antes de salvar. O sistema avisa se estiver inválido ou se já pertencer a outro colaborador.",
      "Abra o ícone de olho para consultar a ficha, anexar documentos, visualizar anexos e conferir eletrônicos vinculados.",
      "Na ficha, clique na foto do colaborador para ampliá-la. Use Enviar foto ou Trocar foto para atualizar a imagem.",
      "Na ficha, use Exportar ficha PDF para gerar um documento individual com os dados, observações, eletrônicos e relação de documentos anexados.",
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
      "Na ficha do colaborador, abra a aba Eletrônicos e clique em Cadastrar para adicionar manualmente o tipo, descrição, modelo, IMEI, número de série, acessórios, justificativa e demais informações.",
      "O SPGuard bloqueia IMEI, número de série ou número de patrimônio/selo que já estejam vinculados a outro colaborador.",
      "Se quiser guardar o formulário de autorização, anexe o PDF normalmente na aba Documentos da ficha. O arquivo ficará vinculado ao colaborador, mas seus dados não serão preenchidos automaticamente.",
      "Use o ícone de autorização para alternar entre Autorizado e Revogado. Revogar não exclui os dispositivos.",
      "Use a lixeira para escolher um ou mais dispositivos específicos que devem ser removidos; eles podem ser restaurados por 15 dias.",
      "Clique em Exportar PDF para criar um relatório somente com os colaboradores filtrados na tela.",
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
  {
    icon: ShieldAlert,
    titulo: "Ocorrências e Apurações",
    descricao:
      "Registre fatos, pessoas vinculadas e evidências em uma área local protegida por senha exclusiva.",
    passos: [
      "Abra Ocorrências e Apurações no menu. Na primeira utilização, crie uma senha de pelo menos 12 caracteres e uma palavra de recuperação de 7 a 16 caracteres. Elas não criam login para o restante do SPGuard.",
      "Os registros, fotos e evidências são criptografados antes de serem gravados no computador. A senha e a palavra de recuperação não são guardadas em texto; mantenha-as separadas e em local seguro.",
      "Clique em Nova ocorrência e informe protocolo, data, local, área, setor, ponto de referência, coordenadas opcionais, categoria, relato factual e encaminhamentos. Use termos objetivos e registre fatos observados.",
      "Na ficha da ocorrência, vincule uma ou mais pessoas, identifique o tipo de vínculo e inclua a foto quando necessário. Clique na foto para ampliá-la e use o ícone de lápis para editar os dados dessa pessoa.",
      "Anexe imagens, PDFs e outros arquivos como evidência. Imagens e PDFs podem ser visualizados dentro do SPGuard; use o ícone de lixeira para excluir um arquivo após confirmar a ação.",
      "Use o status Em análise, Encaminhada, Encerrada ou Arquivada. Arquivar preserva o registro, apenas o remove da lista ativa; escolha Arquivadas ou Todas no filtro para encontrá-lo e reabri-lo.",
      "Use Exportar PDF para gerar a ficha da ocorrência. Antes de gerar, escolha se deseja incluir fotos das pessoas e/ou imagens de evidências; documentos não visuais continuam relacionados no PDF.",
      "Os gráficos mostram somente contagens de ocorrências por categoria e situação.",
      "Se esquecer a senha, use Esqueci minha senha na tela de acesso ou Alterar senha dentro da aba. Informe a palavra de recuperação e defina uma nova senha: os registros e anexos serão preservados.",
    ],
  },
];

const configuracoes: Guia[] = [
  {
    icon: Database,
    titulo: "Armazenamento local dos dados em planilha .xlsx",
    descricao:
      "Cria ou restaura uma cópia dos dados cadastrais em Excel na mesma área de Configurações.",
    passos: [
      "Abra Configurações pelo ícone de engrenagem no canto superior direito.",
      "Clique em Selecionar pasta e escolha uma pasta de sua preferência no computador ou em um disco externo.",
      "Clique em Salvar dados agora. O SPGuard cria a pasta SPGuard e o arquivo spguard-dados.xlsx.",
      "Na mesma caixa, use Restaurar da pasta para recuperar o arquivo salvo na pasta escolhida ou Escolher arquivo para selecionar outro spguard-dados.xlsx.",
      "Esse arquivo contém empresas, colaboradores, observações, eletrônicos, histórico, itens da lixeira e os registros protegidos de Ocorrências e Apurações; ele não inclui documentos ou evidências anexadas.",
    ],
  },
  {
    icon: Save,
    titulo: "Backup completo com documentos",
    descricao:
      "É a cópia mais completa do sistema e a mais indicada antes de atualizações importantes.",
    passos: [
      "Depois de selecionar a pasta, clique em Criar backup completo (.zip).",
      "O arquivo spguard-backup-completo.zip reúne os dados em planilha, histórico, itens da lixeira, documentos das fichas e os arquivos cifrados de Ocorrências e Apurações.",
      "Os documentos são organizados em subpastas pelo nome de cada colaborador.",
      "Guarde esse ZIP em local seguro, como um pendrive ou disco externo. Ele é criado localmente e não é enviado ao GitHub ou à nuvem pelo SPGuard.",
    ],
  },
  {
    icon: FileKey,
    titulo: "Backup criptografado com senha",
    descricao:
      "Protege o backup completo contra a leitura por pessoas que tenham acesso à pasta ou ao arquivo.",
    passos: [
      "Clique em Criar backup com senha. Uma janela do próprio SPGuard solicitará uma senha de pelo menos 12 caracteres.",
      "Confirme a mesma senha nessa janela. O SPGuard cria o arquivo spguard-backup-criptografado.spguard com dados e documentos protegidos.",
      "A senha é usada apenas nesse backup; ela não cria login para usar o SPGuard e não é armazenada pelo sistema.",
      "Para restaurar, clique em Restaurar backup com senha, escolha o arquivo, informe a senha na janela exibida e confirme a operação.",
      "Guarde a senha em local seguro. Se ela for esquecida, o backup não poderá ser recuperado.",
    ],
  },
  {
    icon: FileSpreadsheet,
    titulo: "Planilha de entrada manual",
    descricao:
      "Permite cadastrar ou atualizar muitos colaboradores e eletrônicos por uma única planilha.",
    passos: [
      "Clique em Criar planilha de entrada para gerar spguard-eletronicos.xlsx na pasta SPGuard.",
      "Preencha as abas Colaboradores e Eletronicos sem alterar os nomes das colunas.",
      "Use Validar planilha para conferir erros antes de gravar qualquer alteração.",
      "Quando a validação estiver correta, clique em Atualizar agora. Registros existentes podem ser atualizados pelo CPF, matrícula ou identificadores do eletrônico.",
      "A atualização automática pode ser ativada nessa mesma área; ainda assim, é recomendável manter um backup antes de mudanças grandes.",
    ],
  },
  {
    icon: RefreshCw,
    titulo: "Sincronização local entre notebooks",
    descricao:
      "Compartilha alterações pela pasta interna da Segurança, sem internet, nuvem ou instalação de serviço no servidor da empresa.",
    passos: [
      "Nos notebooks que usarão o SPGuard, abra Configurações e selecione exatamente a mesma pasta compartilhada da Segurança.",
      "No primeiro notebook, clique em Sincronizar agora. O SPGuard cria a pasta SPGuard/rede-local e envia uma cópia inicial dos registros e arquivos anexados.",
      "Nos outros notebooks, selecione a mesma pasta e clique em Sincronizar agora para receber os dados. Os notebooks continuam funcionando fora da empresa com sua cópia local.",
      "Ao retornar à rede da empresa, clique em Sincronizar agora ou ative Atualizar ao abrir. A sincronização só ocorre quando a pasta compartilhada estiver acessível.",
      "Não é necessário e não é recomendado colocar o arquivo database.sqlite3 na pasta de rede. O SPGuard troca apenas alterações e arquivos necessários.",
      "Alterações feitas em campos diferentes do mesmo cadastro são unidas automaticamente. Por exemplo, um notebook pode atualizar o telefone enquanto outro acrescenta uma observação.",
      "Quando duas pessoas escrevem observações diferentes, as duas anotações são preservadas. O SPGuard pede uma decisão somente se o mesmo campo receber valores diferentes ou se houver exclusão em um dos notebooks.",
      "Em uma divergência, abra Configurações e escolha a versão deste notebook ou a versão da rede. Nenhuma versão é sobrescrita sem aviso.",
      "Mantenha o backup completo periódico: sincronização não substitui backup.",
    ],
  },
];

function GuiaCard({ guia }: { guia: Guia }) {
  const Icon = guia.icon;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" /> {guia.titulo}
        </CardTitle>
        <p className="text-sm font-normal text-muted-foreground">{guia.descricao}</p>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {guia.passos.map((passo, index) => (
            <li key={passo} className="flex gap-3 text-sm">
              <Badge className="h-6 w-6 shrink-0 rounded-full grid place-items-center p-0">
                {index + 1}
              </Badge>
              <span className="pt-1">{passo}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Ajuda() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CircleHelp className="h-6 w-6 text-primary" /> Ajuda
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Guia rápido para usar o SPGuard e preservar seus dados com segurança.
        </p>
      </div>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Operações do dia a dia</h2>
        <div className="grid gap-4">
          {guias.map((guia) => (
            <GuiaCard key={guia.titulo} guia={guia} />
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" /> Configurações e backups
        </h2>
        <div className="grid gap-4">
          {configuracoes.map((guia) => (
            <GuiaCard key={guia.titulo} guia={guia} />
          ))}
        </div>
      </section>
    </div>
  );
}
