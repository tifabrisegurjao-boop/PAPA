// Regras PURAS da importação planilha → Firestore (sem rede, sem Firebase), testadas em tests/importacao.test.ts.
// scripts/enviar-firestore.mjs só faz o que precisa de rede: login, ler o banco, chamar planejarImportacao() e gravar o plano.
//
// Decisões (28/09/2026, depois da auditoria de prontidão):
//   - A LINHA DA PLANILHA É O REGISTRO: na reimportação o documento é montado só com o que a linha traz. Célula apagada
//     apaga o campo no banco (antes era um merge com o registro antigo e nada nunca sumia). A planilha v2 tem todas as
//     colunas que a tela edita, então nada se perde por isso.
//   - Registro igual ao que já está no banco não é regravado (sem versão nova, sem historico, sem gasto de escrita).
//   - Registro editado pela TELA (atualizadoPor sem o prefixo "importação:") é pulado, salvo --forcar; o anterior vai para historico/.
//   - Casamento do cliente: id → nº do Nexus → nome normalizado. Do processo: id (mesmo cliente) → nº + mesmo cliente →
//     id com cliente diferente (mudança de cliente, se a planilha não tem outra linha desse nº para o cliente antigo) → novo.
//     Nº repetido para outro cliente vira registro separado (id com -2, -3…), nunca sobrescreve o do outro.
//   - processoPaiId aponta para o id que o pai tem NO BANCO (remapeado), não para o slug da planilha.
//   - Nada é apagado: linha que sumiu da planilha continua no banco (a exclusão lógica é pendência da tela).
import { CHAVES, LIMITES } from '../../src/lib/limites.mjs'

export const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.,\-/_]+/g, ' ').replace(/\s+/g, ' ').trim()
export const soDigitos = t => String(t ?? '').replace(/\D/g, '')
export const chaveNumero = n => (soDigitos(n).length >= 4 ? soDigitos(n) : normalizar(n))

/** Prefixo de `atualizadoPor` das gravações feitas por importação (as regras aceitam "importação:<e-mail do token>"). */
export const IMPORTACAO = 'importação:'
export const editadoNoPainel = registro => !!registro?.atualizadoPor && !String(registro.atualizadoPor).startsWith(IMPORTACAO)

/** Motivos para recusar um arquivo antes de qualquer login: base de demonstração ou arquivo que não é a saída do conversor. */
export function conferirBase(base) {
    const erros = []
    if (!base || !Array.isArray(base.clientes) || !Array.isArray(base.processos)) {
        erros.push('o arquivo não tem as listas "clientes" e "processos" — é o JSON gerado por `npm run dados`?')
        return erros
    }
    const origem = String(base.origem ?? '')
    if (/demo|exemplo|fict[ií]c/i.test(origem)) erros.push(`a origem registrada é "${origem}" (base de demonstração)`)
    if (base.clientes.some(c => c.linkPasta === 'https://onedrive.live.com/'))
        erros.push('há links de pasta de exemplo (https://onedrive.live.com/), marca de `npm run dados:links-exemplo`, que só existe para a demo')
    return erros
}

const ehMapa = v => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Confere um documento (sem os campos de controle) contra o que firestore.rules aceita. Vazio = passa. */
export function validarRegistro(colecao, dados) {
    const chaves = CHAVES[colecao]
    if (!chaves) return [`coleção desconhecida: ${colecao}`]
    const erros = []
    for (const k of Object.keys(dados)) if (!chaves.includes(k)) erros.push(`campo "${k}" não existe nas regras`)
    if (colecao === 'papaClientes') {
        if (typeof dados.nome !== 'string' || !dados.nome) erros.push('nome vazio')
        if (!(dados.tipoPessoa == null || dados.tipoPessoa === 'PF' || dados.tipoPessoa === 'PJ')) erros.push(`tipoPessoa "${dados.tipoPessoa}" (só PF, PJ ou vazio)`)
    } else {
        if (typeof dados.clienteId !== 'string' || !dados.clienteId) erros.push('clienteId vazio')
        if (typeof dados.numero !== 'string' || !dados.numero) erros.push('numero vazio')
        if (dados.vinculo !== undefined && !['derivado', 'relacionado'].includes(dados.vinculo)) erros.push(`vinculo "${dados.vinculo}" (só derivado ou relacionado)`)
        if (dados.ultimaMovimentacao !== undefined && !ehMapa(dados.ultimaMovimentacao)) erros.push('ultimaMovimentacao não é um objeto')
        if (dados.acesso !== undefined && !ehMapa(dados.acesso)) erros.push('acesso não é um objeto')
    }
    for (const [campo, max] of Object.entries(LIMITES[colecao])) {
        const v = dados[campo]
        if (v === undefined) continue
        if (typeof v !== 'string') erros.push(`${campo} não é texto (${v === null ? 'null' : typeof v}); as regras só aceitam texto ou campo ausente`)
        else if (v.length > max) erros.push(`${campo} tem ${v.length} caracteres (máximo ${max})`)
    }
    if (dados.ordem !== undefined && typeof dados.ordem !== 'number') erros.push('ordem não é número')
    // Firestore recusa undefined em qualquer profundidade; as regras não aceitam null nos campos de texto.
    const acharVazio = (obj, caminho) => {
        for (const [k, v] of Object.entries(obj)) {
            if (v === undefined) erros.push(`${caminho}${k} é undefined`)
            else if (v === null && !(colecao === 'papaClientes' && k === 'tipoPessoa' && caminho === '')) erros.push(`${caminho}${k} é null`)
            else if (ehMapa(v)) acharVazio(v, `${caminho}${k}.`)
        }
    }
    acharVazio(dados, '')
    return erros
}

/** Documento de historico a partir do que estava no banco: sem a chave `id` (que o leitor acrescenta) e sem undefined. */
export function paraHistorico(anterior) {
    const { id: _id, ...resto } = anterior
    return Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined))
}

const idLivre = (base, usados) => {
    if (!usados.has(base)) return base
    for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`
}
const ordenar = v => (Array.isArray(v) ? v.map(ordenar) : ehMapa(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, ordenar(v[k])])) : v)
const iguais = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b))
const semControle = ({ id: _i, versao: _v, atualizadoEm: _e, atualizadoPor: _p, ...conteudo }) => conteudo

/**
 * Decide, sem gravar nada, o que a importação faria com o banco como está.
 * @returns {{ escritas: {colecao, id, dados, anterior, motivo}[], pulados: {colecao, id, atualizadoPor}[], avisos: string[],
 *            resumo: {novos, atualizados, inalterados, forcados, pulados}, novosClientes: string[] }}
 */
export function planejarImportacao(base, { clientesNoBanco = [], processosNoBanco = [], forcar = false } = {}) {
    const escritas = [], pulados = [], avisos = [], novosClientes = []
    const resumo = { novos: 0, atualizados: 0, inalterados: 0, forcados: 0, pulados: 0 }
    const reimportacao = clientesNoBanco.length > 0 || processosNoBanco.length > 0

    const decidir = (colecao, id, dados, existente) => {
        const limpo = JSON.parse(JSON.stringify(dados)) // tira undefined, como o gravador da tela
        if (!existente) { escritas.push({ colecao, id, dados: limpo, anterior: null, motivo: 'novo' }); resumo.novos++; return }
        if (iguais(semControle(existente), limpo)) { resumo.inalterados++; return }
        const editado = editadoNoPainel(existente)
        if (editado && !forcar) { pulados.push({ colecao, id, atualizadoPor: existente.atualizadoPor }); resumo.pulados++; return }
        escritas.push({ colecao, id, dados: limpo, anterior: existente, motivo: editado ? 'forcado' : 'atualizado' })
        if (editado) resumo.forcados++
        else resumo.atualizados++
    }

    // ── clientes ──
    const clientePorId = new Map(clientesNoBanco.map(c => [c.id, c]))
    const clientePorNexus = new Map(clientesNoBanco.filter(c => soDigitos(c.numeroNexus)).map(c => [soDigitos(c.numeroNexus), c]))
    const clientePorNome = new Map(clientesNoBanco.map(c => [normalizar(c.nome), c]))
    const idsClientes = new Set(clientesNoBanco.map(c => c.id))
    const consumidosC = new Set()
    const idClienteFinal = new Map() // id na planilha → id no banco
    const criadosC = new Set()
    for (const c of base.clientes) {
        const { id: idPlanilha, ...dados } = c
        const candidatos = [clientePorId.get(idPlanilha), soDigitos(c.numeroNexus) ? clientePorNexus.get(soDigitos(c.numeroNexus)) : undefined, clientePorNome.get(normalizar(c.nome))]
        const existente = candidatos.find(x => x && !consumidosC.has(x.id))
        const idFinal = existente ? existente.id : idLivre(idPlanilha, idsClientes)
        idsClientes.add(idFinal)
        idClienteFinal.set(idPlanilha, idFinal)
        if (existente) {
            consumidosC.add(existente.id)
            if (normalizar(existente.nome) !== normalizar(c.nome)) avisos.push(`cliente "${existente.nome}" (banco) passa a se chamar "${c.nome}" (mesmo nº do Nexus ${c.numeroNexus})`)
        } else {
            criadosC.add(idFinal)
            if (reimportacao) novosClientes.push(c.nome)
        }
        decidir('papaClientes', idFinal, dados, existente)
    }

    // ── processos: 1ª passada decide o id de cada linha; 2ª grava com pai e cliente remapeados ──
    const processoPorId = new Map(processosNoBanco.map(p => [p.id, p]))
    const porNumero = new Map()
    for (const p of processosNoBanco) { const k = chaveNumero(p.numero); if (!porNumero.has(k)) porNumero.set(k, []); porNumero.get(k).push(p) }
    const linhasPorNumero = new Map() // chave do nº → clientes (id final) que a planilha dá a esse nº
    for (const p of base.processos) {
        const k = chaveNumero(p.numero)
        if (!linhasPorNumero.has(k)) linhasPorNumero.set(k, new Set())
        linhasPorNumero.get(k).add(idClienteFinal.get(p.clienteId) ?? p.clienteId)
    }
    const idsProcessos = new Set(processosNoBanco.map(p => p.id))
    const consumidosP = new Set()
    const idProcessoFinal = new Map()
    const decisoes = []
    const mudancasDeCliente = [] // { processo, de, para }
    for (const p of base.processos) {
        const clienteIdFinal = idClienteFinal.get(p.clienteId) ?? p.clienteId
        const k = chaveNumero(p.numero)
        const porId = processoPorId.get(p.id)
        const livre = x => x && !consumidosP.has(x.id)
        let existente
        if (livre(porId) && porId.clienteId === clienteIdFinal) existente = porId
        else existente = (porNumero.get(k) ?? []).find(x => livre(x) && x.clienteId === clienteIdFinal)
        if (!existente && livre(porId) && !linhasPorNumero.get(k)?.has(porId.clienteId)) {
            existente = porId // o nº saiu do cliente antigo: é mudança de cliente, não um segundo processo
            mudancasDeCliente.push({ processo: p.numero, de: porId.clienteId, para: clienteIdFinal })
        }
        const idFinal = existente ? existente.id : idLivre(p.id, idsProcessos)
        if (!existente && (porNumero.get(k) ?? []).length)
            avisos.push(`processo ${p.numero} já existe no banco para outro cliente — mantido como registro separado (${idFinal})`)
        idsProcessos.add(idFinal)
        if (existente) consumidosP.add(existente.id)
        idProcessoFinal.set(p.id, idFinal)
        decisoes.push({ p, idFinal, existente, clienteIdFinal })
    }
    for (const { p, idFinal, existente, clienteIdFinal } of decisoes) {
        const { id: _id, ...dados } = p
        dados.clienteId = clienteIdFinal
        if (dados.processoPaiId && idProcessoFinal.has(dados.processoPaiId)) dados.processoPaiId = idProcessoFinal.get(dados.processoPaiId)
        decidir('papaProcessos', idFinal, dados, existente)
    }

    // Provável renomeação: um cliente do banco que SUMIU da planilha perdeu TODOS os processos para um cliente criado agora.
    const nomeC = id => clientesNoBanco.find(c => c.id === id)?.nome ?? base.clientes.find(c => idClienteFinal.get(c.id) === id)?.nome ?? id
    const porOrigem = new Map()
    for (const m of mudancasDeCliente) { if (!porOrigem.has(m.de)) porOrigem.set(m.de, []); porOrigem.get(m.de).push(m) }
    for (const [de, lista] of porOrigem) {
        const totalNoBanco = processosNoBanco.filter(x => x.clienteId === de).length
        const destinos = new Set(lista.map(m => m.para))
        if (!consumidosC.has(de) && lista.length === totalNoBanco && destinos.size === 1 && criadosC.has([...destinos][0]))
            avisos.push(`provável renomeação: "${nomeC(de)}" (banco) → "${nomeC([...destinos][0])}" (planilha). O cadastro antigo fica no banco sem processos; ` +
                'para renomear sem duplicar, corrija o nome pela tela ou dê o mesmo nº do Nexus aos dois.')
        else for (const m of lista) avisos.push(`processo ${m.processo} muda de cliente: "${nomeC(m.de)}" → "${nomeC(m.para)}"`)
    }
    if (novosClientes.length) avisos.push(`clientes novos nesta reimportação (confira se algum é grafia diferente de cliente já existente): ${novosClientes.join('; ')}`)

    return { escritas, pulados, avisos, resumo, novosClientes }
}
