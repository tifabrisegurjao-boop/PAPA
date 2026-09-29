// Regras PURAS da importação planilha → Firestore (sem rede, sem Firebase), testadas em tests/importacao.test.ts.
// scripts/enviar-firestore.mjs só faz o que precisa de rede: login, ler o banco, chamar planejarImportacao() e gravar o plano.
//
// Decisões (28/09/2026, depois da auditoria de prontidão):
//   - A LINHA DA PLANILHA É O REGISTRO: na reimportação o documento é montado só com o que a linha traz. Célula apagada
//     apaga o campo no banco (antes era um merge com o registro antigo e nada nunca sumia). A planilha v2 tem todas as
//     colunas que a tela edita, então nada se perde por isso.
//   - Registro igual ao que já está no banco não é regravado (sem versão nova, sem historico, sem gasto de escrita).
//     Se só a POSIÇÃO (`ordem`) mudou — linha inserida acima, por exemplo — é uma atualização leve, sem historico, e só em
//     registro que é da importação (o editado na tela não perde a autoria por causa de ordem).
//   - Registro editado pela TELA (atualizadoPor sem o prefixo "importação:") é pulado, salvo --forcar; o anterior vai para historico/.
//   - Casamento do cliente: id → nº do Nexus → nome normalizado. Do processo: id (mesmo cliente) → nº + mesmo cliente →
//     id com cliente diferente (mudança de cliente, se a planilha não tem outra linha desse nº para o cliente antigo) → novo.
//     Nº repetido para outro cliente vira registro separado (id com -2, -3…), nunca sobrescreve o do outro.
//   - processoPaiId aponta para o id que o pai tem NO BANCO (remapeado), não para o slug da planilha.
//   - Nada é apagado: linha que sumiu da planilha continua no banco (quem tira é a exclusão lógica da tela).
//   - Registro EXCLUÍDO pela tela (na Lixeira) nunca é reimportado nem ressuscitado — nem com --forcar; processo novo de
//     cliente que está na lixeira também não entra. Vira aviso: tire a linha da planilha ou restaure pela tela.
import { CHAVES, LIMITES } from '../../src/lib/limites.mjs'

export const normalizar = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[.,\-/_]+/g, ' ').replace(/\s+/g, ' ').trim()
export const soDigitos = t => String(t ?? '').replace(/\D/g, '')
export const chaveNumero = n => (soDigitos(n).length >= 4 ? soDigitos(n) : normalizar(n))

/** Prefixo de `atualizadoPor` das gravações feitas por importação (as regras aceitam "importação:<e-mail do token>"). */
export const IMPORTACAO = 'importação:'
export const editadoNoPainel = registro => !!registro?.atualizadoPor && !String(registro.atualizadoPor).startsWith(IMPORTACAO)
const veioDeImportacao = registro => String(registro?.atualizadoPor ?? '').startsWith(IMPORTACAO)

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
        // A regra lê `data.tipoPessoa` sem testar se existe: campo ausente é erro de avaliação (negado). Tem de vir, nem que null.
        if (!('tipoPessoa' in dados)) erros.push('tipoPessoa ausente (use null quando não souber)')
        else if (!(dados.tipoPessoa === null || dados.tipoPessoa === 'PF' || dados.tipoPessoa === 'PJ')) erros.push(`tipoPessoa "${dados.tipoPessoa}" (só PF, PJ ou vazio)`)
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
const MAX_NOMES_NO_AVISO = 15

/**
 * Decide, sem gravar nada, o que a importação faria com o banco como está.
 * @returns {{ escritas: {colecao, id, dados, anterior, motivo: 'novo'|'atualizado'|'forcado'|'ordem'}[],
 *            pulados: {colecao, id, atualizadoPor}[], naLixeira: {colecao, id, excluidoPor}[], avisos: string[],
 *            resumo: {novos, atualizados, reordenados, inalterados, forcados, pulados, excluidos}, novosClientes: string[] }}
 * `motivo: 'ordem'` = só a posição mudou: o script grava sem copiar para historico.
 */
export function planejarImportacao(base, { clientesNoBanco = [], processosNoBanco = [], forcar = false } = {}) {
    const escritas = [], pulados = [], avisos = [], novosClientes = [], naLixeira = []
    const resumo = { novos: 0, atualizados: 0, reordenados: 0, inalterados: 0, forcados: 0, pulados: 0, excluidos: 0 }
    const clientesNaLixeira = new Set(clientesNoBanco.filter(c => c.excluidoEm).map(c => c.id))
    // Reimportação de verdade = já há registros que vieram de importação (um cliente de teste cadastrado pela tela não conta).
    const reimportacao = [...clientesNoBanco, ...processosNoBanco].some(veioDeImportacao)

    /** Decide o destino de um registro e devolve o motivo: novo | atualizado | forcado | ordem | inalterado | pulado. */
    const decidir = (colecao, id, dados, existente) => {
        const limpo = JSON.parse(JSON.stringify(dados)) // tira undefined, como o gravador da tela
        if (!existente) { escritas.push({ colecao, id, dados: limpo, anterior: null, motivo: 'novo' }); resumo.novos++; return 'novo' }
        if (existente.excluidoEm) { naLixeira.push({ colecao, id, excluidoPor: existente.excluidoPor }); resumo.excluidos++; return 'excluido' }
        const atual = semControle(existente)
        const { ordem: ordemAtual, ...conteudoAtual } = atual
        const { ordem: ordemNova, ...conteudoNovo } = limpo
        const editado = editadoNoPainel(existente)
        if (iguais(conteudoAtual, conteudoNovo)) {
            if (ordemAtual !== ordemNova && ordemNova !== undefined && !editado) {
                escritas.push({ colecao, id, dados: { ...atual, ordem: ordemNova }, anterior: existente, motivo: 'ordem' })
                resumo.reordenados++
                return 'ordem'
            }
            resumo.inalterados++
            return 'inalterado'
        }
        if (editado && !forcar) { pulados.push({ colecao, id, atualizadoPor: existente.atualizadoPor }); resumo.pulados++; return 'pulado' }
        escritas.push({ colecao, id, dados: limpo, anterior: existente, motivo: editado ? 'forcado' : 'atualizado' })
        if (editado) resumo.forcados++
        else resumo.atualizados++
        return editado ? 'forcado' : 'atualizado'
    }

    // ── clientes ──
    const clientePorId = new Map(clientesNoBanco.map(c => [c.id, c]))
    // Ativo tem preferência sobre o da lixeira (cliente excluído e recadastrado pela tela tem outro id; a planilha deve cair
    // no ativo): os excluídos entram primeiro nos mapas e o ativo de mesma chave os substitui.
    const lixeiraPrimeiro = lista => [...lista.filter(x => x.excluidoEm), ...lista.filter(x => !x.excluidoEm)]
    const clientePorNexus = new Map(lixeiraPrimeiro(clientesNoBanco).filter(c => soDigitos(c.numeroNexus)).map(c => [soDigitos(c.numeroNexus), c]))
    const clientePorNome = new Map(lixeiraPrimeiro(clientesNoBanco).map(c => [normalizar(c.nome), c]))
    const idsClientes = new Set(clientesNoBanco.map(c => c.id))
    const consumidosC = new Map() // id no banco → nome da linha da planilha que o levou
    const idClienteFinal = new Map() // id na planilha → id no banco
    const criadosC = new Set()
    for (const c of base.clientes) {
        const { id: idPlanilha, ...dados } = c
        const nexus = soDigitos(c.numeroNexus)
        const candidatos = [['id', clientePorId.get(idPlanilha)], ['nexus', nexus ? clientePorNexus.get(nexus) : undefined], ['nome', clientePorNome.get(normalizar(c.nome))]]
            .filter(([, x]) => x)
        const [como, existente] = candidatos.find(([, x]) => !consumidosC.has(x.id) && !x.excluidoEm) ?? candidatos.find(([, x]) => !consumidosC.has(x.id)) ?? []
        // Ambiguidade: esta linha também aponta para um registro do banco que outra linha já levou (duas grafias do mesmo cliente?).
        for (const [, x] of candidatos)
            if (consumidosC.has(x.id) && x.id !== existente?.id && !avisos.includes(`AMB:${x.id}:${c.nome}`))
                avisos.push(`cliente "${c.nome}" também corresponde a "${x.nome}" do banco, que já foi tomado pela linha "${consumidosC.get(x.id)}" — confira se são a mesma pessoa`)
        const idFinal = existente ? existente.id : idLivre(idPlanilha, idsClientes)
        idsClientes.add(idFinal)
        idClienteFinal.set(idPlanilha, idFinal)
        if (existente) consumidosC.set(existente.id, c.nome)
        else { criadosC.add(idFinal); if (reimportacao) novosClientes.push(c.nome) }
        const motivo = decidir('papaClientes', idFinal, dados, existente)
        if (existente && (motivo === 'atualizado' || motivo === 'forcado')) {
            if (normalizar(existente.nome) !== normalizar(c.nome))
                avisos.push(`cliente "${existente.nome}" (banco) passa a se chamar "${c.nome}" (${como === 'nexus' ? `mesmo nº do Nexus ${c.numeroNexus}` : `mesmo id ${existente.id}`}${motivo === 'forcado' ? '; sobrescrito com --forcar' : ''})`)
            if (soDigitos(existente.numeroNexus) && !nexus)
                avisos.push(`cliente "${c.nome}" perde o nº do Nexus ${existente.numeroNexus} que tinha no banco (célula vazia na planilha)`)
        }
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
    for (const p of base.processos) {
        const clienteIdFinal = idClienteFinal.get(p.clienteId) ?? p.clienteId
        const k = chaveNumero(p.numero)
        const porId = processoPorId.get(p.id)
        const livre = x => x && !consumidosP.has(x.id)
        const doCliente = x => livre(x) && x.clienteId === clienteIdFinal
        const candidatosN = porNumero.get(k) ?? []
        let existente, mudanca
        // Mesmo cliente: primeiro um ATIVO (por id, depois por nº) — processo excluído e recadastrado pela tela tem outro id —,
        // só depois o da lixeira.
        if (doCliente(porId) && !porId.excluidoEm) existente = porId
        else existente = candidatosN.find(x => doCliente(x) && !x.excluidoEm) ?? (doCliente(porId) ? porId : candidatosN.find(doCliente))
        if (!existente && livre(porId) && !linhasPorNumero.get(k)?.has(porId.clienteId)) {
            existente = porId // o nº saiu do cliente antigo: é mudança de cliente, não um segundo processo
            mudanca = { processo: p.numero, de: porId.clienteId, para: clienteIdFinal }
        }
        const idFinal = existente ? existente.id : idLivre(p.id, idsProcessos)
        // Linha que iria para um cliente que está na lixeira não é importada (2ª passada): sem avisos de nº repetido para ela.
        const paraClienteNaLixeira = clientesNaLixeira.has(clienteIdFinal) && !existente?.excluidoEm
        if (!existente && !paraClienteNaLixeira) {
            const doMesmo = candidatosN.find(x => x.clienteId === clienteIdFinal)
            if (doMesmo) avisos.push(`processo ${p.numero}: o registro deste cliente com esse nº (${doMesmo.id}) já foi usado por outra linha da planilha — esta linha vira um segundo registro (${idFinal}); confira se o nº está repetido para o mesmo cliente`)
            else if (candidatosN.length) avisos.push(`processo ${p.numero} já existe no banco para outro cliente — mantido como registro separado (${idFinal})`)
        }
        idsProcessos.add(idFinal)
        if (existente) consumidosP.add(existente.id)
        idProcessoFinal.set(p.id, idFinal)
        decisoes.push({ p, idFinal, existente, clienteIdFinal, mudanca, paraClienteNaLixeira })
    }
    const movidos = [] // mudanças de cliente que serão gravadas de fato
    const ficaram = new Map() // cliente antigo → nºs que ficaram lá por terem sido editados na tela (pulados)
    for (const { p, idFinal, existente, clienteIdFinal, mudanca, paraClienteNaLixeira } of decisoes) {
        // Processo novo, ou ativo que mudaria de cliente, indo para um cliente na lixeira: sumiria de todas as telas. Não entra.
        if (paraClienteNaLixeira) {
            avisos.push(`processo ${p.numero} iria para cliente que está na lixeira ("${clientesNoBanco.find(c => c.id === clienteIdFinal)?.nome}") — não importado; restaure o cliente pela tela ou corrija a planilha`)
            naLixeira.push({ colecao: 'papaProcessos', id: idFinal, excluidoPor: '(cliente na lixeira)' })
            resumo.excluidos++
            continue
        }
        const { id: _id, ...dados } = p
        dados.clienteId = clienteIdFinal
        if (dados.processoPaiId && idProcessoFinal.has(dados.processoPaiId)) dados.processoPaiId = idProcessoFinal.get(dados.processoPaiId)
        // Origem na lixeira: desdobramento novo não entra (ficaria órfão na árvore); o que já existe segue, com aviso.
        const origemNaLixeira = dados.processoPaiId ? processoPorId.get(dados.processoPaiId) : undefined
        if (origemNaLixeira?.excluidoEm) {
            if (!existente) {
                avisos.push(`processo ${p.numero}: a origem (${origemNaLixeira.numero}) está na lixeira — não importado; restaure a origem pela tela ou corrija a planilha`)
                naLixeira.push({ colecao: 'papaProcessos', id: idFinal, excluidoPor: '(origem na lixeira)' })
                resumo.excluidos++
                continue
            }
            avisos.push(`processo ${p.numero}: a origem (${origemNaLixeira.numero}) está na lixeira — na árvore ele aparece como principal até a origem ser restaurada`)
        }
        const motivo = decidir('papaProcessos', idFinal, dados, existente)
        if (!mudanca) continue
        if (motivo === 'atualizado' || motivo === 'forcado') movidos.push(mudanca)
        else if (motivo === 'pulado') { if (!ficaram.has(mudanca.de)) ficaram.set(mudanca.de, []); ficaram.get(mudanca.de).push(mudanca.processo) }
    }

    // Provável renomeação: um cliente do banco que SUMIU da planilha perde TODOS os processos para um cliente criado agora.
    const nomeC = id => clientesNoBanco.find(c => c.id === id)?.nome ?? base.clientes.find(c => idClienteFinal.get(c.id) === id)?.nome ?? id
    const porOrigem = new Map()
    for (const m of movidos) { if (!porOrigem.has(m.de)) porOrigem.set(m.de, []); porOrigem.get(m.de).push(m) }
    for (const [de, lista] of porOrigem) {
        const totalNoBanco = processosNoBanco.filter(x => x.clienteId === de).length
        const destinos = new Set(lista.map(m => m.para))
        const presos = ficaram.get(de) ?? []
        if (!consumidosC.has(de) && lista.length + presos.length === totalNoBanco && destinos.size === 1 && criadosC.has([...destinos][0]))
            avisos.push(`provável renomeação: "${nomeC(de)}" (banco) → "${nomeC([...destinos][0])}" (planilha). ` +
                (presos.length
                    ? `O(s) processo(s) ${presos.join(', ')} fica(m) no cadastro antigo porque foi(ram) editado(s) pela tela (use --forcar ou corrija pela tela). `
                    : 'O cadastro antigo fica no banco sem processos. ') +
                'Para renomear sem duplicar, corrija o nome pela tela ou dê o mesmo nº do Nexus aos dois.')
        else for (const m of lista) avisos.push(`processo ${m.processo} muda de cliente: "${nomeC(m.de)}" → "${nomeC(m.para)}"`)
    }
    if (novosClientes.length) {
        const lista = novosClientes.slice(0, MAX_NOMES_NO_AVISO).join('; ') + (novosClientes.length > MAX_NOMES_NO_AVISO ? ` … e mais ${novosClientes.length - MAX_NOMES_NO_AVISO}` : '')
        avisos.push(`clientes novos nesta reimportação (confira se algum é grafia diferente de cliente já existente): ${lista}`)
    }

    return { escritas, pulados, avisos, resumo, novosClientes, naLixeira }
}
