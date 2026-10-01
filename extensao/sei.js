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
    /**
     * Tira a cortina. Com `mensagem`, deixa um aviso no canto; `manterAviso` conserva o fluxo para a página seguinte;
     * `detalhe` é uma linha técnica miúda (o que a extensão viu na tela, sem nenhum dado) para quem for dar suporte.
     */
    function liberar(mensagem, { manterAviso = false, detalhe: tecnico = '' } = {}) {
        encerrado = true
        cortina.remove()
        if (!manterAviso) gravarAviso(false)
        if (mensagem) avisar(mensagem, { detalhe: tecnico })
    }

    function avisar(texto, { somePorSi = false, detalhe: tecnico = '' } = {}) {
        const caixa = document.createElement('div')
        caixa.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;'
        const r = caixa.attachShadow({ mode: 'closed' })
        r.innerHTML = `
            <style>
                .aviso { max-width: 24rem; display: flex; gap: .75rem; align-items: flex-start; padding: .8rem 1rem; border-radius: .6rem; background: #173a4c; color: #fff;
                    font: .875rem/1.45 system-ui, "Segoe UI", sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.3); border-left: 4px solid #d1cda9; }
                b { display: block; font-size: .7rem; letter-spacing: .18em; text-transform: uppercase; color: #d1cda9; margin-bottom: .2rem; }
                small { display: block; margin-top: .45rem; font-size: .7rem; line-height: 1.35; color: #9fb4bf; overflow-wrap: anywhere; }
                small:empty { display: none; }
                button { font: inherit; color: #d1cda9; background: none; border: 0; cursor: pointer; padding: 0 .2rem; font-size: 1.1rem; line-height: 1; }
            </style>
            <div class="aviso" role="status"><div><b>Projeto PAPA</b><span></span><small></small></div><button type="button" title="Fechar" aria-label="Fechar">×</button></div>`
        r.querySelector('span').textContent = texto
        r.querySelector('small').textContent = tecnico ? `Detalhe técnico: ${tecnico}` : ''
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

    /** Campos escondidos do formulário que podem guardar a senha de verdade (o SEI mascara o campo que a pessoa vê). */
    function escondidosDaSenha(form) {
        return [...(form ?? document).querySelectorAll('input[type="hidden"]')].filter(h => h.name === 'pwdSenha' || (/senha|pwd/i.test(`${h.name} ${h.id}`) && !/^hdnInfra/i.test(h.name || h.id)))
    }

    /**
     * Preenche e-mail e senha como se fossem digitados. O SEI mascara a senha quando a página termina de carregar (troca o
     * campo por um de texto com bolinhas e guarda o valor de verdade por conta própria): esperar a troca antes de escrever,
     * senão o que foi escrito é apagado. Como o lugar onde o SEI guarda a senha varia, a conferência aceita três sinais:
     * o campo escondido com a senha, o campo simples com a senha, ou o campo mascarado pela página com o mesmo tamanho
     * (foi este o caso visto no SEI/RO em 01/10/2026: preenchido assim, o login entra). `ok: false` = não enviar sozinho.
     */
    async function preencher({ email, senha }) {
        const campoEmail = document.querySelector('#txtEmail')
        if (!campoEmail || !document.querySelector('#pwdSenha')) return { ok: false, form: null, detalhe: 'campos de login não encontrados' }
        const form = campoEmail.closest('form') ?? document.querySelector('#frmLogin')
        const mascaraPronta = () => {
            const c = document.querySelector('#pwdSenha')
            return !c || c.type !== 'password' || !c.classList.contains('masked') || escondidosDaSenha(form).length > 0
        }
        const inicio = Date.now()
        while (!mascaraPronta() && Date.now() - inicio < 1500) await esperar(100)
        const campoSenha = document.querySelector('#pwdSenha')
        if (!campoSenha) return { ok: false, form, detalhe: 'campo de senha sumiu' }
        digitar(campoEmail, email)
        digitar(campoSenha, senha)
        const escondidos = escondidosDaSenha(form)
        const exato = escondidos.find(h => h.name === 'pwdSenha')
        if (exato && exato.value !== senha) exato.value = senha
        const modo = escondidos.some(h => h.value === senha) ? 'em campo escondido'
            : campoSenha.value === senha ? 'em campo simples'
            : campoSenha.value !== '' && campoSenha.value.length === senha.length ? 'mascarada pela página'
            : ''
        return { ok: modo !== '', form, detalhe: `senha ${modo || 'NÃO confirmada'} (campo ${campoSenha.type}, ${escondidos.length} escondido(s))` }
    }

    /**
     * Aciona o botão de entrar (clique de verdade: passa pela validação do próprio SEI) e diz se o formulário saiu.
     * Nunca envia duas vezes: só recorre ao envio direto do formulário se o clique não tiver feito nada E a página não
     * estiver saindo (um login repetido com senha errada contaria em dobro para o bloqueio da conta).
     */
    async function enviarLogin(form) {
        const botao = document.querySelector('#sbmLogin')
            ?? form?.querySelector('button[type="submit"], input[type="submit"]')
            ?? [...(form ?? document).querySelectorAll('button, input[type="button"]')].find(b => /^\s*(entrar|acessar)\s*$/i.test(b.textContent || b.value || ''))
            ?? null
        let estado = 'sem envio'
        let saindo = false
        const aoEnviar = e => { estado = e.defaultPrevented ? 'barrado pela validação do SEI' : 'enviado' }
        const aoSair = () => { saindo = true }
        form?.addEventListener('submit', aoEnviar)
        window.addEventListener('beforeunload', aoSair)
        window.addEventListener('pagehide', aoSair)
        try {
            botao?.click()
            if (estado === 'sem envio') {
                await esperar(1200) // o botão pode ter enviado por conta própria, sem o evento "submit"
                if (!saindo && estado === 'sem envio' && form?.requestSubmit) form.requestSubmit()
            }
        } catch { /* formulário recusou o envio direto: fica como está */ }
        form?.removeEventListener('submit', aoEnviar)
        const rotulo = botao ? (botao.id ? `#${botao.id}` : botao.tagName.toLowerCase()) : 'não achei'
        return { enviado: estado === 'enviado' || saindo, detalhe: `botão ${rotulo}; envio: ${saindo && estado === 'sem envio' ? 'pelo botão' : estado}` }
    }

    /** O login está preenchido, mas quem clica em ENTRAR é a pessoa: o pedido continua valendo e o processo abre depois. */
    function passarParaManual(r, texto, tecnico) {
        enviar({ tipo: 'manual' })
        liberar(`${texto} Clique em ENTRAR: depois eu abro o processo ${r.numero}.`, { manterAviso: true, detalhe: tecnico })
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
        const pagina = lerPagina()
        const r = await enviar({ tipo: 'passo', pagina })
        if (encerrado) return
        if (!r) return liberar('A extensão PAPA foi atualizada ou desligada. Recarregue a página do PAPA e clique de novo.')
        if (r.numero) detalhe.textContent = `Conta ${r.conta} · processo ${r.numero}`
        switch (r.acao) {
            case 'preencher-login': {
                titulo.textContent = 'Entrando no SEI…'
                const preenchido = await preencher(r.credencial)
                if (!preenchido.form) {
                    enviar({ tipo: 'cancelar' })
                    return liberar('Não achei os campos de login nesta tela do SEI (ela pode ter mudado). Entre manualmente.', { detalhe: preenchido.detalhe })
                }
                if (!preenchido.ok) return passarParaManual(r, `Preenchi o e-mail da conta ${r.conta}, mas não consegui confirmar a senha no campo: confira (ou digite) a senha.`, preenchido.detalhe)
                const envio = await enviarLogin(preenchido.form)
                const tecnico = `${preenchido.detalhe}; ${envio.detalhe}`
                if (!envio.enviado) return passarParaManual(r, `Preenchi o login da conta ${r.conta}, mas o SEI não aceitou o envio automático.`, tecnico)
                // Enviado. Se em 15 s a tela ainda for esta, o envio não saiu de verdade: devolve a tela e segue no clique da pessoa.
                setTimeout(() => { if (!encerrado) passarParaManual(r, `Preenchi o login da conta ${r.conta}, mas a tela não mudou.`, tecnico) }, 15000)
                return
            }
            case 'aguardar-captcha': {
                const preenchido = await preencher(r.credencial)
                return liberar(r.mensagem, { manterAviso: true, detalhe: preenchido.detalhe })
            }
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
                // Fora da tela de login, diz o que foi visto na página (ajuda a ajustar a busca se a lista do SEI for diferente).
                return liberar(r.mensagem, {
                    detalhe: pagina.temLogin ? '' : `${pagina.links.length} link(s) com número nesta tela; próxima página: ${pagina.temProxima ? 'sim' : 'não'}; lista de acessos: ${pagina.noControle ? 'sim' : 'não'}`,
                })
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
