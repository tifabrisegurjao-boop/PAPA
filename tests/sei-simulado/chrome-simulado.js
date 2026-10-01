// SEI simulado · faz as vezes do fundo.js fora de um navegador com a extensão instalada.
// Guarda o pedido em localStorage e decide com as MESMAS regras da extensão (PapaSei.tratar, de extensao/logica.js);
// o que se testa aqui é o content script extensao/sei.js mexendo numa página de verdade.
// Estado em localStorage › "papaSeiSimulado": { contas, intencao, servidor: { email, senha, paginas, captcha }, logado, envios, diario }.
(() => {
    'use strict'
    const CHAVE = 'papaSeiSimulado'
    const ler = () => JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
    const gravar = estado => localStorage.setItem(CHAVE, JSON.stringify(estado))
    window.seiSimulado = { ler, gravar }

    const deposito = {
        lerContas: async () => ler().contas ?? [],
        lerIntencao: async () => ler().intencao ?? null,
        gravarIntencao: async (_tabId, intencao) => { const e = ler(); e.intencao = intencao; gravar(e) },
        abrirAba: async () => 1,
    }

    window.chrome = Object.assign(window.chrome ?? {}, {
        runtime: {
            async sendMessage(mensagem) {
                // O remetente é o que o Chrome informaria para uma aba real do SEI/RO: aba 1, quadro principal, https.
                const remetente = { origem: 'https://sei.sistemas.ro.gov.br', url: `https://sei.sistemas.ro.gov.br/sei/${location.pathname.split('/').pop()}${location.search}`, tabId: 1, frameId: 0 }
                const resposta = await globalThis.PapaSei.tratar(mensagem, remetente, deposito, Date.now())
                const e = ler()
                ;(e.diario ??= []).push({ pagina: location.pathname.split('/').pop() + location.search, tipo: mensagem.tipo, acao: resposta.acao ?? (resposta.ok ? 'ok' : 'recusado'), comCredencial: 'credencial' in resposta })
                gravar(e)
                return resposta
            },
        },
    })
})()
