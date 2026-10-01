import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotaDeAcesso } from '../src/lib/acessoSei.ts'
import type { Processo } from '../src/tipos.ts'

const proc = (extra: Partial<Processo> = {}): Processo => ({ id: 'p', clienteId: 'c', numero: '0010.000001/2026-00', sistema: 'SEI/RO', ...extra })
const CONSULTA = 'https://sei.sistemas.ro.gov.br/sei/processo_acesso_externo_consulta.php?id_acesso_externo=1&infra_hash=abc'
const LOGIN_RO = 'https://sei.sistemas.ro.gov.br/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0'

test('acesso: link enviado por e-mail abre direto', () => {
    const r = rotaDeAcesso(proc({ linkProcesso: CONSULTA, acesso: { forma: 'E-mail atendimento', conta: 'atendimento@x.adv.br' } }))
    assert.equal(r.modo, 'direto')
    assert.equal(r.url, CONSULTA)
    assert.equal(r.urlLogin, LOGIN_RO)
})

test('acesso: forma "Login SEI" ou "SEI GERAL" pede login, mesmo com link guardado — e diz a conta', () => {
    for (const forma of ['Login SEI', 'SEI GERAL']) {
        const r = rotaDeAcesso(proc({ linkProcesso: CONSULTA, acesso: { forma, conta: 'sei@x.com' } }))
        assert.deepEqual(r, { modo: 'login', url: CONSULTA, urlLogin: LOGIN_RO, host: 'sei.sistemas.ro.gov.br', conta: 'sei@x.com' })
    }
})

test('acesso: link guardado que é a própria tela de login é login, qualquer que seja a forma', () => {
    const dnit = 'https://sei.dnit.gov.br/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0'
    const r = rotaDeAcesso(proc({ sistema: 'SEI (órgão federal)', linkProcesso: dnit }))
    assert.equal(r.modo, 'login')
    assert.equal(r.url, dnit)
    assert.equal(r.urlLogin, dnit, 'a tela de login é a do host do link, não a do SEI/RO')
    assert.equal(r.host, 'sei.dnit.gov.br')
})

test('acesso: sem link, vai para a tela de login só quando a planilha diz que o acesso é por conta', () => {
    assert.deepEqual(rotaDeAcesso(proc({ acesso: { forma: 'Login SEI', conta: 'sei@x.com' } })),
        { modo: 'login', url: LOGIN_RO, urlLogin: LOGIN_RO, host: 'sei.sistemas.ro.gov.br', conta: 'sei@x.com' })
    assert.equal(rotaDeAcesso(proc({ acesso: { seiGeral: 'SIM' } })).modo, 'login')
    assert.equal(rotaDeAcesso(proc({ acesso: { forma: 'E-mail atendimento' } })).modo, 'sem-link')
    assert.equal(rotaDeAcesso(proc()).modo, 'sem-link')
    assert.equal(rotaDeAcesso(proc({ sistema: 'PJe (TJRO)', acesso: { forma: 'Login SEI' } })).modo, 'sem-link', 'sem link e sem host conhecido não há o que abrir')
})

test('acesso: link que não é https não é aberto', () => {
    assert.equal(rotaDeAcesso(proc({ linkProcesso: 'C:\\pasta\\processo.pdf' })).modo, 'sem-link')
    assert.equal(rotaDeAcesso(proc({ linkProcesso: 'http://sei.sistemas.ro.gov.br/sei/x.php' })).modo, 'sem-link')
})
