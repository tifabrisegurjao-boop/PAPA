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

/**
 * Árvore de uma vista FILTRADA (ex.: só processos com liberação). `todos` são os processos do cliente; `visiveis`, os que
 * passaram no filtro. Quem teve a origem escondida pelo filtro não é erro de planilha: fica pendurado no ancestral visível
 * mais próximo ou, se não houver, vira ramo solto — e `origemOculta` guarda (id → nº da origem), para a tela dizer de onde
 * ele vem. `orfaos` continua trazendo só os erros de verdade. Sem filtro (`visiveis` = `todos`) é igual a `montarArvore`.
 */
export function montarArvoreFiltrada(todos: Processo[], visiveis: Processo[]): { raizes: NoArvore[]; orfaos: Processo[]; origemOculta: Map<string, string> } {
    const porId = new Map(todos.map(p => [p.id, p]))
    const visivel = new Set(visiveis.map(p => p.id))
    const errosDePlanilha = new Set(montarArvore(todos).orfaos.map(p => p.id))
    const origemOculta = new Map<string, string>()
    const ajustados = visiveis.map(p => {
        if (!p.processoPaiId || visivel.has(p.processoPaiId) || errosDePlanilha.has(p.id)) return p
        const vistos = new Set([p.id])
        let ancestral = porId.get(p.processoPaiId)
        while (ancestral && !visivel.has(ancestral.id) && !vistos.has(ancestral.id)) {
            vistos.add(ancestral.id)
            ancestral = ancestral.processoPaiId ? porId.get(ancestral.processoPaiId) : undefined
        }
        if (ancestral && visivel.has(ancestral.id)) return { ...p, processoPaiId: ancestral.id }
        origemOculta.set(p.id, porId.get(p.processoPaiId)?.numero ?? '')
        return { ...p, processoPaiId: undefined }
    })
    return { ...montarArvore(ajustados), origemOculta }
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
