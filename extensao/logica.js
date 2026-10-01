// PAPA — Acesso ao SEI · regras puras (sem DOM e sem chrome.*), testadas em tests/extensaoSei.test.ts.
//
// Este arquivo é carregado de três jeitos: importScripts() no service worker (fundo.js), content script nas páginas do
// SEI (antes de sei.js) e import nos testes. Por isso não usa import/export: publica tudo em globalThis.PapaSei.
//
// O que a extensão faz: o PAPA pede "abra o processo N com a conta X no SEI Y"; a extensão abre a tela de login daquele
// SEI numa aba nova, preenche e envia o login UMA vez, procura o processo na lista de acessos externos e abre.
// O que ela nunca faz: tentar o login de novo depois de uma recusa (para não bloquear a conta), resolver captcha
// (para e deixa a pessoa digitar), agir numa aba que o PAPA não abriu, ou entregar senha a uma página que não seja
// a do SEI para o qual ela foi salva.
(() => {
    'use strict'

    /** SEIs atendidos (os que aparecem na base do escritório). Tem de bater com "matches" do manifest.json. */
    const HOSTS = {
        'sei.sistemas.ro.gov.br': 'SEI/RO',
        'sei.dnit.gov.br': 'SEI do DNIT',
        'sei.incra.gov.br': 'SEI do INCRA',
        'sei.trf1.jus.br': 'SEI do TRF1',
        'sei.fiocruz.br': 'SEI da Fiocruz',
    }
    /** Páginas que podem pedir uma abertura: o PAPA publicado e o servidor de desenvolvimento. */
    const ORIGENS_PAPA = ['https://papa-85025.web.app', 'https://papa-85025.firebaseapp.com', 'http://localhost:5173', 'http://localhost:5174']
    /** Marca na primeira página da aba aberta pela extensão (fragmento: não vai para o servidor e não leva dado nenhum). */
    const MARCA = '#papa-sei'
    /** Um pedido parado por mais que isto é esquecido (com captcha, a pessoa tem mais tempo). */
    const VALIDADE_MS = 2 * 60 * 1000
    const VALIDADE_MANUAL_MS = 10 * 60 * 1000
    const MAX_PAGINAS = 20

    const soDigitos = t => String(t ?? '').replace(/\D/g, '')
    const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
    /** Mesma chave do PAPA: 0010.123456/2026-11 = 0010123456202611. */
    const chaveNumero = n => (soDigitos(n).length >= 4 ? soDigitos(n) : normalizar(n))
    const urlLogin = host => `https://${host}/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0`

    /** Conta salva para aquele SEI: a pedida (e-mail) ou, sem pedido, a marcada como padrão (ou a única). */
    function acharConta(contas, host, email) {
        const doHost = (Array.isArray(contas) ? contas : []).filter(c => c && c.host === host && c.email && c.senha)
        const pedido = String(email ?? '').trim().toLowerCase()
        if (pedido) return doHost.find(c => String(c.email).toLowerCase() === pedido) ?? null
        return doHost.find(c => c.padrao) ?? (doHost.length === 1 ? doHost[0] : null)
    }

    /** Valida o pedido do PAPA e monta o estado inicial. Não abre nada: quem abre a aba é o fundo.js. */
    function novaIntencao(pedido, contas, agora) {
        const host = String(pedido?.host ?? '').trim().toLowerCase()
        const numero = String(pedido?.numero ?? '').trim()
        const contaPedida = String(pedido?.conta ?? '').trim().toLowerCase()
        if (!Object.hasOwn(HOSTS, host))
            return { ok: false, motivo: 'host', mensagem: `A extensão PAPA ainda não atende o SEI "${host || 'sem endereço'}". Use o link normal.` }
        if (!numero || numero.length > 100) return { ok: false, motivo: 'numero', mensagem: 'O processo não tem um número válido para procurar no SEI.' }
        const conta = acharConta(contas, host, contaPedida)
        if (!conta)
            return {
                ok: false,
                motivo: 'sem-senha',
                mensagem: contaPedida
                    ? `A extensão PAPA não tem a senha da conta ${contaPedida} para o ${HOSTS[host]}. Clique no ícone da extensão e cadastre essa conta.`
                    : `Este processo não tem conta de acesso cadastrada, e a extensão não tem uma conta padrão para o ${HOSTS[host]}. Preencha a conta no lápis do processo ou marque uma conta padrão na extensão.`,
            }
        return {
            ok: true,
            url: urlLogin(host) + MARCA,
            intencao: {
                numero, host, conta: String(conta.email).toLowerCase(),
                etapa: 'entrar', logou: false, manual: false, saiu: false, foiAoLogin: false, foiAoControle: false, paginas: 0,
                criadoEm: agora, atualizadoEm: agora,
            },
        }
    }

    /** Maior data dd/mm/aaaa do texto da linha (a coluna Validade), como número aaaammdd; 0 se não houver. */
    function maiorData(texto) {
        let maior = 0
        for (const m of String(texto ?? '').matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)) maior = Math.max(maior, Number(m[3] + m[2] + m[1]))
        return maior
    }

    /**
     * Na lista de acessos externos, o link cujo texto é o nº do processo. Com o mesmo processo liberado mais de uma vez,
     * fica o de validade mais distante. `links`: [{ indice, texto, href, linha }].
     */
    function escolherLink(links, numero) {
        const alvo = chaveNumero(numero)
        const candidatos = (Array.isArray(links) ? links : []).filter(l => l && typeof l.texto === 'string' && chaveNumero(l.texto) === alvo)
        if (!candidatos.length) return null
        return candidatos.reduce((melhor, l) => (maiorData(l.linha) > maiorData(melhor.linha) ? l : melhor))
    }

    /**
     * O próximo passo, dado o estado do pedido e o que há na página. Não tem efeito colateral: devolve a ação para o
     * content script executar e o estado novo para o fundo guardar (null = pedido encerrado).
     * `pagina`: { temLogin, temCaptcha, links, temProxima, temSair, linkControle, noControle }.
     * Ações: preencher-login | aguardar-captcha | abrir-processo | ir | proxima-pagina | sair | concluido | parar | nenhuma.
     */
    function decidir(i, pagina, agora) {
        if (!i) return { acao: 'nenhuma', intencao: null }
        if (agora - i.atualizadoEm > (i.manual ? VALIDADE_MANUAL_MS : VALIDADE_MS)) return { acao: 'nenhuma', intencao: null }
        const segue = extra => ({ ...i, ...extra, atualizadoEm: agora })
        const parar = mensagem => ({ acao: 'parar', intencao: null, mensagem })

        // Já mandamos abrir o processo: a página que carregou é ele (ou o erro do próprio SEI, que a pessoa precisa ver).
        // Se em vez dele veio a tela de login, a sessão caiu: não entra de novo sozinho (seria um segundo envio de senha).
        if (i.etapa === 'abrindo')
            return pagina.temLogin ? parar(`O SEI pediu login de novo ao abrir o processo ${i.numero}. Entre manualmente.`) : { acao: 'concluido', intencao: null }

        if (pagina.temLogin) {
            const captcha = `O SEI pediu o código da imagem. Já preenchi o e-mail e a senha da conta ${i.conta}: digite o código e clique em Acessar. Depois eu abro o processo ${i.numero}.`
            if (!i.logou) {
                return pagina.temCaptcha
                    ? { acao: 'aguardar-captcha', intencao: segue({ etapa: 'logando', logou: true, manual: true }), mensagem: captcha }
                    : { acao: 'preencher-login', intencao: segue({ etapa: 'logando', logou: true, manual: false }) }
            }
            // A pessoa está digitando o captcha e errou o código: preenche de novo e continua esperando por ela.
            if (i.manual && i.etapa === 'logando' && pagina.temCaptcha) return { acao: 'aguardar-captcha', intencao: segue({}), mensagem: captcha }
            // Login automático enviado uma vez e a tela de login voltou: NUNCA tentar de novo (bloqueio de conta).
            if (i.etapa === 'logando')
                return parar(`O SEI não aceitou o login da conta ${i.conta}. Confira a senha salva na extensão PAPA (ícone na barra do navegador). Não tentei de novo para não bloquear a conta.`)
            return parar(`O SEI voltou para a tela de login no meio do caminho. Entre manualmente; o processo é o ${i.numero}.`)
        }

        const alvo = escolherLink(pagina.links, i.numero)
        if (alvo) return { acao: 'abrir-processo', indice: alvo.indice, href: alvo.href, intencao: segue({ etapa: 'abrindo' }) }
        // Não estamos na lista de acessos (aviso, página inicial…): ir até ela, uma vez.
        if (!pagina.noControle && pagina.linkControle && !i.foiAoControle)
            return { acao: 'ir', href: pagina.linkControle, intencao: segue({ foiAoControle: true, paginas: 0 }) }
        if (pagina.temProxima && i.paginas < MAX_PAGINAS) return { acao: 'proxima-pagina', intencao: segue({ etapa: i.logou ? 'procurando' : i.etapa, paginas: i.paginas + 1 }) }
        // Não fizemos login e o processo não está aqui: havia outra conta logada nesta janela. Sair e entrar com a certa.
        if (!i.logou && !i.saiu && pagina.temSair) return { acao: 'sair', intencao: segue({ saiu: true, foiAoControle: false, paginas: 0 }) }
        if (!i.logou && i.saiu && !i.foiAoLogin) return { acao: 'ir', href: urlLogin(i.host), intencao: segue({ foiAoLogin: true }) }
        return parar(`Não achei o processo ${i.numero} na lista de acessos externos da conta ${i.conta}. Pode ser de outra conta, ou o acesso expirou. Deixei a lista aberta para você conferir.`)
    }

    /**
     * Trata uma mensagem recebida pelo fundo. `remetente`: { origem, url, tabId, frameId }. `deposito` isola o que é do
     * navegador: { lerContas(), lerIntencao(tabId), gravarIntencao(tabId, intencao|null), abrirAba(url, tabIdDeOrigem) }.
     * A senha só sai daqui na resposta de um passo de login, para a aba que a extensão abriu, no host da conta, em https.
     */
    async function tratar(mensagem, remetente, deposito, agora) {
        switch (mensagem?.tipo) {
            case 'abrir': {
                if (!ORIGENS_PAPA.includes(remetente?.origem) || remetente?.tabId == null)
                    return { ok: false, motivo: 'origem', mensagem: 'Pedido recusado: só o PAPA pode pedir a abertura de um processo.' }
                const r = novaIntencao(mensagem, await deposito.lerContas(), agora)
                if (!r.ok) return r
                const tabId = await deposito.abrirAba(r.url, remetente.tabId)
                await deposito.gravarIntencao(tabId, r.intencao)
                return { ok: true, conta: r.intencao.conta }
            }
            case 'passo': {
                if (remetente?.tabId == null || remetente.frameId !== 0) return { acao: 'nenhuma' }
                const atual = await deposito.lerIntencao(remetente.tabId)
                if (!atual) return { acao: 'nenhuma' }
                let url = null
                try { url = new URL(remetente.url) } catch { /* sem URL: recusa abaixo */ }
                if (!url || url.protocol !== 'https:' || url.host !== atual.host) {
                    await deposito.gravarIntencao(remetente.tabId, null)
                    return { acao: 'nenhuma' }
                }
                const d = decidir(atual, mensagem.pagina ?? {}, agora)
                const resposta = { acao: d.acao, indice: d.indice, href: d.href, mensagem: d.mensagem, numero: atual.numero, conta: atual.conta }
                if (d.acao === 'preencher-login' || d.acao === 'aguardar-captcha') {
                    const conta = acharConta(await deposito.lerContas(), atual.host, atual.conta)
                    if (!conta) {
                        await deposito.gravarIntencao(remetente.tabId, null)
                        return { acao: 'parar', numero: atual.numero, conta: atual.conta, mensagem: `A conta ${atual.conta} não está mais salva na extensão PAPA. Cadastre de novo (ícone da extensão).` }
                    }
                    resposta.credencial = { email: conta.email, senha: conta.senha }
                }
                await deposito.gravarIntencao(remetente.tabId, d.intencao)
                return resposta
            }
            // O login foi preenchido, mas quem vai clicar em ENTRAR é a pessoa (o envio automático não saiu): o pedido
            // continua valendo, com o prazo maior, para a extensão abrir o processo depois do clique dela.
            case 'manual': {
                if (remetente?.tabId == null || remetente.frameId !== 0) return { ok: false }
                const atual = await deposito.lerIntencao(remetente.tabId)
                if (!atual) return { ok: false }
                await deposito.gravarIntencao(remetente.tabId, { ...atual, manual: true, atualizadoEm: agora })
                return { ok: true }
            }
            case 'cancelar':
                if (remetente?.tabId != null) await deposito.gravarIntencao(remetente.tabId, null)
                return { ok: true }
            default:
                return { ok: false, motivo: 'mensagem-desconhecida' }
        }
    }

    globalThis.PapaSei = { HOSTS, ORIGENS_PAPA, MARCA, VALIDADE_MS, MAX_PAGINAS, chaveNumero, urlLogin, acharConta, novaIntencao, escolherLink, decidir, tratar }
})()
