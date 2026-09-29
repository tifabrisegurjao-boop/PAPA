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

/** Separa a base: o que as telas mostram (sem excluídos e sem processos de cliente excluído) e o que está na lixeira. */
export function separarExcluidos(base: Base): { ativa: Base; lixeira: Lixeira } {
    const clientesExcluidos = new Set(base.clientes.filter(excluido).map(c => c.id))
    return {
        ativa: {
            ...base,
            clientes: base.clientes.filter(c => !excluido(c)),
            processos: base.processos.filter(p => !excluido(p) && !clientesExcluidos.has(p.clienteId)),
        },
        lixeira: { clientes: base.clientes.filter(excluido), processos: base.processos.filter(excluido) },
    }
}

const listar = (processos: Processo[]) =>
    processos.slice(0, 3).map(p => p.numero).join(', ') + (processos.length > 3 ? ` e mais ${processos.length - 3}` : '')

/** Por que o cliente não pode ser excluído agora; undefined = pode. Com processo ativo, nada some sem a pessoa ver. */
export function bloqueioExcluirCliente(cliente: Cliente, processosAtivos: Processo[]): string | undefined {
    const deles = processosAtivos.filter(p => p.clienteId === cliente.id)
    if (!deles.length) return undefined
    return deles.length === 1
        ? `Este cliente ainda tem 1 processo (${listar(deles)}). Exclua o processo antes.`
        : `Este cliente ainda tem ${deles.length} processos (${listar(deles)}). Exclua os processos antes.`
}

/** Por que o processo não pode ser excluído agora: desdobramentos ativos ficariam sem origem. */
export function bloqueioExcluirProcesso(processo: Processo, processosAtivos: Processo[]): string | undefined {
    const filhos = processosAtivos.filter(p => p.processoPaiId === processo.id && p.id !== processo.id)
    if (!filhos.length) return undefined
    return filhos.length === 1
        ? `Este processo tem 1 desdobramento (${listar(filhos)}). Exclua o desdobramento antes.`
        : `Este processo tem ${filhos.length} desdobramentos (${listar(filhos)}). Exclua os desdobramentos antes.`
}

/** Por que o cliente não pode sair da lixeira: outro cliente ativo já usa o mesmo nome. */
export function bloqueioRestaurarCliente(cliente: Cliente, clientesAtivos: Cliente[]): string | undefined {
    const igual = clientesAtivos.find(c => c.id !== cliente.id && normalizar(c.nome) === normalizar(cliente.nome))
    return igual ? `Já existe um cliente ativo com este nome ("${igual.nome}").` : undefined
}

/** Por que o processo não pode sair da lixeira: cliente ou origem ainda na lixeira, ou nº já usado por um ativo. */
export function bloqueioRestaurarProcesso(processo: Processo, ativa: Base, lixeira: Lixeira): string | undefined {
    if (lixeira.clientes.some(c => c.id === processo.clienteId)) return 'O cliente deste processo está na lixeira: restaure o cliente antes.'
    const pai = processo.processoPaiId ? lixeira.processos.find(p => p.id === processo.processoPaiId) : undefined
    if (pai) return `O processo de origem (${pai.numero}) está na lixeira: restaure-o antes.`
    const igual = ativa.processos.find(p => p.id !== processo.id && chaveNumero(p.numero) === chaveNumero(processo.numero))
    return igual ? `Já existe um processo ativo com este número (${igual.numero}).` : undefined
}
