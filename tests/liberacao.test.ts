import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comLiberacao, soComLiberacao } from '../src/lib/acesso.ts'
import type { Acesso, Base, Processo } from '../src/tipos.ts'

const HOJE = new Date(2026, 9, 1) // 01/10/2026
const proc = (id: string, clienteId: string, acesso?: Acesso): Processo => ({ id, clienteId, numero: id, acesso })

test('liberação: vale o acesso com término hoje ou depois; sem data, só a situação ATIVO', () => {
    assert.equal(comLiberacao(proc('p', 'c', { termino: '2026-10-01' }), HOJE), true, 'vence hoje: ainda vale')
    assert.equal(comLiberacao(proc('p', 'c', { termino: '2027-06-05' }), HOJE), true)
    assert.equal(comLiberacao(proc('p', 'c', { termino: '2026-09-30' }), HOJE), false)
    assert.equal(comLiberacao(proc('p', 'c', { situacao: 'ATIVO' }), HOJE), true)
    assert.equal(comLiberacao(proc('p', 'c', { situacao: 'SEM INFO' }), HOJE), false)
    assert.equal(comLiberacao(proc('p', 'c', { situacao: 'FÍSICO' }), HOJE), false)
    assert.equal(comLiberacao(proc('p', 'c'), HOJE), false)
    assert.equal(comLiberacao(proc('p', 'c', { termino: '2027-01-01', situacao: 'EXPIRADO' }), HOJE), true, 'a data manda sobre a situação digitada')
})

test('liberação: o filtro deixa só os processos liberados e os clientes que têm algum', () => {
    const base: Base = {
        geradoEm: '2026-10-01T08:00',
        clientes: [{ id: 'c-ana', nome: 'Ana', tipoPessoa: 'PF' }, { id: 'c-beto', nome: 'Beto', tipoPessoa: 'PJ' }, { id: 'c-caio', nome: 'Caio', tipoPessoa: 'PF' }],
        processos: [proc('p1', 'c-ana', { termino: '2027-01-01' }), proc('p2', 'c-ana', { termino: '2026-01-01' }), proc('p3', 'c-beto', { situacao: 'EXPIRADO' }), proc('p4', 'c-caio')],
    }
    const filtrada = soComLiberacao(base, HOJE)
    assert.deepEqual(filtrada.clientes.map(c => c.id), ['c-ana'])
    assert.deepEqual(filtrada.processos.map(p => p.id), ['p1'])
    assert.equal(filtrada.geradoEm, base.geradoEm)
})
