import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { conferirBase, paraHistorico, planejarImportacao, validarRegistro } from '../scripts/lib/importacao.mjs'
import { CHAVES, CHAVES_DE_CONTROLE, LIMITES, erroTamanho } from '../src/lib/limites.mjs'

// Registros como saem do conversor (planilha) e como voltam do banco (com os campos de controle).
const cli = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, tipoPessoa: 'PF', ordem: 0, ...extra })
const proc = (id: string, clienteId: string, numero: string, extra: Record<string, unknown> = {}) => ({ id, clienteId, numero, ordem: 0, ...extra })
const importado = (r: Record<string, unknown>, versao = 1) => ({ ...r, versao, atualizadoPor: 'importação:ana@x.com', atualizadoEm: { seconds: 1 } })
const editado = (r: Record<string, unknown>, versao = 2) => ({ ...r, versao, atualizadoPor: 'ana@x.com', atualizadoEm: { seconds: 2 } })
const base = (clientes: unknown[], processos: unknown[]) => ({ geradoEm: '2026-09-28T10:00', origem: 'Controle_de_Processos.xlsx', clientes, processos })
const porId = (plano: { escritas: { colecao: string; id: string }[] }, colecao: string, id: string) => plano.escritas.find(e => e.colecao === colecao && e.id === id)

test('importação: 1ª carga em banco vazio grava tudo como novo, com o pai apontando para o id certo', () => {
    const b = base([cli('c-ana', 'Ana')], [proc('p-1', 'c-ana', '0001'), proc('p-2', 'c-ana', '0002', { processoPaiId: 'p-1', vinculo: 'derivado' })])
    const plano = planejarImportacao(b)
    assert.deepEqual(plano.resumo, { novos: 3, atualizados: 0, inalterados: 0, forcados: 0, pulados: 0 })
    assert.equal(plano.escritas.every(e => e.motivo === 'novo' && e.anterior === null), true)
    assert.equal(porId(plano, 'papaProcessos', 'p-2')!.dados.processoPaiId, 'p-1')
    assert.equal(plano.avisos.length, 0)
})

test('importação: 2ª carga da mesma planilha não regrava nada (sem versão nova, sem historico)', () => {
    const b = base([cli('c-ana', 'Ana', { observacao: 'x' })], [proc('p-1', 'c-ana', '0001', { status: 'Em andamento', acesso: { forma: 'SEI', termino: '2026-12-01' } })])
    const banco = { clientesNoBanco: [importado(b.clientes[0])], processosNoBanco: [importado(b.processos[0])] }
    const plano = planejarImportacao(b, banco)
    assert.equal(plano.escritas.length, 0)
    assert.equal(plano.resumo.inalterados, 2)
})

test('importação: célula apagada na planilha apaga o campo no banco (a linha é o registro)', () => {
    const noBanco = importado(proc('p-1', 'c-ana', '0001', { status: 'Em andamento', observacao: 'antiga' }))
    const b = base([cli('c-ana', 'Ana')], [proc('p-1', 'c-ana', '0001', { status: 'Arquivado' })])
    const plano = planejarImportacao(b, { clientesNoBanco: [importado(b.clientes[0])], processosNoBanco: [noBanco] })
    const e = porId(plano, 'papaProcessos', 'p-1')!
    assert.equal(e.motivo, 'atualizado')
    assert.equal(e.dados.status, 'Arquivado')
    assert.equal('observacao' in e.dados, false)
    assert.equal(e.anterior, noBanco)
})

test('importação: registro editado pela tela é pulado; com --forcar é sobrescrito e o anterior vai para o historico', () => {
    const noBanco = editado(proc('p-1', 'c-ana', '0001', { status: 'Corrigido na tela' }))
    const b = base([cli('c-ana', 'Ana')], [proc('p-1', 'c-ana', '0001', { status: 'Da planilha' })])
    const banco = { clientesNoBanco: [importado(b.clientes[0])], processosNoBanco: [noBanco] }
    const semForcar = planejarImportacao(b, banco)
    assert.deepEqual(semForcar.pulados, [{ colecao: 'papaProcessos', id: 'p-1', atualizadoPor: 'ana@x.com' }])
    assert.equal(porId(semForcar, 'papaProcessos', 'p-1'), undefined)
    const comForcar = planejarImportacao(b, { ...banco, forcar: true })
    const e = porId(comForcar, 'papaProcessos', 'p-1')!
    assert.equal(e.motivo, 'forcado')
    assert.equal(e.anterior, noBanco)
    assert.equal(comForcar.resumo.forcados, 1)
})

test('importação: registro editado pela tela mas já igual à planilha não conta como pulado', () => {
    const noBanco = editado(proc('p-1', 'c-ana', '0001', { status: 'Igual' }))
    const b = base([cli('c-ana', 'Ana')], [proc('p-1', 'c-ana', '0001', { status: 'Igual' })])
    const plano = planejarImportacao(b, { clientesNoBanco: [importado(b.clientes[0])], processosNoBanco: [noBanco] })
    assert.equal(plano.resumo.pulados, 0)
    assert.equal(plano.resumo.inalterados, 2)
})

test('importação: cliente casa pelo nº do Nexus mesmo com o nome corrigido; os processos seguem o id do banco', () => {
    const noBanco = [importado(cli('c-ana-ltda', 'Ana Ltda', { numeroNexus: '4821' }))]
    const b = base([cli('c-ana-comercio-ltda', 'Ana Comércio Ltda', { numeroNexus: '4821' })], [proc('p-1', 'c-ana-comercio-ltda', '0001')])
    const plano = planejarImportacao(b, { clientesNoBanco: noBanco })
    assert.ok(porId(plano, 'papaClientes', 'c-ana-ltda'), 'atualiza o cliente existente em vez de criar outro')
    assert.equal(porId(plano, 'papaClientes', 'c-ana-comercio-ltda'), undefined)
    assert.equal(porId(plano, 'papaProcessos', 'p-1')!.dados.clienteId, 'c-ana-ltda')
    assert.match(plano.avisos.join('\n'), /passa a se chamar "Ana Comércio Ltda"/)
})

test('importação: nome de cliente corrigido sem nº do Nexus vira cliente novo — e o aviso de provável renomeação aparece', () => {
    const noBanco = { clientesNoBanco: [importado(cli('c-ana', 'Ana'))], processosNoBanco: [importado(proc('p-1', 'c-ana', '0001')), importado(proc('p-2', 'c-ana', '0002'))] }
    const b = base([cli('c-ana-paula', 'Ana Paula')], [proc('p-1', 'c-ana-paula', '0001'), proc('p-2', 'c-ana-paula', '0002')])
    const plano = planejarImportacao(b, noBanco)
    assert.ok(porId(plano, 'papaClientes', 'c-ana-paula'))
    // os processos são os mesmos (id + nº) e mudam para o cliente novo em vez de duplicar
    assert.equal(porId(plano, 'papaProcessos', 'p-1')!.dados.clienteId, 'c-ana-paula')
    assert.equal(plano.escritas.filter(e => e.colecao === 'papaProcessos').length, 2)
    assert.match(plano.avisos.join('\n'), /provável renomeação: "Ana" \(banco\) → "Ana Paula" \(planilha\)/)
    assert.match(plano.avisos.join('\n'), /clientes novos nesta reimportação.*Ana Paula/)
})

test('importação: mesmo nº para OUTRO cliente vira registro separado, sem sobrescrever o do primeiro', () => {
    const banco = { clientesNoBanco: [importado(cli('c-ana', 'Ana'))], processosNoBanco: [importado(proc('p-0001', 'c-ana', '0001'))] }
    const b = base([cli('c-ana', 'Ana'), cli('c-beto', 'Beto')], [proc('p-0001', 'c-ana', '0001'), proc('p-0001-2', 'c-beto', '0001')])
    const plano = planejarImportacao(b, banco)
    assert.equal(porId(plano, 'papaProcessos', 'p-0001'), undefined, 'o de Ana não mudou')
    const deBeto = porId(plano, 'papaProcessos', 'p-0001-2')!
    assert.equal(deBeto.motivo, 'novo')
    assert.equal(deBeto.dados.clienteId, 'c-beto')
    assert.match(plano.avisos.join('\n'), /já existe no banco para outro cliente/)
})

test('importação: ordem trocada de duas linhas com o mesmo nº não troca os ids no banco', () => {
    const banco = {
        clientesNoBanco: [importado(cli('c-ana', 'Ana')), importado(cli('c-beto', 'Beto'))],
        processosNoBanco: [importado(proc('p-0001', 'c-ana', '0001')), importado(proc('p-0001-2', 'c-beto', '0001'))],
    }
    // na planilha nova Beto vem primeiro: o conversor dá p-0001 a ele e p-0001-2 a Ana
    const b = base([cli('c-ana', 'Ana'), cli('c-beto', 'Beto')], [proc('p-0001', 'c-beto', '0001', { status: 'B' }), proc('p-0001-2', 'c-ana', '0001', { status: 'A' })])
    const plano = planejarImportacao(b, banco)
    assert.equal(porId(plano, 'papaProcessos', 'p-0001')!.dados.status, 'A')
    assert.equal(porId(plano, 'papaProcessos', 'p-0001-2')!.dados.status, 'B')
})

test('importação: id novo nunca colide com documento existente', () => {
    const banco = { clientesNoBanco: [importado(cli('c-ana', 'Ana'))], processosNoBanco: [importado(proc('p-0001', 'c-ana', '0001'))] }
    // Beto tem o nº 0001 e a planilha nova NÃO tem mais o 0001 para Ana — mas Ana ainda existe no banco com ele
    const b = base([cli('c-ana', 'Ana'), cli('c-beto', 'Beto')], [proc('p-0001', 'c-beto', '0001')])
    const plano = planejarImportacao(b, banco)
    // sem outra linha do nº para Ana, é mudança de cliente: o registro p-0001 passa para Beto (avisado)
    assert.equal(porId(plano, 'papaProcessos', 'p-0001')!.dados.clienteId, 'c-beto')
    assert.match(plano.avisos.join('\n'), /muda de cliente: "Ana" → "Beto"/)
})

test('importação: desdobramento aponta para o id que o pai tem no banco, não para o slug da planilha', () => {
    // no banco o pai ficou com id p-0001-2 (era o 2º com esse nº); na planilha nova ele é p-0001
    const banco = {
        clientesNoBanco: [importado(cli('c-ana', 'Ana')), importado(cli('c-beto', 'Beto'))],
        processosNoBanco: [importado(proc('p-0001', 'c-beto', '0001')), importado(proc('p-0001-2', 'c-ana', '0001'))],
    }
    const b = base([cli('c-ana', 'Ana')], [proc('p-0001', 'c-ana', '0001'), proc('p-0009', 'c-ana', '0009', { processoPaiId: 'p-0001', vinculo: 'derivado' })])
    const plano = planejarImportacao(b, banco)
    assert.equal(porId(plano, 'papaProcessos', 'p-0009')!.dados.processoPaiId, 'p-0001-2')
})

test('importação: paraHistorico tira o id e nunca deixa undefined (o SDK recusa)', () => {
    const h = paraHistorico({ id: 'p-1', numero: '0001', status: undefined, atualizadoPor: 'importação:a@x', versao: 1 })
    assert.deepEqual(h, { numero: '0001', atualizadoPor: 'importação:a@x', versao: 1 })
    assert.equal(Object.values(h).includes(undefined), false)
})

test('importação: conferirBase barra base de demonstração e arquivo que não é do conversor', () => {
    assert.deepEqual(conferirBase({ origem: 'Controle_de_Processos.xlsx', clientes: [], processos: [] }), [])
    assert.match(conferirBase({ origem: 'x.xlsx (demo enriquecida)', clientes: [], processos: [] })[0], /demonstração/)
    assert.match(conferirBase({ origem: 'Controle_de_Processos_EXEMPLO.xlsx', clientes: [], processos: [] })[0], /demonstração/)
    assert.match(conferirBase({ origem: 'real.xlsx', clientes: [{ linkPasta: 'https://onedrive.live.com/' }], processos: [] })[0], /links-exemplo/)
    assert.equal(conferirBase({ bank: {} }).length, 1)
})

test('validação: o que as regras recusariam é apontado antes de gravar', () => {
    assert.deepEqual(validarRegistro('papaClientes', { nome: 'Ana', tipoPessoa: null, ordem: 3 }), [])
    assert.match(validarRegistro('papaClientes', { nome: 'Ana', tipoPessoa: 'X' })[0], /tipoPessoa/)
    assert.match(validarRegistro('papaClientes', { nome: 'Ana', numeroNexus: null })[0], /numeroNexus não é texto \(null\)/)
    assert.match(validarRegistro('papaClientes', { nome: 'Ana', extra: 1 })[0], /"extra" não existe nas regras/)
    assert.match(validarRegistro('papaProcessos', { clienteId: 'c', numero: 'n', status: 'x'.repeat(61) })[0], /status tem 61 caracteres \(máximo 60\)/)
    assert.match(validarRegistro('papaProcessos', { clienteId: 'c', numero: 'n', vinculo: 'filho' })[0], /vinculo/)
    assert.match(validarRegistro('papaProcessos', { clienteId: 'c', numero: 'n', acesso: { forma: null } })[0], /acesso\.forma é null/)
    assert.deepEqual(validarRegistro('papaProcessos', { clienteId: 'c', numero: 'n', ultimaMovimentacao: { dataHora: '', descricao: 'x' }, acesso: { forma: 'SEI' } }), [])
})

test('limites: formulário e importador usam os mesmos tetos que firestore.rules', () => {
    const regras = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')
    const blocos = { papaClientes: regras.slice(regras.indexOf('/papaClientes/'), regras.indexOf('/papaProcessos/')), papaProcessos: regras.slice(regras.indexOf('/papaProcessos/')) }
    for (const colecao of ['papaClientes', 'papaProcessos'] as const) {
        const bloco = blocos[colecao]
        const nasRegras: Record<string, number> = {}
        for (const m of bloco.matchAll(/texto\('(\w+)', (\d+)\)/g)) nasRegras[m[1]] = Number(m[2])
        for (const m of bloco.matchAll(/data\.(nome|numero)\.size\(\) <= (\d+)/g)) nasRegras[m[1]] = Number(m[2])
        assert.deepEqual(nasRegras, LIMITES[colecao], `tetos de ${colecao}`)
        const hasOnly = bloco.match(/hasOnly\(\[([^\]]+)\]\)/)![1].match(/'([^']+)'/g)!.map(s => s.replace(/'/g, ''))
        assert.deepEqual([...hasOnly].sort(), [...CHAVES[colecao], ...CHAVES_DE_CONTROLE].sort(), `campos de ${colecao}`)
    }
    assert.equal(erroTamanho('papaProcessos', 'status', 'x'.repeat(60)), undefined)
    assert.match(erroTamanho('papaProcessos', 'status', 'x'.repeat(61))!, /61 caracteres \(máximo 60\)/)
    assert.equal(erroTamanho('papaProcessos', 'campoInexistente', 'x'.repeat(999)), undefined)
})
