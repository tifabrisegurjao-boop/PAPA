# PROJETO PAPA — Controle de Processos (MVP, Fabris & Gurjão)

Sistema web **provisório** para consultar clientes e processos com o mínimo de cliques: *olhar, visualizar e clicar* (Dra. Renata).
Origem: *Relatório de Evolução do Projeto e Definição do MVP*, de 10/09/2026. O BI saiu do escopo e o foco passou a ser um ambiente simples inspirado no SEI.

> Fica numa pasta separada da Legal Suite (`../Fabris-Gurjao`) até o funcionamento se consolidar. Stack e login foram escolhidos para facilitar a integração depois, como `/processos/`.

## Como funciona (desde 14/09/2026: o painel é o banco)
```
planilha v2 ──npm run dados──▶ base.json ──npm run dados:firestore──▶ Firestore (pagamento-255fc) ◀──▶ painel (lê em tempo real, edita com lápis)
                                                                        papaClientes / papaProcessos      "Cadastrar cliente", "Novo processo"
demo (build:demo) ──▶ base.json em memória: edições ficam só na aba
```
O navegador não consegue gravar dentro do arquivo do OneDrive, então a decisão (painel de 3 arquiteturas, 14/09/2026 — ver nota no vault) foi
inverter: **o painel vira o cofre** (Firestore, mesmo projeto e login do Nexus) e **a planilha é entrada e saída** dele. `src/lib/repositorio.ts`
define a interface; `repositorioFirestore.ts` grava em transação com `versao` (recusa sobrescrever o que outra pessoa salvou) e guarda o estado
anterior em `historico/`; `repositorioMemoria` (demo/`?semLogin`) guarda só na aba.

## Decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Local | Projeto separado | Isola o provisório da suíte em produção |
| Stack | React + TypeScript + Vite + Tailwind | Mesma do Nexus: a integração futura é copiar a pasta e adicionar uma entrada no `vite.config.ts` |
| Dados | Planilha v2 → `public/dados/base.json` | Definido no relatório (item 6). Modelo em `planilha/modelo.json`, único lugar que define colunas e menus |
| Login | Firebase Auth do Nexus (`pagamento-255fc`) | Mesmo acesso da equipe e sistema nascendo protegido |
| Nº do cliente | Coluna opcional na planilha; o sistema **ainda não** usa | Ligação com o Nexus prevista para depois. A busca já normaliza nomes com a mesma regra do Nexus |
| Rotas | Hash (`#/`, `#/cliente/<id>`) | Funciona em hospedagem estática sem configurar o servidor |
| Datas | `AAAA-MM-DD[THH:mm]` sem fuso, formatadas pelo texto | Evita deslocar dia/hora num navegador fora de Porto Velho |

## Telas
1. **Controle de Processos** (`ListaClientes`): colunas Pessoa física / Pessoa jurídica com contagem. **Busca híbrida** num campo só: por nome (sem acento/caixa) ou por nº do processo (4+ dígitos, com ou sem pontuação) — por número aparece o bloco "Processos encontrados", que abre o painel já no processo. **Cliente em vermelho** = tem processo com acesso externo expirado (etiqueta "N sem acesso"). Cliente sem PF/PJ na planilha aparece em "Sem classificação". Avisos do conversor aparecem num bloco expansível.
2. **Painel do Cliente** (`PainelCliente`): árvore com processos principais (pasta **ouro, cheia**) e desdobramentos (pasta **azul, cheia**), ramos que **recolhem/expandem** (seta; "Recolher tudo"), nº em **vermelho** + cadeado quando o acesso expirou, **lápis** em cada processo; órgão como etiqueta pequena no canto; cartões em pastéis por informação — **Processo** (clicável: abre no SEI/sistema de origem, mostra o prazo do acesso), **Pasta no OneDrive** (clicável), Tipo, Natureza, Status; "Histórico / Situação atual" com o objeto na primeira linha; última movimentação; "Ver Andamento ↗", "Editar este processo", "Novo processo" e "+ desdobramento de …". "Visualizar Peças" e "Enviar Comunicação" seguem fora até a decisão do escopo.
3. **Formulários** (`FormularioProcesso`, `FormularioCliente`, campos em `Campos.tsx`): as linhas da planilha, seção por seção, com os mesmos menus da aba Listas (`src/lib/listas.ts` lê `planilha/modelo.json`), validação (nº obrigatório e único, origem só do mesmo cliente, links https) e a mensagem "outra pessoa salvou antes" quando o banco recusa por versão.

**Acesso expirado** (`src/lib/acesso.ts`) é calculado na hora de exibir, pela data TÉRMINO DO ACESSO da planilha: a data manda; a coluna SITUAÇÃO DO ACESSO só vale quando não há data. Por isso o vermelho aparece no dia do vencimento sem regerar a base.

## Identidade visual
Baseada nos arquivos de marca do escritório (logotipo, mockups, papel de parede): petróleo `#173a4c` (escala `fg-*`) e ouro-areia `#d1cda9` (`ouro-*`), medidos nos pixels do logotipo; Roboto Slab para títulos (a slab serif mais próxima do wordmark) e Inter para texto (mesma da Legal Suite), via Google Fonts. Assets em `public/brand/`: `monograma.png`, `logo.png`, `favicon.png`, `fundo-login.jpg`. A Legal Suite usa navy `#08162e` / ouro `#c5a059` (`ouro-500` aqui) — unificar na integração.

## Banco (Firestore) — passos únicos de ativação
1. **Equipe:** no Console do Firebase (projeto `pagamento-255fc` › Firestore), crie a coleção `papaEquipe` com um documento por pessoa, **id = e-mail de login** (conteúdo pode ser `{ nome: "…" }`). Só quem está nessa lista lê e grava o PAPA — estar logado não basta, porque a apiKey é pública. Em Authentication › Sign-in method, deixe o **cadastro de novas contas desligado**.
2. **Regras:** `firestore.rules` desta pasta inclui `clients`/`cases` do Nexus (intactas) + `papaEquipe`, `papaClientes`, `papaProcessos` (com `historico`), sem delete e com validação de campos. `firebase.json`/`.firebaserc` apontam para ele. Publique **desta pasta** (nunca da Fabris-Gurjao, cujo `firebase.json` aponta para as regras do Financeiro):
   ```bash
   npm run regras
   ```
   (`firebase deploy --only firestore:rules --project pagamento-255fc`). `Fabris-Gurjao/firestore.nexus.rules` é cópia idêntica — mantenha igual ou apague.
3. **Carga inicial:** pede e-mail e senha de alguém da equipe; casa por id e por nº/nome; **não sobrescreve** o que foi editado no painel (só com `--forcar`, guardando o anterior em `historico`); nunca apaga:
   ```bash
   npm run dados:firestore -- dados/base.json
   ```
4. Em Authentication › Settings › **Authorized domains**, o domínio do site precisa estar listado, senão o login falha sem erro claro.

## Planilha (modelo v2)
- `planilha/modelo.json` — colunas, ajuda de cada coluna e valores dos menus. **Fonte única**: o gerador e o conversor leem daqui.
- `planilha/gerar_planilha.py` — gera o modelo vazio, o exemplo fictício e **migra a planilha antiga** (`Planilha1`) para o modelo novo, sem copiar senhas e anotando na coluna PENDÊNCIA tudo que não pôde decidir sozinho.
- `planilha/Modelo_Controle_de_Processos_v2.xlsx` — modelo para o escritório (aba Manual explica cada coluna).
- `planilha/exemplo/Controle_de_Processos_EXEMPLO.xlsx` — base pequena e fictícia (8 clientes) para demonstração.
- `scripts/converter.mjs` — planilha → JSON (`npm run dados`), gravado em **`dados/base.json`** (fora de `public/`: um arquivo em `public/` entraria em todo build e seria baixável sem login). Mapeia colunas pelo título, não pela posição; nada some: problema vira aviso; emite `observacao`, `ordem` e todos os campos de acesso (pedido, SEI GERAL, término, renovação, situação). **Regra provisória (11/09/2026):** processo sem SITUAÇÃO ATUAL mostra a OBSERVAÇÃO no painel (marcado na tela).
- `dados/base.json` é servido só pelo `npm run dev` e embutido só no `build:demo` (plugin em `vite.config.ts`); o build de produção não leva base nenhuma. O atual veio da planilha antiga migrada (`Controle_de_Processos_v2_MIGRADO.xlsx`, 73 clientes / 259 processos, dados fictícios segundo o escritório).

```bash
python planilha/gerar_planilha.py modelo
python planilha/gerar_planilha.py exemplo
python planilha/gerar_planilha.py migrar "antiga.xlsx" "nova_v2.xlsx"
npm run dados -- "caminho/da/planilha.xlsx"        # grava dados/base.json
npm run dados:exemplo                              # volta para a base pequena de demonstração
```

## Estrutura
```
src/
  tipos.ts               modelo de dados (= saída do converter)
  lib/arvore.ts          árvore principal → derivados/relacionados (regra pura, testada)
  lib/busca.ts           busca por nome/nº (regra pura, testada)
  lib/formatacao.ts      data/hora e prazo sem deslocar fuso (testado)
  lib/dados.ts           carrega o JSON estático (demo / npm run dev sem login)
  lib/repositorio.ts     interface do banco + implementação em memória
  lib/repositorioFirestore.ts  Firestore: tempo real, transação com versao, historico (import() dinâmico: a demo não leva)
  lib/ids.ts             ids determinísticos (mesma regra do conversor)
  lib/listas.ts          menus dos formulários = aba Listas (modelo.json)
  lib/autenticacao.ts    login (import() dinâmico: a demo não leva o Firebase)
  lib/firebase.ts        app do Firebase
  components/            Login, Cabecalho, ListaClientes, PainelCliente, ArvoreProcessos, CartaoInfo
planilha/                modelo.json, gerador (Python/openpyxl), modelo e exemplo .xlsx
scripts/converter.mjs    planilha → JSON (SheetJS)
dados/base.json          base em JSON (dev e demo; produção usa o Firestore)
tests/regras.test.ts     testes das regras (node --test, sem dependências)
```

## Como rodar
```bash
npm install
npm run dev      # http://localhost:5173 — entrar com usuário do Nexus
npm test
npm run build    # gera dist/
```
Para mexer no visual sem senha: `http://localhost:5173/?semLogin` — só existe no servidor de desenvolvimento (`import.meta.env.DEV`), não vai para o build.

**Demonstração sem login:** `npm run build:demo` gera `dist-demo/` com `VITE_DEMO=1` (ver `.env.demo`) — a tela abre direto, com o selo "demonstração". Serve para mostrar o sistema por link com a base fictícia; **nunca** publicar essa versão com dado real.

> **OneDrive segura o `dist/`.** Logo após o build, o cliente de sincronização mantém os arquivos abertos: o esvaziamento do Vite e o `fs.rm` do Node "apagam" sem apagar. Por isso `npm run build` roda `scripts/limpar-dist.mjs` no fim: confere `dist/assets` contra o `index.html`, tenta de novo e **avisa** se sobrou bundle antigo. Antes de publicar, olhe esse aviso.

## Pendências
- [ ] **Antes de dado real no Firestore**: conferir a região do Firestore e registrar o Google Cloud no inventário LGPD; backup semanal (Spark não tem PITR) — as regras já validam campos, negam delete e exigem `papaEquipe`.
- [ ] **Importar / Baixar planilha pelo painel** (prévia campo a campo antes de gravar; exportação .xlsx com os títulos de `modelo.json`) — por enquanto a entrada é `npm run dados` + `npm run dados:firestore`.
- [ ] **Excluir processo/cliente** (exclusão lógica com `excluidoEm`) — hoje só cria e edita.
- [ ] Validar com a Dra. Renata os valores dos menus **Tipo, Natureza e Status** (aba Listas) e a distinção **Derivado × Relacionado**.
- [ ] Revisar a coluna **PENDÊNCIA** da planilha migrada (39 processos) e preencher ÚLT. MOVIMENTAÇÃO, que a planilha antiga não tinha. SITUAÇÃO ATUAL pode esperar: a OBSERVAÇÃO cobre por enquanto.
- [ ] Botões **Visualizar Peças / Enviar Comunicação**: decidir se ficam.
- [ ] **Cadastrar processo / Editar** do protótipo: fora enquanto a alimentação for pela planilha.
- [ ] Ligação com o **nº do cliente do Nexus** (coluna já existe na planilha).
- [ ] Quem mantém os **links** da pasta (URL compartilhada do OneDrive) e do acesso externo.

## Critério de pronto (relatório, item 10)
Localizar um cliente, abrir o painel, distinguir processos principais de desdobramentos, ver a situação atual e acessar os links externos, tudo com a base fictícia.
