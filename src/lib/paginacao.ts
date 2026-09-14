export const CLIENTES_POR_PAGINA = 15

export interface Pagina<T> {
    itens: T[]
    /** Página efetiva (1..totalPaginas): a pedida, ajustada se a lista encolheu. */
    pagina: number
    totalPaginas: number
    /** Posição (1-based) do primeiro e do último item mostrados; 0 e 0 com lista vazia. */
    inicio: number
    fim: number
}

/** Fatia a lista na página pedida. Página fora do intervalo (lista encolheu na busca ou no cadastro) cai no limite. */
export function paginar<T>(lista: T[], pagina: number, porPagina = CLIENTES_POR_PAGINA): Pagina<T> {
    const totalPaginas = Math.max(1, Math.ceil(lista.length / porPagina))
    const efetiva = Math.min(Math.max(1, Math.floor(pagina) || 1), totalPaginas)
    const itens = lista.slice((efetiva - 1) * porPagina, efetiva * porPagina)
    const inicio = itens.length ? (efetiva - 1) * porPagina + 1 : 0
    return { itens, pagina: efetiva, totalPaginas, inicio, fim: inicio ? inicio + itens.length - 1 : 0 }
}
