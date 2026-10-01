// PAPA — Acesso ao SEI · content script das páginas do SEI (roda em document_start, depois de logica.js).
//
// Fica INERTE em toda página do SEI que a pessoa abre por conta própria. Só age na aba que a extensão abriu a pedido do
// PAPA: a primeira página chega com a marca "#papa-sei" e, dali em diante, um aviso em sessionStorage (que é desta aba e
// deste site) mantém a cortina de "carregando" nas páginas seguintes, sem esperar resposta do fundo.
// Quem decide cada passo é o fundo (logica.js › decidir): este arquivo só lê a página e executa.
(() => {
    'use strict'
    if (window.top !== window) return
    const { MARCA } = globalThis.PapaSei
    const CHAVE = 'papaSeiAtivo'
    const lerAviso = () => { try { return sessionStorage.getItem(CHAVE) === '1' } catch { return false } }
    const gravarAviso = ligado => { try { ligado ? sessionStorage.setItem(CHAVE, '1') : sessionStorage.removeItem(CHAVE) } catch { /* sem armazenamento: só perde a cortina */ } }

    const pelaMarca = location.hash === MARCA
    if (!pelaMarca && !lerAviso()) return
    gravarAviso(true)
    if (pelaMarca) history.replaceState(history.state, '', location.pathname + location.search)

    const esperar = ms => new Promise(r => setTimeout(r, ms))
    const enviar = async mensagem => {
        try { return await chrome.runtime.sendMessage(mensagem) } catch { return null } // extensão recarregada ou desligada
    }

    // ── cortina de "carregando" (Shadow DOM fechado: o CSS do SEI não entra e a página não mexe nela) ──
    const cortina = document.createElement('div')
    cortina.style.cssText = 'position:fixed;inset:0;z-index:2147483647;'
    const raiz = cortina.attachShadow({ mode: 'closed' })
    raiz.innerHTML = `
        <style>
            .fundo { position: fixed; inset: 0; display: grid; place-items: center; background: #173a4c; font-family: system-ui, "Segoe UI", sans-serif; color: #fff; }
            .cartao { width: min(26rem, 86vw); text-align: center; }
            .marca { font-size: .75rem; letter-spacing: .22em; text-transform: uppercase; color: #d1cda9; }
            .giro { width: 2.75rem; height: 2.75rem; margin: 1.4rem auto; border-radius: 50%; border: 3px solid rgba(209,205,169,.3); border-top-color: #d1cda9; animation: giro .9s linear infinite; }
            .titulo { margin: 0; font-size: 1.25rem; font-weight: 700; }
            .detalhe { margin: .5rem 0 1.5rem; font-size: .9rem; line-height: 1.45; color: #c9d6dd; overflow-wrap: anywhere; }
            button { font: inherit; font-size: .8rem; color: #d1cda9; background: none; border: 1px solid rgba(209,205,169,.5); border-radius: .5rem; padding: .4rem .9rem; cursor: pointer; }
            button:hover { background: rgba(209,205,169,.15); }
            @keyframes giro { to { transform: rotate(360deg); } }
            @media (prefers-reduced-motion: reduce) { .giro { animation-duration: 3s; } }
        </style>
        <div class="fundo" role="status" aria-live="polite">
            <div class="cartao">
                <div class="marca">Projeto PAPA</div>
                <div class="giro"></div>
                <p class="titulo">Entrando no SEI…</p>
                <p class="detalhe"></p>
                <button type="button">Cancelar e seguir por conta própria</button>
            </div>
        </div>`
    const titulo = raiz.querySelector('.titulo')
    const detalhe = raiz.querySelector('.detalhe')
    document.documentElement.appendChild(cortina)

    let encerrado = false
    /** Tira a cortina. Com `mensagem`, deixa um aviso no canto; `manterAviso` conserva o fluxo para a página seguinte. */
    function liberar(mensagem, { manterAviso = false } = {}) {
        encerrado = true
        cortina.remove()
        if (!manterAviso) gravarAviso(false)
        if (mensagem) avisar(mensagem)
    }

    function avisar(texto, { somePorSi = false } = {}) {
        const caixa = document.createElement('div')
        caixa.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;'
        const r = caixa.attachShadow({ mode: 'closed' })
        r.innerHTML = `
            <style>
                .aviso { max-width: 24rem; display: flex; gap: .75rem; align-items: flex-start; padding: .8rem 1rem; border-radius: .6rem; background: #173a4c; color: #fff;
                    font: .875rem/1.45 system-ui, "Segoe UI", sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.3); border-left: 4px solid #d1cda9; }
                b { display: block; font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; color: #d1cda9; margin-bottom: .2rem; }
                button { font: inherit; color: #d1cda9; background: none; border: 0; cursor: pointer; padding: 0 .2rem; font-size: 1.1rem; line-height: 1; }
            </style>
            <div class="aviso" role="status"><div><b>Projeto PAPA</b><span></span></div><button type="button" title="Fechar" aria-label="Fechar">×</button></div>`
        r.querySelector('span').textContent = texto
        r.querySelector('button').addEventListener('click', () => caixa.remove())
        ;(document.body ?? document.documentElement).appendChild(caixa)
        if (somePorSi) setTimeout(() => caixa.remove(), 3500)
    }

    raiz.querySelector('button').addEventListener('click', () => {
        enviar({ tipo: 'cancelar' })
        liberar()
    })

    // Nunca deixar a pessoa presa atrás da cortina: se esta página não andar em 25 s, solta a tela. O pedido NÃO é
    // cancelado: se for só o SEI lento, a página seguinte chega e a extensão continua de onde parou.
    setTimeout(() => {
        if (!encerrado) liberar('O SEI está demorando mais do que o normal. Tirei a tela de espera; se ele responder, eu continuo de onde parei.', { manterAviso: true })
    }, 25000)

    // ── leitura da página ──
    const visivel = el => !!el && el.getClientRects().length > 0
    const acharProxima = () =>
        document.querySelector('#lnkInfraProximaPaginaSuperior, #lnkInfraProximaPaginaInferior')
        ?? [...document.querySelectorAll('a')].find(a => /pr[oó]xima p[aá]gina/i.test(`${a.title} ${a.querySelector('img')?.title ?? ''} ${a.querySelector('img')?.alt ?? ''}`))
        ?? null
    const acharSair = () => document.querySelector('a[href*="acao=usuario_externo_sair"], #lnkInfraSairSistema, #lnkSairSistema') ?? null
    const ancoras = () => [...document.querySelectorAll('a')]

    function lerPagina() {
        const temLogin = !!document.querySelector('#txtEmail') && !!document.querySelector('#pwdSenha')
        const captcha = document.querySelector('#txtInfraCaptcha, #txtCaptcha, input[id*="aptcha"]:not([type="hidden"]), input[name*="aptcha"]:not([type="hidden"])')
        const links = ancoras()
            .map((a, indice) => ({ indice, texto: (a.textContent ?? '').replace(/\s+/g, ' ').trim(), href: a.href ?? '', linha: (a.closest('tr')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400) }))
            .filter(l => l.texto.length <= 60 && l.texto.replace(/\D/g, '').length >= 4)
        return {
            temLogin,
            temCaptcha: temLogin && visivel(captcha),
            links,
            temProxima: !!acharProxima(),
            temSair: !!acharSair(),
            linkControle: document.querySelector('a[href*="acao=usuario_externo_controle_acessos"]')?.href ?? '',
            noControle: /[?&]acao=usuario_externo_controle_acessos(&|$)/.test(location.search),
        }
    }

    // ── execução ──
    const mesmoSite = href => { try { return new URL(href, location.href).origin === location.origin } catch { return false } }

    /** Escreve num campo como se fosse digitado (o SEI mascara a senha ouvindo esses eventos). */
    function digitar(campo, valor) {
        const prototipo = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototipo, 'value').set.call(campo, valor)
        for (const tipo of ['input', 'change']) campo.dispatchEvent(new Event(tipo, { bubbles: true }))
    }

    /**
     * Preenche e-mail e senha. O SEI troca o campo de senha por um campo de texto mascarado + um campo escondido com o
     * valor de verdade (name="pwdSenha"), e faz isso quando a página termina de carregar: esperar a troca antes de
     * escrever, senão o que foi escrito é apagado. Devolve false se não tiver certeza de que a senha ficou no lugar certo.
     */
    async function preencher({ email, senha }) {
        const real = () => document.querySelector('input[type="hidden"][name="pwdSenha"]')
        const inicio = Date.now()
        while (!real() && document.querySelector('#pwdSenha')?.classList.contains('masked') && Date.now() - inicio < 1500) await esperar(100)
        const campoEmail = document.querySelector('#txtEmail')
        const campoSenha = document.querySelector('#pwdSenha')
        if (!campoEmail || !campoSenha) return false
        digitar(campoEmail, email)
        digitar(campoSenha, senha)
        if (real()) {
            if (real().value !== senha) real().value = senha
            return true
        }
        return campoSenha.value === senha
    }

    function enviarLogin() {
        const botao = document.querySelector('#sbmLogin') ?? document.querySelector('#frmLogin [type="submit"]')
        if (!botao) return false
        botao.click() // clique de verdade: passa pela validação do próprio SEI (OnSubmitForm)
        return true
    }

    async function passo() {
        try {
            await executarPasso()
        } catch (erro) {
            // Qualquer surpresa (tela do SEI diferente do esperado): solta a tela e deixa a pessoa seguir.
            enviar({ tipo: 'cancelar' })
            liberar(`A extensão PAPA não conseguiu continuar nesta tela do SEI (${erro?.message ?? erro}). Siga manualmente.`)
        }
    }

    async function executarPasso() {
        if (encerrado) return
        const r = await enviar({ tipo: 'passo', pagina: lerPagina() })
        if (encerrado) return
        if (!r) return liberar('A extensão PAPA foi atualizada ou desligada. Recarregue a página do PAPA e clique de novo.')
        if (r.numero) detalhe.textContent = `Conta ${r.conta} · processo ${r.numero}`
        switch (r.acao) {
            case 'preencher-login':
                titulo.textContent = 'Entrando no SEI…'
                if (!(await preencher(r.credencial)) || !enviarLogin()) {
                    enviar({ tipo: 'cancelar' })
                    liberar('Não consegui preencher o login desta tela do SEI (ela pode ter mudado). Entre manualmente; o e-mail já está no campo.')
                }
                return
            case 'aguardar-captcha':
                await preencher(r.credencial)
                return liberar(r.mensagem, { manterAviso: true })
            case 'abrir-processo': {
                titulo.textContent = `Abrindo o processo ${r.numero}…`
                const alvo = ancoras()[r.indice]
                // Se em 6 s a página não mudou (o navegador barrou a abertura, ou o link é de outro tipo), mostra a lista
                // com a linha do processo destacada. Se for só lentidão, o processo abre logo em seguida do mesmo jeito.
                setTimeout(() => {
                    if (encerrado) return
                    if (alvo) {
                        alvo.scrollIntoView({ block: 'center' })
                        ;(alvo.closest('tr') ?? alvo).style.outline = '3px solid #d1cda9'
                    }
                    liberar(`Achei o processo ${r.numero} na lista (está destacado). Se ele não abrir sozinho, clique nele.`)
                }, 6000)
                // Só navega para dentro do próprio SEI (mesma origem da página, que é https no SEI de verdade).
                if (/^https?:/i.test(r.href) && mesmoSite(r.href)) return location.assign(r.href)
                return alvo?.click()
            }
            case 'ir':
                if (mesmoSite(r.href)) return location.assign(r.href)
                enviar({ tipo: 'cancelar' })
                return liberar()
            case 'proxima-pagina':
                titulo.textContent = `Procurando o processo ${r.numero}…`
                return acharProxima()?.click()
            case 'sair': {
                titulo.textContent = 'Trocando de conta no SEI…'
                const sair = acharSair()
                if (sair?.href && /^https?:/i.test(sair.href) && mesmoSite(sair.href)) return location.assign(sair.href)
                return sair?.click()
            }
            case 'concluido':
                liberar()
                return avisar(`Processo ${r.numero} aberto pelo PAPA.`, { somePorSi: true })
            case 'parar':
                return liberar(r.mensagem)
            default:
                return liberar() // esta aba não tem pedido do PAPA (ou ele expirou)
        }
    }

    // Age depois que a página terminou de carregar (o SEI prepara o campo de senha no fim da carga). Se algum recurso
    // travar o "load", segue 3 s depois do HTML pronto.
    const carregou = new Promise(resolver => {
        if (document.readyState === 'complete') return resolver()
        window.addEventListener('load', () => resolver(), { once: true })
        document.addEventListener('DOMContentLoaded', () => setTimeout(resolver, 3000), { once: true })
    })
    carregou.then(() => esperar(150)).then(passo)
})()
