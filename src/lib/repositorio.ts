import { paraTextoLocal } from './formatacao.ts'
import type { Base, Cliente, Processo } from '../tipos.ts'

/**
 * De onde a base vem e para onde as edições vão. Duas implementações:
 * - `repositorioMemoria`: carrega o JSON estático e guarda as edições só nesta aba (demonstração / sem banco).
 * - `repositorioFirestore` (repositorioFirestore.ts): banco do escritório, em tempo real, edições gravadas para todos.
 * A interface é a mesma, então as telas não sabem qual está por trás.
 */
export interface Repositorio {
    /** Como aparece no rodapé, ex.: "Firestore (papa-85025)". */
    nome: string
    /** false = as edições não são gravadas em lugar nenhum além desta aba. */
    persistente: boolean
    /** Assina a base: `aoMudar` roda na carga e a cada alteração. Retorna a função que cancela. */
    assinar(aoMudar: (base: Base) => void, aoFalhar: (erro: Error) => void): () => void
    salvarCliente(cliente: Cliente): Promise<void>
    salvarProcesso(processo: Processo): Promise<void>
    /**
     * Exclusão lógica (`excluir` = true: vai para a Lixeira) ou restauração (false). Não apaga nada: marca
     * `excluidoEm`/`excluidoPor`. `registro.versao` é a versão que a tela mostrava — se mudou no banco, recusa.
     */
    definirExclusao(tipo: 'cliente' | 'processo', registro: Cliente | Processo, excluir: boolean): Promise<void>
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
        async definirExclusao(tipo, registro, excluir) {
            if (!base) throw new Error('A base ainda não carregou.')
            const marcar = <T extends Cliente | Processo>(r: T): T => {
                if (r.id !== registro.id) return r
                const { excluidoEm: _e, excluidoPor: _p, ...resto } = r
                return (excluir ? { ...resto, excluidoEm: paraTextoLocal(), excluidoPor: 'esta aba (demonstração)' } : resto) as T
            }
            base = tipo === 'cliente' ? { ...base, clientes: base.clientes.map(marcar) } : { ...base, processos: base.processos.map(marcar) }
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
