import { test } from 'node:test'
import assert from 'node:assert/strict'
import '../extensao/logica.js' // publica globalThis.PapaSei (o arquivo também é carregado por importScripts e como content script)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PapaSei = (globalThis as any).PapaSei
const { novaIntencao, escolherLink, decidir, tratar, acharConta, urlLogin, MARCA, VALIDADE_MS } = PapaSei

const RO = 'sei.sistemas.ro.gov.br'
const CONTAS = [
    { host: RO, email: 'geral@escritorio.com', senha: 'segredo-geral', padrao: true },
    { host: RO, email: 'ana@escritorio.com', senha: 'segredo-ana', padrao: false },
    { host: 'sei.dnit.gov.br', email: 'ana@escritorio.com', senha: 'segredo-dnit', padrao: false },
]
const T0 = 1_000_000
const intencao = (extra: Record<string, unknown> = {}) => ({ ...novaIntencao({ numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, CONTAS, T0).intencao, ...extra })
const pagina = (extra: Record<string, unknown> = {}) => ({ temLogin: false, temCaptcha: false, links: [], temProxima: false, temSair: false, linkControle: '', noControle: true, ...extra })
const link = (indice: number, texto: string, linha = '') => ({ indice, texto, href: `https://${RO}/sei/processo_acesso_externo_consulta.php?id_acesso_externo=${indice}`, linha })

test('extensão: o pedido do PAPA só vira intenção com SEI atendido e conta com senha salva', () => {
    const r = novaIntencao({ numero: ' 0010.222222/2026-22 ', conta: 'ANA@escritorio.com', host: RO }, CONTAS, T0)
    assert.equal(r.ok, true)
    assert.equal(r.url, urlLogin(RO) + MARCA)
    assert.equal(r.intencao.conta, 'ana@escritorio.com')
    assert.equal(r.intencao.numero, '0010.222222/2026-22')
    assert.equal(novaIntencao({ numero: '1', host: 'sei.exemplo.gov.br' }, CONTAS, T0).motivo, 'host')
    assert.equal(novaIntencao({ numero: '', host: RO }, CONTAS, T0).motivo, 'numero')
    const semSenha = novaIntencao({ numero: '0001', conta: 'outra@escritorio.com', host: RO }, CONTAS, T0)
    assert.equal(semSenha.motivo, 'sem-senha')
    assert.match(semSenha.mensagem, /não tem a senha da conta outra@escritorio\.com/)
    // sem conta no processo: vale a conta padrão daquele SEI; sem padrão e com mais de uma conta, não adivinha
    assert.equal(novaIntencao({ numero: '0001', host: RO }, CONTAS, T0).intencao.conta, 'geral@escritorio.com')
    assert.equal(novaIntencao({ numero: '0001', host: RO }, CONTAS.map(c => ({ ...c, padrao: false })), T0).motivo, 'sem-senha')
    assert.equal(acharConta(CONTAS, 'sei.dnit.gov.br', '').senha, 'segredo-dnit', 'conta única do SEI serve de padrão')
})

test('extensão: na lista de acessos, acha o processo pelos dígitos e prefere a liberação de validade mais distante', () => {
    const links = [link(0, '0010.111111/2026-11'), link(1, '0010.222222/2026-22', '0010.222222/2026-22 Integral 10/01/2026 10/07/2026'),
        link(2, ' 0010.222222/2026-22 ', '0010.222222/2026-22 Integral 05/06/2026 05/06/2027'), link(3, 'Ajuda')]
    assert.equal(escolherLink(links, '0010222222202622').indice, 2)
    assert.equal(escolherLink(links, '0010.999999/2026-99'), null)
    assert.equal(escolherLink(undefined, '0010.222222/2026-22'), null)
})

test('extensão: caminho feliz — preenche o login uma vez, abre o processo na lista e encerra', () => {
    let i = intencao()
    let d = decidir(i, pagina({ temLogin: true }), T0 + 1)
    assert.equal(d.acao, 'preencher-login')
    i = d.intencao
    d = decidir(i, pagina({ links: [link(0, '0010.111111/2026-11'), link(1, '0010.222222/2026-22')] }), T0 + 2)
    assert.equal(d.acao, 'abrir-processo')
    assert.equal(d.indice, 1)
    assert.match(d.href, /id_acesso_externo=1$/)
    const abrindo = d.intencao
    d = decidir(abrindo, pagina(), T0 + 3)
    assert.deepEqual(d, { acao: 'concluido', intencao: null })
    // se em vez do processo voltar a tela de login (sessão caiu), não manda a senha uma segunda vez
    const caiu = decidir(abrindo, pagina({ temLogin: true }), T0 + 3)
    assert.equal(caiu.acao, 'parar')
    assert.match(caiu.mensagem, /pediu login de novo/)
})

test('extensão: login recusado NUNCA é tentado de novo — para e avisa', () => {
    const depois = decidir(intencao(), pagina({ temLogin: true }), T0 + 1).intencao
    const d = decidir(depois, pagina({ temLogin: true }), T0 + 2)
    assert.equal(d.acao, 'parar')
    assert.equal(d.intencao, null)
    assert.match(d.mensagem, /não aceitou o login da conta ana@escritorio\.com.*Não tentei de novo/)
    // mesmo que o SEI passe a pedir captcha depois da recusa, a extensão não insiste
    assert.equal(decidir(depois, pagina({ temLogin: true, temCaptcha: true }), T0 + 2).acao, 'parar')
})

test('extensão: captcha não é resolvido — preenche, espera a pessoa e depois continua', () => {
    let d = decidir(intencao(), pagina({ temLogin: true, temCaptcha: true }), T0 + 1)
    assert.equal(d.acao, 'aguardar-captcha')
    assert.match(d.mensagem, /digite o código e clique em Acessar/)
    // a pessoa errou o código: a tela de login volta com captcha novo → continua esperando por ela
    d = decidir(d.intencao, pagina({ temLogin: true, temCaptcha: true }), T0 + 60_000)
    assert.equal(d.acao, 'aguardar-captcha')
    // ela acertou: a lista aparece e o processo é aberto
    d = decidir(d.intencao, pagina({ links: [link(0, '0010.222222/2026-22')] }), T0 + 120_000)
    assert.equal(d.acao, 'abrir-processo')
})

test('extensão: procura nas páginas seguintes da lista e desiste com aviso quando o processo não está', () => {
    let i = decidir(intencao(), pagina({ temLogin: true }), T0 + 1).intencao
    let d = decidir(i, pagina({ links: [link(0, '0010.111111/2026-11')], temProxima: true }), T0 + 2)
    assert.equal(d.acao, 'proxima-pagina')
    assert.equal(d.intencao.paginas, 1)
    d = decidir(d.intencao, pagina({ links: [link(0, '0010.333333/2026-33')] }), T0 + 3)
    assert.equal(d.acao, 'parar')
    assert.match(d.mensagem, /Não achei o processo 0010\.222222\/2026-22 na lista de acessos externos da conta ana@escritorio\.com/)
    // lista sem fim: para depois de MAX_PAGINAS
    i = { ...i, paginas: PapaSei.MAX_PAGINAS }
    assert.equal(decidir(i, pagina({ temProxima: true }), T0 + 2).acao, 'parar')
})

test('extensão: depois do login cai numa página que não é a lista → vai à lista de acessos uma vez', () => {
    const i = decidir(intencao(), pagina({ temLogin: true }), T0 + 1).intencao
    const controle = `https://${RO}/sei/controlador_externo.php?acao=usuario_externo_controle_acessos&infra_hash=x`
    let d = decidir(i, pagina({ noControle: false, linkControle: controle }), T0 + 2)
    assert.deepEqual([d.acao, d.href], ['ir', controle])
    d = decidir(d.intencao, pagina({ noControle: false, linkControle: controle }), T0 + 3)
    assert.equal(d.acao, 'parar', 'não fica indo e voltando')
})

test('extensão: outra conta já logada e sem o processo → sai, entra com a conta certa e segue', () => {
    let d = decidir(intencao(), pagina({ links: [link(0, '0010.111111/2026-11')], temSair: true }), T0 + 1)
    assert.equal(d.acao, 'sair')
    d = decidir(d.intencao, pagina({ temLogin: true }), T0 + 2)
    assert.equal(d.acao, 'preencher-login')
    // se o processo ESTÁ na lista da conta que já estava logada, abre direto, sem login
    assert.equal(decidir(intencao(), pagina({ links: [link(0, '0010.222222/2026-22')], temSair: true }), T0 + 1).acao, 'abrir-processo')
    // saiu e o SEI não mostrou a tela de login: vai até ela uma vez
    const saiu = decidir(intencao(), pagina({ temSair: true }), T0 + 1).intencao
    const ir = decidir(saiu, pagina(), T0 + 2)
    assert.deepEqual([ir.acao, ir.href], ['ir', urlLogin(RO)])
    assert.equal(decidir(ir.intencao, pagina(), T0 + 3).acao, 'parar')
})

test('extensão: pedido parado expira e aba sem pedido não faz nada', () => {
    assert.deepEqual(decidir(intencao(), pagina({ temLogin: true }), T0 + VALIDADE_MS + 1), { acao: 'nenhuma', intencao: null })
    assert.deepEqual(decidir(null, pagina({ temLogin: true }), T0), { acao: 'nenhuma', intencao: null })
})

// Depósito em memória no lugar do navegador.
function deposito(contas = CONTAS) {
    const pedidos = new Map<number, unknown>()
    const abertas: { url: string; origem: number }[] = []
    return {
        pedidos, abertas,
        lerContas: async () => contas,
        lerIntencao: async (tabId: number) => pedidos.get(tabId) ?? null,
        gravarIntencao: async (tabId: number, i: unknown) => { if (i) pedidos.set(tabId, i); else pedidos.delete(tabId) },
        abrirAba: async (url: string, origem: number) => { abertas.push({ url, origem }); return 77 },
    }
}
const doPapa = { origem: 'https://papa-85025.web.app', url: 'https://papa-85025.web.app/', tabId: 5, frameId: 0 }
const doSei = (caminho = '/sei/controlador_externo.php?acao=usuario_externo_logar') => ({ origem: `https://${RO}`, url: `https://${RO}${caminho}`, tabId: 77, frameId: 0 })

test('extensão: só o PAPA pode pedir a abertura; a aba nova nasce na tela de login com a marca', async () => {
    const d = deposito()
    const pedido = { tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }
    assert.equal((await tratar(pedido, { ...doPapa, origem: 'https://site-qualquer.com' }, d, T0)).motivo, 'origem')
    assert.equal(d.abertas.length, 0)
    assert.deepEqual(await tratar(pedido, doPapa, d, T0), { ok: true, conta: 'ana@escritorio.com' })
    assert.deepEqual(d.abertas, [{ url: urlLogin(RO) + MARCA, origem: 5 }])
    assert.equal((d.pedidos.get(77) as { etapa: string }).etapa, 'entrar')
    // conta sem senha salva: não abre aba nenhuma
    const semSenha = await tratar({ ...pedido, conta: 'outra@escritorio.com' }, doPapa, d, T0)
    assert.equal(semSenha.ok, false)
    assert.equal(d.abertas.length, 1)
})

test('extensão: a senha só sai no passo de login, para a aba do pedido, no SEI da conta e em https', async () => {
    const d = deposito()
    await tratar({ tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, doPapa, d, T0)
    // outra aba do mesmo SEI (aberta pela pessoa) não recebe nada
    assert.deepEqual(await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, { ...doSei(), tabId: 99 }, d, T0 + 1), { acao: 'nenhuma' })
    // a aba do pedido, mas num iframe ou noutro site: nada, e o pedido é cancelado
    assert.deepEqual(await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, { ...doSei(), frameId: 3 }, d, T0 + 1), { acao: 'nenhuma' })
    assert.ok(d.pedidos.has(77))
    assert.deepEqual(await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, { ...doSei(), url: 'https://sei.dnit.gov.br/sei/x' }, d, T0 + 1), { acao: 'nenhuma' })
    assert.equal(d.pedidos.has(77), false, 'pedido cancelado quando a aba aparece em outro site')

    await tratar({ tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, doPapa, d, T0)
    assert.deepEqual(await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, { ...doSei(), url: `http://${RO}/sei/x` }, d, T0 + 1), { acao: 'nenhuma' }, 'http não recebe senha')

    await tratar({ tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, doPapa, d, T0)
    const login = await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, doSei(), d, T0 + 1)
    assert.equal(login.acao, 'preencher-login')
    assert.deepEqual(login.credencial, { email: 'ana@escritorio.com', senha: 'segredo-ana' })
    // os passos seguintes não carregam credencial
    const lista = await tratar({ tipo: 'passo', pagina: pagina({ links: [link(4, '0010.222222/2026-22')] }) }, doSei('/sei/controlador_externo.php?acao=usuario_externo_controle_acessos'), d, T0 + 2)
    assert.equal(lista.acao, 'abrir-processo')
    assert.equal('credencial' in lista, false)
    const fim = await tratar({ tipo: 'passo', pagina: pagina() }, doSei('/sei/processo_acesso_externo_consulta.php?id_acesso_externo=4'), d, T0 + 3)
    assert.equal(fim.acao, 'concluido')
    assert.equal(d.pedidos.has(77), false)
})

test('extensão: cancelar apaga o pedido da aba; conta removida no meio do caminho para com aviso', async () => {
    const d = deposito()
    await tratar({ tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, doPapa, d, T0)
    assert.deepEqual(await tratar({ tipo: 'cancelar' }, doSei(), d, T0 + 1), { ok: true })
    assert.equal(d.pedidos.has(77), false)

    const contas = [...CONTAS]
    const d2 = deposito(contas)
    await tratar({ tipo: 'abrir', numero: '0010.222222/2026-22', conta: 'ana@escritorio.com', host: RO }, doPapa, d2, T0)
    contas.splice(1, 1) // a conta da Ana no SEI/RO foi removida da extensão
    const r = await tratar({ tipo: 'passo', pagina: pagina({ temLogin: true }) }, doSei(), d2, T0 + 1)
    assert.equal(r.acao, 'parar')
    assert.equal('credencial' in r, false)
    assert.equal(d2.pedidos.has(77), false)
})

test('extensão: os SEIs da lógica são os mesmos do manifest', async () => {
    const { readFileSync } = await import('node:fs')
    const manifesto = JSON.parse(readFileSync(new URL('../extensao/manifest.json', import.meta.url), 'utf8'))
    const doManifesto = manifesto.content_scripts[0].matches.map((m: string) => new URL(m.replace('*', 'x')).host).sort()
    assert.deepEqual(doManifesto, Object.keys(PapaSei.HOSTS).sort())
    const origens = manifesto.content_scripts[1].matches.map((m: string) => new URL(m.replace('*', 'x')).origin).sort()
    assert.deepEqual(origens, [...PapaSei.ORIGENS_PAPA].sort())
})
