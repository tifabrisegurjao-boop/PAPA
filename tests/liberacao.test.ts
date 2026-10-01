import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comLiberacao, soComLiberacao } from '../src/lib/acesso.ts'
import { montarArvore, montarArvoreFiltrada, type NoArvore } from '../src/lib/arvore.ts'
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

// Árvore do painel do cliente com o filtro ligado (montarArvoreFiltrada). O desenho "A[B[C],D]" compara forma e ordem.
const LIBERADO: Acesso = { situacao: 'ATIVO' }
const EXPIRADO: Acesso = { situacao: 'EXPIRADO' }
const ramo = (id: string, acesso: Acesso, pai?: string): Processo => ({ ...proc(id, 'c', acesso), numero: `nº ${id}`, processoPaiId: pai })
const desenho = (nos: NoArvore[]): string => nos.map(n => n.processo.id + (n.filhos.length ? `[${desenho(n.filhos)}]` : '')).join(',')
const filtrar = (todos: Processo[]) => montarArvoreFiltrada(todos, todos.filter(p => comLiberacao(p, HOJE)))

test('árvore filtrada: sem filtro é a mesma árvore de sempre, erros de planilha inclusive', () => {
    const todos = [ramo('A', LIBERADO), ramo('A1', EXPIRADO, 'A'), ramo('B', EXPIRADO), ramo('A1a', LIBERADO, 'A1'), ramo('X', LIBERADO, 'nao-existe')]
    const inteira = montarArvore(todos)
    const mesma = montarArvoreFiltrada(todos, todos)
    assert.equal(desenho(mesma.raizes), desenho(inteira.raizes))
    assert.equal(desenho(mesma.raizes), 'A[A1[A1a]],B,X')
    assert.deepEqual(mesma.orfaos.map(p => p.id), inteira.orfaos.map(p => p.id))
    assert.equal(mesma.origemOculta.size, 0)
})

test('árvore filtrada: só entra processo com liberação; quem perde a origem sobe para o ancestral visível mais próximo', () => {
    const { raizes, orfaos, origemOculta } = filtrar([ramo('A', LIBERADO), ramo('B', EXPIRADO, 'A'), ramo('C', LIBERADO, 'B'), ramo('D', EXPIRADO), ramo('E', LIBERADO, 'A')])
    assert.equal(desenho(raizes), 'A[C,E]', 'B e D (expirados) ficam de fora; C sobe para A')
    assert.deepEqual(orfaos, [], 'origem escondida pelo filtro não é erro de planilha')
    assert.equal(origemOculta.size, 0)
})

test('árvore filtrada: sem ancestral visível, o desdobramento fica solto e guarda o nº da origem', () => {
    const { raizes, orfaos, origemOculta } = filtrar([ramo('B', EXPIRADO), ramo('C', LIBERADO, 'B'), ramo('D', LIBERADO, 'C'), ramo('F', LIBERADO)])
    assert.equal(desenho(raizes), 'C[D],F')
    assert.deepEqual(orfaos, [])
    assert.deepEqual([...origemOculta], [['C', 'nº B']], 'só o C perdeu a origem; o D continua pendurado nele')
    assert.equal(raizes[0].processo.processoPaiId, undefined)
})

test('árvore filtrada: erro de planilha continua avisado; ciclo escondido não trava nem vira erro', () => {
    const { raizes, orfaos, origemOculta } = filtrar([
        ramo('X', LIBERADO, 'nao-existe'), // origem inexistente: erro de verdade, com ou sem filtro
        ramo('P', EXPIRADO, 'Q'), ramo('Q', EXPIRADO, 'P'), // ciclo entre dois escondidos
        ramo('Y', LIBERADO, 'P'), // pendurado no ciclo escondido: solto, sem ser erro
    ])
    assert.equal(desenho(raizes), 'X,Y')
    assert.deepEqual(orfaos.map(p => p.id), ['X'])
    assert.deepEqual([...origemOculta], [['Y', 'nº P']])
})
