// PAPA — Acesso ao SEI · service worker. Só faz a ligação com o navegador; as regras estão em logica.js (testadas).
importScripts('logica.js')
const { tratar } = globalThis.PapaSei

// As senhas (chrome.storage.local › "contas") só podem ser lidas por páginas da própria extensão e por este worker:
// os content scripts — que rodam dentro de páginas da web — não enxergam o armazenamento, só recebem a credencial do
// passo de login, e só na aba e no site certos (ver logica.js › tratar).
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {})

// O pedido em andamento de cada aba fica em storage.session: some ao fechar o navegador e sobrevive ao worker dormir.
const chave = tabId => `pedido:${tabId}`
const deposito = {
    lerContas: async () => (await chrome.storage.local.get('contas')).contas ?? [],
    lerIntencao: async tabId => (await chrome.storage.session.get(chave(tabId)))[chave(tabId)] ?? null,
    gravarIntencao: async (tabId, intencao) => {
        if (intencao) await chrome.storage.session.set({ [chave(tabId)]: intencao })
        else await chrome.storage.session.remove(chave(tabId))
    },
    abrirAba: async (url, tabIdDeOrigem) => (await chrome.tabs.create({ url, openerTabId: tabIdDeOrigem })).id,
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
    let origem = remetente.origin ?? ''
    if (!origem && remetente.url) { try { origem = new URL(remetente.url).origin } catch { /* fica vazio: o pedido é recusado */ } }
    tratar(mensagem, { origem, url: remetente.url ?? '', tabId: remetente.tab?.id, frameId: remetente.frameId }, deposito, Date.now())
        .then(responder, erro => responder({ ok: false, acao: 'parar', motivo: 'erro', mensagem: `A extensão PAPA falhou: ${erro?.message ?? erro}` }))
    return true // resposta assíncrona
})

chrome.tabs.onRemoved.addListener(tabId => { deposito.gravarIntencao(tabId, null).catch(() => {}) })

// O ícone abre a tela de contas e senhas.
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage())
chrome.runtime.onInstalled.addListener(detalhes => { if (detalhes.reason === 'install') chrome.runtime.openOptionsPage() })
