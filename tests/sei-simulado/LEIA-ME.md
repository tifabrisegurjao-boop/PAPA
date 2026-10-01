# SEI simulado

Três páginas estáticas que imitam o caminho do usuário externo no SEI — tela de login (com a senha mascarada como no SEI
e captcha opcional), lista de acessos externos paginada e página do processo — para testar `extensao/sei.js` **sem tocar no
SEI de verdade e sem senha real**. `chrome-simulado.js` faz o papel do `fundo.js` usando as mesmas regras
(`extensao/logica.js`).

Com o servidor de desenvolvimento no ar (`npm run dev`), no console do navegador:

```js
localStorage.setItem('papaSeiSimulado', JSON.stringify({
    contas: [{ host: 'sei.sistemas.ro.gov.br', email: 'teste@exemplo.com', senha: 'senha-de-teste', padrao: true }],
    servidor: { email: 'teste@exemplo.com', senha: 'senha-de-teste',
        paginas: { 'teste@exemplo.com': [[{ numero: '0010.111111/2026-11', validade: '01/01/2027' }], [{ numero: '0010.222222/2026-22', validade: '01/01/2027' }]] } },
    intencao: { numero: '0010.222222/2026-22', host: 'sei.sistemas.ro.gov.br', conta: 'teste@exemplo.com', etapa: 'entrar', logou: false, manual: false,
        saiu: false, foiAoLogin: false, foiAoControle: false, paginas: 0, criadoEm: Date.now(), atualizadoEm: Date.now() },
}))
location.href = '/tests/sei-simulado/login.html#papa-sei'
```

Deve terminar na página do processo `0010.222222/2026-22`, e `JSON.parse(localStorage.papaSeiSimulado).diario` mostra cada
passo. Variações: `servidor.senha` diferente da conta (login recusado: um envio só), `servidor.captcha: 'K7QD'` (para e
espera), processo fora da lista, `logado` com outra conta antes de começar (sai e entra com a certa),
`servidor.mascara: 'sem-escondido'` (a senha mascarada sem campo escondido, como no SEI/RO de verdade),
`servidor.botao: 'solto'` (botão que envia sem o evento `submit`: não pode haver envio em dobro) e
`servidor.barrarEnvios: 1` (a validação recusa o envio automático: modo manual, e o fluxo continua depois do clique).
