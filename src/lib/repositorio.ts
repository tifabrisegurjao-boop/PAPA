import type { Base, Cliente, Processo } from '../tipos.ts'

/**
 * De onde a base vem e para onde as edições vão. Duas implementações:
 * - `repositorioMemoria`: carrega o JSON estático e guarda as edições só nesta aba (demonstração / sem banco).
 * - `repositorioFirestore` (repositorioFirestore.ts): banco do escritório, em tempo real, edições gravadas para todos.
 * A interface é a mesma, então as telas não sabem qual está por trás.
 */
export interface Repositorio {
    /** Como aparece no rodapé, ex.: "Firestore (pagamento-255fc)". */
    nome: string
    /** false = as edições não são gravadas em lugar nenhum além desta aba. */
    persistente: boolean
    /** Assina a base: `aoMudar` roda na carga e a cada alteração. Retorna a função que cancela. */
    assinar(aoMudar: (base: Base) => void, aoFalhar: (erro: Error) => void): () => void
    salvarCliente(cliente: Cliente): Promise<void>
    salvarProcesso(processo: Processo): Promise<void>
}

export function repositorioMemoria(carregar: () => Promise<Base>): Repositorio {
    let base: Base | null = null
    const ouvintes = new Set<(base: Base) => void>()
    const avisar = () => { if (base) for (const o of ouvintes) o({ ...base }) }
    return {
        nome: 'JSON estático (edições só nesta aba)',
        persistente: false,
        assinar(aoMudar, aoFalhar) {
            ouvintes.add(aoMudar)
            if (base) aoMudar({ ...base })
            else carregar().then(b => { base = b; avisar() }).catch(aoFalhar)
            return () => { ouvintes.delete(aoMudar) }
        },
        async salvarCliente(cliente) {
            if (!base) throw new Error('A base ainda não carregou.')
            base = { ...base, clientes: substituir(base.clientes, cliente) }
            avisar()
        },
        async salvarProcesso(processo) {
            if (!base) throw new Error('A base ainda não carregou.')
            base = { ...base, processos: substituir(base.processos, processo) }
            avisar()
        },
    }
}

/** Troca o item de mesmo id ou acrescenta no fim (a ordem da planilha é a ordem da árvore). */
function substituir<T extends { id: string }>(lista: T[], item: T): T[] {
    const i = lista.findIndex(x => x.id === item.id)
    if (i < 0) return [...lista, item]
    const copia = lista.slice()
    copia[i] = item
    return copia
}
