import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
    bloqueioExcluirCliente, bloqueioExcluirProcesso, bloqueioRestaurarCliente, bloqueioRestaurarProcesso, separarExcluidos,
} from '../src/lib/exclusao.ts'
import type { Base, Cliente, Processo } from '../src/tipos.ts'

const cli = (id: string, nome: string, extra: Partial<Cliente> = {}): Cliente => ({ id, nome, tipoPessoa: 'PF', ...extra })
const proc = (id: string, clienteId: string, numero: string, extra: Partial<Processo> = {}): Processo => ({ id, clienteId, numero, ...extra })
const fora = { excluidoEm: '2026-09-29T10:00', excluidoPor: 'ana@x.com' }
const base = (clientes: Cliente[], processos: Processo[]): Base => ({ geradoEm: '2026-09-29T10:00', clientes, processos })

test('exclusão: a base ativa some com os excluídos e com os processos de cliente excluído; a lixeira mostra os excluídos', () => {
    const b = base(
        [cli('c-ana', 'Ana'), cli('c-beto', 'Beto', fora)],
        [proc('p-1', 'c-ana', '0001'), proc('p-2', 'c-ana', '0002', fora), proc('p-3', 'c-beto', '0003', fora), proc('p-4', 'c-sem', '0004')],
    )
    const { ativa, lixeira } = separarExcluidos(b)
    assert.deepEqual(ativa.clientes.map(c => c.id), ['c-ana'])
    assert.deepEqual(ativa.processos.map(p => p.id), ['p-1', 'p-4'], 'processo de cliente inexistente continua visível (não é exclusão)')
    assert.deepEqual(lixeira.clientes.map(c => c.id), ['c-beto'])
    assert.deepEqual(lixeira.processos.map(p => p.id), ['p-2', 'p-3'])
})

test('exclusão: cliente com processo ativo e processo com desdobramento ativo não podem ser excluídos', () => {
    const ativos = [proc('p-1', 'c-ana', '0001'), proc('p-1a', 'c-ana', '0001/A', { processoPaiId: 'p-1' }), proc('p-9', 'c-beto', '0009')]
    assert.match(bloqueioExcluirCliente(cli('c-ana', 'Ana'), ativos)!, /ainda tem 2 processos \(0001, 0001\/A\)/)
    assert.equal(bloqueioExcluirCliente(cli('c-caio', 'Caio'), ativos), undefined)
    assert.match(bloqueioExcluirProcesso(ativos[0], ativos)!, /tem 1 desdobramento \(0001\/A\)/)
    assert.equal(bloqueioExcluirProcesso(ativos[1], ativos), undefined)
})

test('exclusão: restaurar é recusado com nome ou nº já em uso, com cliente ou origem ainda na lixeira', () => {
    const b = base(
        [cli('c-ana', 'Ana'), cli('c-ana-2', 'ANA', fora), cli('c-beto', 'Beto', fora)],
        [proc('p-1', 'c-ana', '0038.000001/2026-00'), proc('p-1-2', 'c-ana', '0038000001202600', fora), proc('p-2', 'c-beto', '0002', fora),
            proc('p-3', 'c-ana', '0003', fora), proc('p-3a', 'c-ana', '0003/A', { ...fora, processoPaiId: 'p-3' }), proc('p-5', 'c-ana', '0005', fora)],
    )
    const { ativa, lixeira } = separarExcluidos(b)
    assert.match(bloqueioRestaurarCliente(cli('c-ana-2', 'ANA', fora), ativa.clientes)!, /já existe um cliente ativo com este nome \("Ana"\)/i)
    assert.equal(bloqueioRestaurarCliente(cli('c-beto', 'Beto', fora), ativa.clientes), undefined)
    const achar = (id: string) => b.processos.find(p => p.id === id)!
    assert.match(bloqueioRestaurarProcesso(achar('p-1-2'), ativa, lixeira)!, /já existe um processo ativo com este número/i)
    assert.match(bloqueioRestaurarProcesso(achar('p-2'), ativa, lixeira)!, /cliente deste processo está na lixeira/)
    assert.match(bloqueioRestaurarProcesso(achar('p-3a'), ativa, lixeira)!, /origem \(0003\) está na lixeira/)
    assert.equal(bloqueioRestaurarProcesso(achar('p-5'), ativa, lixeira), undefined)
})
