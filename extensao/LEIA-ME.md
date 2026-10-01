# PAPA — Acesso ao SEI (extensão de navegador)

Faz o que um site não consegue fazer sozinho: quando você clica em **Entrar** num processo do PAPA que só abre com login,
a extensão abre o SEI numa aba nova, mostra um "carregando", **faz o login com a conta de acesso do processo** e **abre o
processo** na lista de acessos externos. Funciona no Chrome e no Edge.

## Instalar (uma vez por computador)
1. Abra `chrome://extensions` (no Edge: `edge://extensions`).
2. Ligue o **Modo do desenvolvedor** (canto superior direito; no Edge, na lateral esquerda).
3. Clique em **Carregar sem compactação** (Edge: *Carregar sem pacote*) e escolha esta pasta `extensao`.
4. A tela de **contas** abre sozinha. Cadastre cada conta de acesso: o SEI, o e-mail (igual ao da CONTA DE ACESSO do
   processo no PAPA) e a senha. Marque uma como **padrão** se quiser que ela seja usada nos processos sem conta cadastrada.
5. Recarregue a página do PAPA (F5). No processo que abre com login, a faixa passa a dizer "extensão PAPA instalada".

Para voltar à tela de contas: clique no ícone da extensão na barra do navegador (se não aparecer, clique no quebra-cabeça
e fixe "PAPA — Acesso ao SEI").

> O navegador pode avisar, ao abrir, que há extensões em modo de desenvolvedor. É por ela ter sido instalada pela pasta e
> não pela loja; pode manter.

## Como usar
No PAPA, abra o processo e clique no cartão do número (**Entrar**). Em outra aba:
1. aparece a tela azul "Entrando no SEI…";
2. a extensão preenche e envia o login;
3. procura o processo na lista de acessos externos (em todas as páginas da lista) e abre.

Processo com **link direto** (o que chega por e-mail) continua abrindo pelo link, sem a extensão.

## O que ela faz e o que não faz
- As senhas ficam **só neste navegador** (armazenamento da extensão). Não vão para o PAPA, para o Firestore nem para a
  internet, e só são digitadas na tela de login do SEI para o qual foram salvas, na aba que o PAPA abriu.
- **Uma tentativa de login por clique.** Se o SEI recusar, ela para e avisa — não tenta de novo, para não bloquear a conta.
- Se ela preencher o login mas não conseguir enviar sozinha, pede o seu clique em ENTRAR e **continua depois** (abre o processo).
- **Não resolve captcha.** Se o SEI pedir o código da imagem, ela preenche e-mail e senha, tira a tela azul e espera você
  digitar o código; depois continua e abre o processo.
- Só age na aba que ela mesma abriu a pedido do PAPA. Nas páginas do SEI que você abre por conta própria, fica parada.
- Se já houver outra conta logada no SEI e o processo não estiver na lista dela, a extensão sai e entra com a conta certa.
- Se o SEI demorar mais de 25 segundos numa tela, a tela azul some (e a extensão continua se ele responder). Há sempre o botão "Cancelar".
- As senhas não são criptografadas pela extensão: quem usa este computador com o seu usuário do Windows pode usá-las.
  Não cadastre em computador compartilhado.

## SEIs atendidos
`sei.sistemas.ro.gov.br` (SEI/RO), `sei.dnit.gov.br`, `sei.incra.gov.br`, `sei.trf1.jus.br`, `sei.fiocruz.br`.
Para incluir outro: acrescente em `HOSTS` (`logica.js`) e em `matches` (`manifest.json`), e recarregue a extensão.

## Se não funcionar
| O que aparece | O que fazer |
|---|---|
| "Preenchi o login… Clique em ENTRAR" | O SEI não aceitou o envio automático nesta tela. Clique em ENTRAR: a extensão continua e abre o processo. Se acontecer sempre, mande um print do aviso (a linha "Detalhe técnico" diz o que ela viu). |
| "A extensão PAPA não tem a senha da conta X" | Cadastre a conta na tela de contas (ícone da extensão). O e-mail tem de ser igual ao do processo. |
| "O SEI não aceitou o login da conta X" | A senha salva está errada ou mudou: use **Trocar senha** na tela de contas. |
| "Não achei o processo N na lista de acessos" | O processo é de outra conta, ou o acesso externo expirou. Confira a conta de acesso no lápis do processo. |
| O PAPA abre o link normal, sem tela azul | A extensão não está instalada/ligada neste navegador, ou a página do PAPA não foi recarregada depois da instalação. |
| "A extensão PAPA foi atualizada…" | Recarregue a página do PAPA (F5). |

## Atualizar
A extensão carrega os arquivos desta pasta. Depois de receber uma versão nova: `chrome://extensions` › botão de
recarregar (seta circular) no cartão da extensão, e F5 no PAPA. As contas salvas continuam.

## Arquivos
`manifest.json` · `logica.js` (regras, testadas em `tests/extensaoSei.test.ts`) · `fundo.js` (service worker) ·
`sei.js` (páginas do SEI) · `papa.js` (páginas do PAPA) · `opcoes.*` (tela de contas) · `icones/`.
Há um SEI simulado em `tests/sei-simulado/` para testar o fluxo sem tocar no SEI de verdade.
