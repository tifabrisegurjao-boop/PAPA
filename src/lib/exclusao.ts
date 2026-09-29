import { chaveNumero, normalizar } from './busca.ts'
import type { Base, Cliente, Processo } from '../tipos.ts'

// Exclusão lógica (29/09/2026): excluir marca `excluidoEm`/`excluidoPor` e o registro some das telas, mas continua no
// banco — com o histórico — e aparece na Lixeira da tela inicial, de onde pode ser restaurado. Nada é apagado de verdade,
// porque "em caso de erro" vale também para a própria exclusão. Regras puras, testadas em tests/exclusao.test.ts.

export const excluido = (registro: { excluidoEm?: string }) => !!registro.excluidoEm

export interface Lixeira {
    clientes: Cliente[]
    processos: Processo[]
}

/**
 * Separa a base: o que as telas mostram (sem excluídos e sem processos de cliente excluído) e o que está na lixeira.
 * Processo ATIVO de cliente excluído (outra pessoa o cadastrou no mesmo instante da exclusão) também vai para a lixeira,
 * para nada ficar invisível: volta junto quando o cliente é restaurado.
 */
export function separarExcluidos(base: Base): { ativa: Base; lixeira: Lixeira } {
    const clientesExcluidos = new Set(base.clientes.filter(excluido).map(c => c.id))
    const naLixeira = (p: Processo) => excluido(p) || clientesExcluidos.has(p.clienteId)
    return {
        ativa: { ...base, clientes: base.clientes.filter(c => !excluido(c)), processos: base.processos.filter(p => !naLixeira(p)) },
        lixeira: { clientes: base.clientes.filter(excluido), processos: base.processos.filter(naLixeira) },
    }
}

const listar = (processos: Processo[], nomeDoCliente?: (id: string) => string | undefined, clienteDoPai?: string) =>
    processos.slice(0, 3).map(p => (p.clienteId !== clienteDoPai && nomeDoCliente?.(p.clienteId) ? `${p.numero}, do cliente ${nomeDoCliente(p.clienteId)}` : p.numero)).join('; ') +
    (processos.length > 3 ? ` e mais ${processos.length - 3}` : '')

/** Por que o cliente não pode ser excluído agora; undefined = pode. Com processo ativo, nada some sem a pessoa ver. */
export function bloqueioExcluirCliente(cliente: Cliente, processosAtivos: Processo[]): string | undefined {
    const deles = processosAtivos.filter(p => p.clienteId === cliente.id)
    if (!deles.length) return undefined
    return deles.length === 1
        ? `Este cliente ainda tem 1 processo (${listar(deles)}). Exclua o processo antes.`
        : `Este cliente ainda tem ${deles.length} processos (${listar(deles).replace(/; /g, ', ')}). Exclua os processos antes.`
}

/**
 * Por que o processo não pode ser excluído agora: desdobramentos ativos ficariam sem origem. Filho que também é
 * ancestral (ciclo A → B → A, vindo da planilha) não conta — senão nenhum dos dois poderia ser excluído.
 * `nomeDoCliente` identifica o desdobramento que é de outro cliente (não aparece na árvore deste).
 */
export function bloqueioExcluirProcesso(processo: Processo, processosAtivos: Processo[], nomeDoCliente?: (id: string) => string | undefined): string | undefined {
    const porId = new Map(processosAtivos.map(p => [p.id, p]))
    const ancestrais = new Set<string>()
    for (let pai = processo.processoPaiId; pai && !ancestrais.has(pai) && pai !== processo.id; pai = porId.get(pai)?.processoPaiId) ancestrais.add(pai)
    const filhos = processosAtivos.filter(p => p.processoPaiId === processo.id && p.id !== processo.id && !ancestrais.has(p.id))
    if (!filhos.length) return undefined
    const quais = listar(filhos, nomeDoCliente, processo.clienteId)
    return filhos.length === 1
        ? `Este processo tem 1 desdobramento (${quais}). Exclua o desdobramento antes.`
        : `Este processo tem ${filhos.length} desdobramentos (${quais}). Exclua os desdobramentos antes.`
}

/** Por que o cliente não pode sair da lixeira: outro cliente ativo já usa o mesmo nome. */
export function bloqueioRestaurarCliente(cliente: Cliente, clientesAtivos: Cliente[]): string | undefined {
    const igual = clientesAtivos.find(c => c.id !== cliente.id && normalizar(c.nome) === normalizar(cliente.nome))
    return igual ? `Já existe um cliente ativo com este nome ("${igual.nome}").` : undefined
}

/** Por que o processo não pode sair da lixeira: cliente ou origem ainda na lixeira, ou nº já usado por um ativo. */
export function bloqueioRestaurarProcesso(processo: Processo, ativa: Base, lixeira: Lixeira): string | undefined {
    if (lixeira.clientes.some(c => c.id === processo.clienteId))
        return excluido(processo)
            ? 'O cliente deste processo está na lixeira: restaure o cliente antes.'
            : 'Este processo não foi excluído: ele volta sozinho quando o cliente dele for restaurado.'
    const pai = processo.processoPaiId ? lixeira.processos.find(p => p.id === processo.processoPaiId) : undefined
    if (pai) return `O processo de origem (${pai.numero}) está na lixeira: restaure-o antes.`
    const igual = ativa.processos.find(p => p.id !== processo.id && chaveNumero(p.numero) === chaveNumero(processo.numero))
    return igual ? `Já existe um processo ativo com este número (${igual.numero}).` : undefined
}
