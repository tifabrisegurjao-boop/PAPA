import type { Base, Processo } from '../tipos.ts'
import { diasAte } from './formatacao.ts'

export type EstadoAcesso = 'expirado' | 'a-vencer' | 'ok' | 'sem-info' | 'fisico' | 'desconhecido'

/**
 * Estado do acesso externo ao processo, calculado na hora de exibir (não na conversão):
 * assim o processo fica vermelho no dia em que o acesso vence, sem regerar a base.
 * A DATA de término manda — é o que a planilha controla; a situação digitada só entra quando não há data.
 */
export function estadoAcesso(p: Processo, hoje = new Date()): EstadoAcesso {
    const a = p.acesso
    if (!a) return 'desconhecido'
    if (a.termino) {
        const dias = diasAte(a.termino, hoje)
        if (dias !== null) return dias < 0 ? 'expirado' : dias <= 7 ? 'a-vencer' : 'ok'
    }
    switch ((a.situacao ?? '').toUpperCase()) {
        case 'EXPIRADO': return 'expirado'
        case 'ATIVO': return 'ok'
        case 'SEM INFO': return 'sem-info'
        case 'FÍSICO': case 'FISICO': return 'fisico'
        default: return 'desconhecido'
    }
}

/** Verdadeiro quando o escritório perdeu o acesso externo (prazo vencido ou marcado EXPIRADO). */
export const semAcesso = (p: Processo, hoje?: Date) => estadoAcesso(p, hoje) === 'expirado'

/**
 * Filtro das telas (01/10/2026; na tela é o botão "Com acesso"): tudo, ou só o que está com acesso externo valendo hoje —
 * como se o resto não existisse.
 */
export type FiltroAcesso = 'todos' | 'liberacao'

/**
 * "Com liberação" (na tela: "Com acesso") = o acesso externo está valendo hoje: término hoje ou depois, ou — sem data — situação ATIVO.
 * Acesso sem informação, processo físico e acesso expirado ficam de fora.
 */
export function comLiberacao(p: Processo, hoje?: Date): boolean {
    const estado = estadoAcesso(p, hoje)
    return estado === 'ok' || estado === 'a-vencer'
}

/** A base reduzida ao que está com liberação: só esses processos e só os clientes que têm algum deles. */
export function soComLiberacao(base: Base, hoje?: Date): Base {
    const processos = base.processos.filter(p => comLiberacao(p, hoje))
    const donos = new Set(processos.map(p => p.clienteId))
    return { ...base, clientes: base.clientes.filter(c => donos.has(c.id)), processos }
}
