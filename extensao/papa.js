// PAPA — Acesso ao SEI · content script das páginas do PAPA.
// Diz ao PAPA que a extensão está instalada e repassa ao fundo o pedido "abra este processo no SEI".
// Não lê nada da página e não tem acesso às senhas: só carrega nº do processo, conta e endereço do SEI de um lado
// para o outro. Quem valida o pedido é o fundo (logica.js › tratar).
(() => {
    'use strict'
    document.documentElement.dataset.papaExtensaoSei = chrome.runtime.getManifest().version

    window.addEventListener('message', async evento => {
        if (evento.source !== window || evento.origin !== location.origin) return
        const m = evento.data
        if (!m || m.origem !== 'papa' || m.tipo !== 'papa-sei-abrir') return
        let resposta
        try {
            resposta = await chrome.runtime.sendMessage({ tipo: 'abrir', numero: String(m.numero ?? ''), conta: String(m.conta ?? ''), host: String(m.host ?? '') })
        } catch {
            // A extensão foi recarregada depois que esta página abriu: este script ficou órfão.
            resposta = { ok: false, motivo: 'recarregar', mensagem: 'A extensão PAPA foi atualizada. Recarregue esta página (F5) e clique de novo.' }
        }
        window.postMessage({ origem: 'papa-extensao', tipo: 'papa-sei-resposta', id: m.id, ...(resposta ?? { ok: false, motivo: 'sem-resposta' }) }, location.origin)
    })
})()
