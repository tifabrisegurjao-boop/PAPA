# PROJETO PAPA — Controle de Processos (MVP, Fabris & Gurjão)

Sistema web **provisório** para consultar clientes e processos com o mínimo de cliques: *olhar, visualizar e clicar* (Dra. Renata).
Origem: *Relatório de Evolução do Projeto e Definição do MVP*, de 10/09/2026. O BI saiu do escopo e o foco passou a ser um ambiente simples inspirado no SEI.

> Fica numa pasta separada da Legal Suite (`../Fabris-Gurjao`) até o funcionamento se consolidar. Stack e login foram escolhidos para facilitar a integração depois, como `/processos/`.

## Como funciona (desde 14/09/2026: o painel é o banco)
```
planilha v2 ──npm run dados──▶ dados/real/base.json ──npm run dados:firestore──▶ Firestore (papa-85025) ◀──▶ painel (lê em tempo real, edita com lápis)
                              (fora do git)                                       papaClientes / papaProcessos      "Cadastrar cliente", "Novo processo"
demo (build:demo) ──▶ dados/base.json (fictícia) em memória: edições ficam só na aba
```
O navegador não consegue gravar dentro do arquivo do OneDrive, então a decisão (painel de 3 arquiteturas, 14/09/2026 — ver nota no vault) foi
inverter: **o painel vira o cofre** (Firestore, projeto próprio `papa-85025` desde 29/09/2026) e **a planilha é entrada e saída** dele. `src/lib/repositorio.ts`
define a interface; `repositorioFirestore.ts` grava em transação com `versao` (recusa sobrescrever o que outra pessoa salvou) e guarda o estado
anterior em `historico/`; `repositorioMemoria` (demo/`?semLogin`) guarda só na aba.

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Local | Projeto separado | Isola o provisório da suíte em produção |
| Stack | React + TypeScript + Vite + Tailwind | Mesma do Nexus: a integração futura é copiar a pasta e adicionar uma entrada no `vite.config.ts` |
| Dados | Planilha v2 → JSON (`npm run dados`) → Firestore (`npm run dados:firestore`) | Modelo em `planilha/modelo.json`, único lugar que define colunas e menus; tetos de tamanho em `src/lib/limites.mjs`, iguais aos de `firestore.rules` |
| Login e banco | Projeto Firebase próprio `papa-85025` (29/09/2026; antes: dentro do projeto do Nexus, `pagamento-255fc`) | Isolamento: regras e cargas do PAPA não arriscam o Nexus nem o Financeiro, e a cota gratuita é só dele. Custo aceito: conta separada por pessoa |
| Nº do cliente | Coluna opcional na planilha; o sistema **ainda não** usa | Ligação com o Nexus prevista para depois. A busca já normaliza nomes com a mesma regra do Nexus; a reimportação já casa cliente por esse nº |
| Rotas | Hash (`#/`, `#/cliente/<id>`) | Funciona em hospedagem estática sem configurar o servidor |
| Datas | `AAAA-MM-DD[THH:mm]` sem fuso, formatadas pelo texto | Evita deslocar dia/hora num navegador fora de Porto Velho |
| Repositório | Público no GitHub (`tifabrisegurjao-boop/PAPA`) | Só a base **fictícia** é versionada; planilha real, `dados/real/` e `.env` ficam no `.gitignore` |

## Telas
1. **Controle de Processos** (`ListaClientes`): colunas Pessoa física / Pessoa jurídica com contagem, **15 clientes por página** em cada coluna (`src/lib/paginacao.ts`; a página é lembrada ao abrir um cliente e voltar, e volta à 1 quando a busca muda). **Busca híbrida** num campo só: por nome (sem acento/caixa) ou por nº do processo (4+ dígitos, com ou sem pontuação) — por número aparece o bloco "Processos encontrados", que abre o painel já no processo. **Cliente em vermelho** = tem processo com acesso externo expirado (etiqueta "N sem acesso"). Cliente sem PF/PJ na planilha aparece em "Sem classificação". Avisos do conversor aparecem num bloco expansível.
2. **Painel do Cliente** (`PainelCliente`): árvore com processos principais (pasta **ouro, cheia**) e desdobramentos (pasta **azul, cheia**), ramos que **recolhem/expandem** (seta; "Recolher tudo"), nº em **vermelho** + cadeado quando o acesso expirou, **lápis** em cada processo; órgão como etiqueta pequena no canto; nº do Nexus e **natureza do processo selecionado** embaixo do nome; cartões em duas colunas iguais (Processo | Pasta, Tipo | Status); cartões em pastéis por informação — **Processo** (o único atalho para o SEI/sistema de origem: clicar no cartão abre o processo e ele mostra o prazo do acesso), **Pasta no OneDrive** (clicável, com o nº do Nexus), Tipo e Status; "Histórico / Situação atual" com o objeto na primeira linha; última movimentação; "Editar este processo", "Novo processo" e "+ desdobramento de …". Sem botão "Ver andamento" (decisão de 14/09/2026: o cartão do processo já faz isso). "Visualizar Peças" e "Enviar Comunicação" seguem fora até a decisão do escopo.
   **Voltar à lista:** em tela larga (≥ 1480 px) é um botão na margem em branco à esquerda da árvore, que acompanha a rolagem; em telas menores fica no alto da coluna da árvore (pedido de 29/09/2026).
3. **Formulários** (`FormularioProcesso`, `FormularioCliente`, campos em `Campos.tsx`): as linhas da planilha, seção por seção, com os mesmos menus da aba Listas (`src/lib/listas.ts` lê `planilha/modelo.json`), validação (nº obrigatório e único, origem só do mesmo cliente, links https, **tamanho máximo de cada texto = o das regras do banco**, via `src/lib/limites.mjs`) e a mensagem "outra pessoa salvou antes" quando o banco recusa por versão.

4. **Excluir e Lixeira** (desde 29/09/2026; regras em `src/lib/exclusao.ts`, testadas): no lápis do cliente ou do processo, "Excluir" pede confirmação e manda o registro para a **Lixeira** no fim da tela inicial, de onde **Restaurar** traz de volta. É **exclusão lógica**: o documento ganha `excluidoEm`/`excluidoPor` (as regras exigem o carimbo do servidor e o e-mail de quem excluiu), some das telas e da busca, e continua no banco com o `historico` — errar na exclusão também tem volta. Bloqueios: cliente com processo ativo e processo com desdobramento ativo não são excluídos (exclua os de baixo antes); restaurar é recusado se o nome/nº já estiver em uso por um ativo ou se o cliente/origem ainda estiver na lixeira. Cadastro novo nunca reusa o id de um excluído. O importador não reimporta nem ressuscita o que está na lixeira (nem com `--forcar`) — avisa. Apagar de verdade continua sendo só pelo Console.

**Acesso expirado** (`src/lib/acesso.ts`) é calculado na hora de exibir, pela data TÉRMINO DO ACESSO da planilha: a data manda; a coluna SITUAÇÃO DO ACESSO só vale quando não há data. Por isso o vermelho aparece no dia do vencimento sem regerar a base.

## Identidade visual
Baseada nos arquivos de marca do escritório (logotipo, mockups, papel de parede): petróleo `#173a4c` (escala `fg-*`) e ouro-areia `#d1cda9` (`ouro-*`), medidos nos pixels do logotipo; Roboto Slab para títulos (a slab serif mais próxima do wordmark) e Inter para texto (mesma da Legal Suite), via Google Fonts. Assets em `public/brand/`: `monograma.png`, `logo.png`, `favicon.png`, `fundo-login.jpg`. A Legal Suite usa navy `#08162e` / ouro `#c5a059` (`ouro-500` aqui) — unificar na integração.

## Banco (Firestore) — ativação em produção, passo a passo
Desde 29/09/2026 o PAPA tem **projeto Firebase próprio: `papa-85025`** ("PAPA" no Console; configuração em `src/lib/firebaseConfig.mjs`, onde o app web "Projeto PAPA" já está registrado). Até 28/09 o plano era morar dentro do projeto do Nexus (`pagamento-255fc`), com o mesmo login. A troca isola o sistema: publicar regras ou carregar a planilha nunca mexe no Nexus nem no Financeiro, e a cota gratuita diária é só do PAPA. O custo: **cada pessoa precisa de uma conta própria no PAPA** (e-mail e senha criados no Console — não é o login do Nexus). Quem faz os passos abaixo precisa ser **Owner/Editor** do projeto.

**Pré-requisitos no computador** (uma vez): Node.js LTS instalado pelo instalador de [nodejs.org](https://nodejs.org) (marque a opção de adicionar ao PATH; depois **feche e abra o terminal** — no terminal de dentro do app do Claude, feche e abra o app) — confira com `node -v`; nesta pasta, `npm install`. O `firebase` de linha de comando vem por `npx firebase-tools` (o `.npmrc` do projeto fixa o registro oficial do npm). Para ver quem está conectado: `npx firebase-tools login:list`; só se ninguém com acesso ao `papa-85025` aparecer, `npm run firebase:login`.

1. **Criar o banco:** Console › projeto **PAPA** › Build › **Firestore Database** › *Create database* → edição Standard, local **`southamerica-east1` (São Paulo)** — não dá para mudar depois — e **modo de produção**. Anote a região no inventário LGPD.
2. **Ligar o login:** Build › **Authentication** › *Get started* › *Sign-in method* › **Email/Password** › ative só a primeira opção (não "Email link") › *Save*. Em **Users › Add user**, crie a conta de cada pessoa (e-mail + senha provisória).
3. **Cadastro fechado:** Authentication › **Settings › User actions**: desmarque **Enable create (sign-up)** e deixe **Email enumeration protection** ligada. Contas novas só pelo Console.
4. **Equipe:** Firestore › *Start collection* **`papaEquipe`** › um documento por pessoa com **id = e-mail de login, todo em minúsculas, sem espaços** (copie da coluna *Identifier* em Authentication › Users); conteúdo: um campo `nome`. Só quem está nessa lista lê e grava — ter conta não basta, porque a apiKey é pública. Errou uma letra no id? A pessoa vê "Sem permissão para ler o banco como fulano@…" com o id exato que falta.
5. **Regras:**
   ```bash
   npm run regras             # = npx firebase-tools deploy --only firestore:rules --project papa-85025
   ```
   `firestore.rules` só tem o PAPA — `papaEquipe`, `papaClientes`, `papaProcessos` (com `historico`) —: sem delete, campos e tamanhos validados (`src/lib/limites.mjs` é o espelho deles; `tests/importacao.test.ts` confere que batem); todo o resto é negado. Os nomes com prefixo "papa" ficaram do plano antigo; mantê-los evita migrar dado.
6. **Teste de fumaça** (antes de qualquer dado real): `npm run dev` → `http://localhost:5173` → entrar com uma conta da `papaEquipe`. Deve aparecer a lista **vazia** (sem "Sem permissão…"), o rodapé com `Base: Firestore (papa-85025)`, e "Cadastrar cliente" deve gravar um cliente de teste que aparece no Console em `papaClientes` com `versao: 1` e `atualizadoPor` = seu e-mail. Uma conta **fora** da `papaEquipe` deve ver a mensagem de permissão (não uma lista vazia).
7. **Carga da planilha real:** a planilha (modelo v2) fica **fora desta pasta** (OneDrive do escritório); o JSON gerado vai para `dados/real/`, que o git ignora:
   ```bash
   npm run dados -- "C:\caminho\Controle_de_Processos.xlsx"      # gera dados/real/base.json e lista os avisos
   npm run dados:firestore -- dados/real/base.json                 # pede login, mostra o PLANO e só grava depois de você digitar SIM
   ```
   O importador recusa base de demonstração (`dados/base.json` é fictícia e, como nada é apagado pelo sistema, não pode entrar no banco real), valida cada documento contra os limites das regras **antes** de gravar (aponta id e campo), casa cliente por id → nº do Nexus → nome e processo por id/nº dentro do mesmo cliente, aponta o desdobramento para o id que o pai tem no banco, e **não regrava** o que já está igual. Regras em `scripts/lib/importacao.mjs` (testadas).
8. **Reimportar depois** (planilha atualizada): mesmos dois comandos. A **linha da planilha é o registro**: célula apagada apaga o campo no banco. Registro **editado pela tela** é pulado com aviso — só é sobrescrito com `--forcar`, e aí o estado anterior vai para `historico/`. Linha que sumiu da planilha **continua no banco** (exclusão é pendência). Nome de cliente corrigido na planilha sem nº do Nexus vira cliente novo (o importador avisa "provável renomeação"): para renomear sem duplicar, corrija pela tela ou dê o mesmo nº do Nexus. Ninguém deve salvar pela tela enquanto a importação roda.
9. **Se algo entrou errado:** pela tela, **Excluir** (no lápis) manda o registro para a Lixeira — some das telas e pode ser restaurado; ver "Excluir e Lixeira" em Telas. Apagar de verdade é só no Console (Firestore › documento › ⋮ › Delete, ou *Delete collection* para começar de novo). Toda gravação por cima guarda o anterior em `historico/` do próprio documento. Backup: o plano Spark não tem exportação automática — enquanto não houver rotina, a planilha continua sendo a cópia de segurança do que foi importado.
10. **Domínios:** para login por e-mail/senha o Firebase **não** exige listar o domínio (Authorized domains só vale para Google/OAuth e link por e-mail). Se, no site publicado, o login falhar com `requests-from-referer-…-are-blocked`, é restrição de referrer da chave de API em Google Cloud › APIs e serviços › Credenciais — acrescente o domínio lá.

## Demo no GitHub Pages
A demonstração pública (https://tifabrisegurjao-boop.github.io/PAPA/) vem do branch **`demo`** (congelado em 28/09/2026 como o MVP apresentado à chefia; tag `demo-mvp-v1`). `.github/workflows/pages.yml` dispara em push na `main` (ou à mão), faz **checkout do `demo`**, `build:demo` e publica — assim a `main` evolui para a produção sem mudar o que a chefia vê. Para atualizar a demo: leve a mudança ao `demo` (merge/cherry-pick) e `git push origin demo main`. O branch `demo` precisa existir no GitHub (o workflow avisa se não existir). **Em Settings › Pages › Build and deployment, a fonte tem de ser "GitHub Actions"** — em "Deploy from a branch" o GitHub publica o código-fonte cru por cima do build e a página fica só com "Carregando o Projeto PAPA…".

## Planilha (modelo v2)
- `planilha/modelo.json` — colunas, ajuda de cada coluna e valores dos menus. **Fonte única**: o gerador e o conversor leem daqui.
- `planilha/gerar_planilha.py` — gera o modelo vazio, o exemplo fictício e **migra a planilha antiga** (`Planilha1`) para o modelo novo, sem copiar senhas e anotando na coluna PENDÊNCIA tudo que não pôde decidir sozinho.
- `planilha/Modelo_Controle_de_Processos_v2.xlsx` — modelo para o escritório (aba Manual explica cada coluna).
- `planilha/exemplo/Controle_de_Processos_EXEMPLO.xlsx` — base pequena e fictícia (8 clientes) para demonstração.
- `scripts/converter.mjs` — planilha → JSON (`npm run dados`), gravado por padrão em **`dados/real/base.json`** (pasta ignorada pelo git: o repositório é público). Mapeia colunas pelo título, não pela posição; nada some: problema vira aviso; emite `observacao`, `ordem` e todos os campos de acesso (pedido, SEI GERAL, término, renovação, situação). **Regra provisória (11/09/2026):** processo sem SITUAÇÃO ATUAL mostra a OBSERVAÇÃO no painel (marcado na tela).
- `dados/base.json` (rastreado) é a base **fictícia** da demo: servida só pelo `npm run dev` e embutida só no `build:demo` (plugin em `vite.config.ts`); o build de produção não leva base nenhuma. Está **commitada de propósito** (decisão de 14/09/2026): 73 clientes / 438 processos para testes em escala. Para regerá-la é preciso passar o caminho explicitamente: `npm run dados:exemplo` (base pequena) ou `npm run dados -- planilha_migrada.xlsx dados/base.json` → `npm run dados:links-exemplo` (links `https://onedrive.live.com/` só para o cartão ficar clicável) → `npm run dados:enriquecer-demo` (pastas cheias, 259 → 438 processos, determinístico). Tudo inventado — **nunca** rodar `links-exemplo`/`enriquecer-demo` numa base real; o importador reconhece essas marcas e recusa.

```bash
python planilha/gerar_planilha.py modelo
python planilha/gerar_planilha.py exemplo
python planilha/gerar_planilha.py migrar "antiga.xlsx" "nova_v2.xlsx"
npm run dados -- "caminho/da/planilha.xlsx"        # grava dados/real/base.json (fora do git)
npm run dados:exemplo                              # regrava dados/base.json com a base pequena de demonstração
```

## Estrutura
```
src/
  tipos.ts               modelo de dados (= saída do converter)
  lib/arvore.ts          árvore principal → derivados/relacionados (regra pura, testada)
  lib/busca.ts           busca por nome/nº (regra pura, testada)
  lib/formatacao.ts      data/hora e prazo sem deslocar fuso (testado)
  lib/limites.mjs        campos e tetos de tamanho do banco (= firestore.rules); usado pelos formulários e pelo importador
  lib/dados.ts           carrega o JSON estático (demo / npm run dev sem login)
  lib/repositorio.ts     interface do banco + implementação em memória
  lib/repositorioFirestore.ts  Firestore: tempo real, transação com versao, historico, erros em português (import() dinâmico: a demo não leva)
  lib/ids.ts             ids determinísticos (mesma regra do conversor)
  lib/listas.ts          menus dos formulários = aba Listas (modelo.json)
  lib/autenticacao.ts    login (import() dinâmico: a demo não leva o Firebase)
  lib/firebase.ts        app do Firebase
  components/            Login, Cabecalho, ListaClientes, PainelCliente, ArvoreProcessos, CartaoInfo, formulários
planilha/                modelo.json, gerador (Python/openpyxl), modelo e exemplo .xlsx
scripts/converter.mjs    planilha → JSON (SheetJS)
scripts/lib/importacao.mjs  regras puras da carga no Firestore (plano, casamento, validação) — testadas
scripts/enviar-firestore.mjs  carga no Firestore: login, plano, confirmação, lotes
dados/base.json          base FICTÍCIA (dev e demo); dados/real/ = saída da planilha real (ignorada pelo git)
tests/                   regras.test.ts (telas) e importacao.test.ts (importação + regras ↔ limites), node --test
```

## Como rodar
```bash
npm install
npm run dev      # http://localhost:5173 — entrar com uma conta do PAPA que esteja na papaEquipe
npm test
npm run build    # gera dist/ (produção: sem base em JSON; lê o Firestore)
```
Para mexer no visual sem senha: `http://localhost:5173/?semLogin` — só existe no servidor de desenvolvimento (`import.meta.env.DEV`), não vai para o build. Também só no dev: com `VITE_BANCO=json` (no PowerShell: `$env:VITE_BANCO='json'; npm run dev`, ou a linha `VITE_BANCO=json` num `.env.local`, que o git ignora) o sistema pede login mas lê `dados/base.json` em vez do Firestore.

**Demonstração sem login:** `npm run build:demo` gera `dist-demo/` com `VITE_DEMO=1` (ver `.env.demo`) — a tela abre direto, com o selo "demonstração". Serve para mostrar o sistema por link com a base fictícia; **nunca** publicar essa versão com dado real.

> **OneDrive segura o `dist/`.** Logo após o build, o cliente de sincronização mantém os arquivos abertos: o esvaziamento do Vite e o `fs.rm` do Node "apagam" sem apagar. Por isso `npm run build` roda `scripts/limpar-dist.mjs` no fim: confere `dist/assets` contra o `index.html`, tenta de novo e **avisa** se sobrou bundle antigo. Antes de publicar, olhe esse aviso (ou gere fora do OneDrive — PowerShell: `npx vite build --outDir "$env:LOCALAPPDATA\papa-dist"`; cmd: `npx vite build --outDir %LOCALAPPDATA%\papa-dist`).

## Pendências
- [ ] **Backup do Firestore** (Spark não tem exportação automática): rotina de exportação, ou manter a planilha como cópia do importado até lá.
- [ ] **Importar / Baixar planilha pelo painel** (prévia campo a campo antes de gravar; exportação .xlsx com os títulos de `modelo.json`) — por enquanto a entrada é `npm run dados` + `npm run dados:firestore`.
- [x] ~~**Excluir processo/cliente** (exclusão lógica com `excluidoEm`)~~ — feito em 29/09/2026 (Lixeira na tela inicial). Linha que some da planilha continua no banco até alguém excluí-la pela tela.
- [ ] No celular, o painel de alguns clientes fica ~40 px mais largo que a tela (o nº longo no cartão do processo não quebra); já era assim antes — ajustar quando mexer no layout móvel.
- [ ] Validar com a Dra. Renata os valores dos menus **Tipo, Natureza e Status** (aba Listas) e a distinção **Derivado × Relacionado**.
- [ ] Revisar a coluna **PENDÊNCIA** da planilha migrada (39 processos) e preencher ÚLT. MOVIMENTAÇÃO, que a planilha antiga não tinha. SITUAÇÃO ATUAL pode esperar: a OBSERVAÇÃO cobre por enquanto.
- [ ] Botões **Visualizar Peças / Enviar Comunicação**: decidir se ficam.
- [ ] Ligação com o **nº do cliente do Nexus** (coluna já existe na planilha; a importação já casa por ele).
- [ ] Quem mantém os **links** da pasta (URL compartilhada do OneDrive) e do acesso externo.
- [ ] Integração na Legal Suite (`../Fabris-Gurjao`, entrada `/processos/`, cartão no portal, deploy no Hostinger) e unificação da paleta.

## Critério de pronto (relatório, item 10)
Localizar um cliente, abrir o painel, distinguir processos principais de desdobramentos, ver a situação atual e acessar os links externos, tudo com a base fictícia.
