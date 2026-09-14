import type { Processo } from '../tipos.ts'

export interface NoArvore {
    processo: Processo
    filhos: NoArvore[]
}

/**
 * Organiza os processos de UM cliente como a árvore do SEI: cada processo sem pai é um ramo principal
 * (o servidor pode ter processos distintos em órgãos diferentes); recursos, comunicações e outros
 * desdobramentos ficam pendurados no processo de origem, em qualquer profundidade, na ordem da planilha.
 *
 * Erro de planilha (pai inexistente, pai de outro cliente, ciclo) não pode sumir da tela:
 * o processo vira ramo principal e volta em `orfaos` para a interface avisar.
 */
export function montarArvore(processos: Processo[]): { raizes: NoArvore[]; orfaos: Processo[] } {
    const nos: NoArvore[] = processos.map(processo => ({ processo, filhos: [] }))
    const porId = new Map<string, NoArvore>()
    for (const no of nos) if (!porId.has(no.processo.id)) porId.set(no.processo.id, no)

    const raizes: NoArvore[] = []
    const orfaos: Processo[] = []
    for (const no of nos) {
        const paiId = no.processo.processoPaiId
        if (!paiId) {
            raizes.push(no)
            continue
        }
        const pai = porId.get(paiId)
        if (!pai || formaCiclo(no.processo, porId)) {
            raizes.push(no)
            orfaos.push(no.processo)
            continue
        }
        pai.filhos.push(no)
    }
    return { raizes, orfaos }
}

/** Verdadeiro só se, subindo pelos pais, voltamos ao próprio processo (quem apenas descende de um ciclo não conta). */
function formaCiclo(processo: Processo, porId: Map<string, NoArvore>): boolean {
    const vistos = new Set<string>()
    let atual = processo.processoPaiId
    while (atual && !vistos.has(atual)) {
        if (atual === processo.id) return true
        vistos.add(atual)
        atual = porId.get(atual)?.processo.processoPaiId
    }
    return false
}
