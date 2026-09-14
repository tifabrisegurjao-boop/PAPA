import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoAcesso, semAcesso } from '../src/lib/acesso.ts'
import { montarArvore } from '../src/lib/arvore.ts'
import { buscarProcessos, filtrarClientes, normalizar } from '../src/lib/busca.ts'
import { diasAte, formatarDataHora } from '../src/lib/formatacao.ts'
import { erroNomeCliente, erroNumero } from '../src/lib/validacao.ts'
import { paginar } from '../src/lib/paginacao.ts'
import type { Cliente, Processo } from '../src/tipos.ts'

const proc = (id: string, processoPaiId?: string, extra: Partial<Processo> = {}): Processo =>
    ({ id, clienteId: 'c1', numero: id, processoPaiId, ...extra })

const ids = (nos: { processo: Processo }[]) => nos.map(n => n.processo.id)

test('árvore: principais na ordem da planilha, desdobramentos em qualquer profundidade', () => {
    const { raizes, orfaos } = montarArvore([proc('A'), proc('A1', 'A'), proc('B'), proc('A1a', 'A1'), proc('A2', 'A')])
    assert.deepEqual(ids(raizes), ['A', 'B'])
    assert.deepEqual(ids(raizes[0].filhos), ['A1', 'A2'])
    assert.deepEqual(ids(raizes[0].filhos[0].filhos), ['A1a'])
    assert.deepEqual(orfaos, [])
})

test('árvore: pai inexistente não some — vira principal e é avisado', () => {
    const { raizes, orfaos } = montarArvore([proc('A'), proc('X', 'nao-encontrado:0010.000001/2026-00')])
    assert.deepEqual(ids(raizes), ['A', 'X'])
    assert.deepEqual(orfaos.map(p => p.id), ['X'])
})

test('árvore: ciclo vira principal; quem só descende do ciclo continua pendurado', () => {
    const { raizes, orfaos } = montarArvore([proc('A', 'B'), proc('B', 'A'), proc('C', 'A'), proc('S', 'S')])
    assert.deepEqual(ids(raizes), ['A', 'B', 'S'])
    assert.deepEqual(orfaos.map(p => p.id), ['A', 'B', 'S'])
    assert.deepEqual(ids(raizes[0].filhos), ['C'])
})

test('árvore: id repetido na planilha não esconde linha', () => {
    const { raizes } = montarArvore([proc('A'), proc('A')])
    assert.equal(raizes.length, 2)
})

test('normalizar segue a chave do Nexus', () => {
    assert.equal(normalizar('  José-da-Silva. '), 'jose da silva')
    assert.equal(normalizar('JOSÉ  DA  SILVA'), 'jose da silva')
})

test('busca por nome sem acento e por nº do processo com ou sem pontuação', () => {
    const clientes: Cliente[] = [
        { id: 'c1', nome: 'João Pedro Martins', tipoPessoa: 'PF' },
        { id: 'c2', nome: 'Alfa Serviços Ltda.', tipoPessoa: 'PJ' },
    ]
    const processos = [proc('p1', undefined, { clienteId: 'c2', numero: '0029.000981/2026-14' })]
    assert.deepEqual(filtrarClientes(clientes, processos, 'joao').map(c => c.id), ['c1'])
    assert.deepEqual(filtrarClientes(clientes, processos, 'servicos ltda').map(c => c.id), ['c2'])
    assert.deepEqual(filtrarClientes(clientes, processos, '0029.000981').map(c => c.id), ['c2'])
    assert.deepEqual(filtrarClientes(clientes, processos, '0029000981').map(c => c.id), ['c2'])
    assert.equal(filtrarClientes(clientes, processos, '   ').length, 2)
})

test('data e hora formatadas pelo texto, sem deslocar fuso', () => {
    assert.equal(formatarDataHora('2026-03-10T14:32'), '10/03/2026 às 14:32')
    assert.equal(formatarDataHora('2026-03-10 23:59'), '10/03/2026 às 23:59')
    assert.equal(formatarDataHora('2026-03-10'), '10/03/2026')
    assert.equal(formatarDataHora('ontem'), 'ontem')
})

test('busca híbrida: por número lista os processos e os clientes donos deles', () => {
    const clientes: Cliente[] = [
        { id: 'c1', nome: 'João Pedro Martins', tipoPessoa: 'PF' },
        { id: 'c2', nome: 'Alfa Serviços Ltda.', tipoPessoa: 'PJ' },
    ]
    const processos = [
        proc('p1', undefined, { clienteId: 'c2', numero: '0029.000981/2026-14' }),
        proc('p2', undefined, { clienteId: 'c1', numero: '0010.000981/2020-55' }),
    ]
    assert.deepEqual(buscarProcessos(processos, '000981').map(p => p.id), ['p1', 'p2'])
    assert.deepEqual(buscarProcessos(processos, '0029000981').map(p => p.id), ['p1'])
    assert.deepEqual(buscarProcessos(processos, '981'), [], 'menos de 4 dígitos não busca por número')
    assert.deepEqual(filtrarClientes(clientes, processos, '000981').map(c => c.id), ['c1', 'c2'])
})

test('acesso: a data de término manda; sem data vale a situação digitada', () => {
    const hoje = new Date(2026, 8, 11, 12, 0)
    assert.equal(estadoAcesso(proc('a', undefined, { acesso: { termino: '2026-09-10', situacao: 'ATIVO' } }), hoje), 'expirado')
    assert.equal(estadoAcesso(proc('b', undefined, { acesso: { termino: '2026-09-11' } }), hoje), 'a-vencer')
    assert.equal(estadoAcesso(proc('c', undefined, { acesso: { termino: '2026-12-01' } }), hoje), 'ok')
    assert.equal(estadoAcesso(proc('d', undefined, { acesso: { situacao: 'EXPIRADO' } }), hoje), 'expirado')
    assert.equal(estadoAcesso(proc('e', undefined, { acesso: { situacao: 'SEM INFO' } }), hoje), 'sem-info')
    assert.equal(estadoAcesso(proc('f', undefined, { acesso: { situacao: 'FÍSICO' } }), hoje), 'fisico')
    assert.equal(estadoAcesso(proc('g'), hoje), 'desconhecido')
    assert.equal(semAcesso(proc('a', undefined, { acesso: { termino: '2026-09-10' } }), hoje), true)
    assert.equal(semAcesso(proc('e', undefined, { acesso: { situacao: 'SEM INFO' } }), hoje), false)
})

test('dias até o término do acesso contam pelo dia local, inclusive às 23h', () => {
    const hoje = new Date(2026, 8, 11, 23, 30) // 11/09/2026 23:30 local
    assert.equal(diasAte('2026-09-11', hoje), 0)
    assert.equal(diasAte('2026-09-18', hoje), 7)
    assert.equal(diasAte('2026-09-10', hoje), -1)
    assert.equal(diasAte('sem data', hoje), null)
})

test('validação: nº único só é conferido quando o nº mudou; compara pelos dígitos', () => {
    const a = proc('p-a', undefined, { numero: '0041.898448/2025-07' })
    const aRepetido = proc('p-a-2', undefined, { numero: '0041.898448/2025-07' })
    const b = proc('p-b', undefined, { numero: '0010.000001/2020-11' })
    const todos = [a, aRepetido, b]
    assert.equal(erroNumero('0041.898448/2025-07', aRepetido, todos), undefined, 'registro que já veio repetido continua editável')
    assert.match(erroNumero('0010.000001/2020-11', aRepetido, todos)!, /Já existe/, 'trocar para o nº de outro registro é recusado')
    assert.match(erroNumero('0010000001202011', aRepetido, todos)!, /Já existe/, 'sem pontuação também é o mesmo nº')
    assert.equal(erroNumero('0099.000001/2026-00', undefined, todos), undefined, 'cadastro com nº novo passa')
    assert.match(erroNumero('   ', undefined, todos)!, /Informe/)
})

test('validação: nome de cliente único sem acento nem caixa, exceto o próprio', () => {
    const c1: Cliente = { id: 'c1', nome: 'José da Silva', tipoPessoa: 'PF' }
    const c2: Cliente = { id: 'c2', nome: 'Alfa Ltda', tipoPessoa: 'PJ' }
    assert.match(erroNomeCliente('JOSE DA SILVA', undefined, [c1, c2])!, /Já existe/)
    assert.equal(erroNomeCliente('José da Silva', c1, [c1, c2]), undefined)
    assert.equal(erroNomeCliente('Beta Ltda', undefined, [c1, c2]), undefined)
})

test('paginação: 15 por página, página fora do intervalo cai no limite', () => {
    const lista = Array.from({ length: 54 }, (_, i) => i + 1)
    const p1 = paginar(lista, 1)
    assert.deepEqual([p1.itens.length, p1.inicio, p1.fim, p1.totalPaginas], [15, 1, 15, 4])
    const p4 = paginar(lista, 4)
    assert.deepEqual([p4.itens, p4.inicio, p4.fim], [[46, 47, 48, 49, 50, 51, 52, 53, 54], 46, 54])
    assert.equal(paginar(lista, 9).pagina, 4, 'acima do total cai na última (busca encolheu a lista)')
    assert.equal(paginar(lista, 0).pagina, 1)
    const vazia = paginar([], 3)
    assert.deepEqual([vazia.pagina, vazia.totalPaginas, vazia.inicio, vazia.fim, vazia.itens.length], [1, 1, 0, 0, 0])
    assert.equal(paginar(Array.from({ length: 15 }), 1).totalPaginas, 1, 'exatamente 15 não pagina')
})
