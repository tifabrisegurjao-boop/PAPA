import { collection, doc, getFirestore, onSnapshot, runTransaction, serverTimestamp, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import { app, auth } from './firebase.ts'
import type { Cliente, Processo } from '../tipos.ts'
import type { Repositorio } from './repositorio.ts'

// Coleções próprias do PAPA dentro do projeto do Nexus (`pagamento-255fc`). Prefixo "papa" para não
// confundir com `clients`/`cases` do Nexus. As regras do Firestore precisam liberá-las para usuário logado
// (firestore.rules neste projeto; publicar com `firebase deploy --only firestore:rules` DESTA pasta — ver README).
export const COLECAO_CLIENTES = 'papaClientes'
export const COLECAO_PROCESSOS = 'papaProcessos'

const db = getFirestore(app)

export function repositorioFirestore(): Repositorio {
    return {
        nome: 'Firestore (pagamento-255fc)',
        persistente: true,
        assinar(aoMudar, aoFalhar) {
            let clientes: Cliente[] | null = null
            let processos: Processo[] | null = null
            const entregar = () => {
                if (clientes && processos) aoMudar({ geradoEm: agoraIso(), origem: 'Firestore', clientes, processos })
            }
            const falhar = (e: Error & { code?: string }) =>
                aoFalhar(new Error(e.code === 'permission-denied'
                    ? 'Sem permissão para ler o banco. As regras do Firestore do projeto pagamento-255fc precisam liberar as coleções papaClientes e papaProcessos (ver README).'
                    : `Falha ao ler o banco: ${e.message}`))
            const pararClientes = onSnapshot(collection(db, COLECAO_CLIENTES), snap => { clientes = docs<Cliente>(snap); entregar() }, falhar)
            const pararProcessos = onSnapshot(collection(db, COLECAO_PROCESSOS), snap => { processos = docs<Processo>(snap); entregar() }, falhar)
            return () => { pararClientes(); pararProcessos() }
        },
        salvarCliente: cliente => gravar(COLECAO_CLIENTES, cliente),
        salvarProcesso: processo => gravar(COLECAO_PROCESSOS, processo),
    }
}

/**
 * Grava numa transação com controle de versão: o formulário carrega `versao` N e só grava se o banco ainda
 * estiver em N. Se outra pessoa salvou antes, recusa em vez de sobrescrever o que ela digitou.
 * O estado anterior vai para a subcoleção `historico` (quem mudou, quando, e o que havia antes).
 */
async function gravar<T extends { id: string; versao?: number }>(colecao: string, registro: T): Promise<void> {
    const ref = doc(db, colecao, registro.id)
    const { id: _id, versao: versaoLida, ...dados } = registro
    const quem = auth.currentUser?.email ?? null
    await runTransaction(db, async tx => {
        const atual = await tx.get(ref)
        // versaoLida undefined = cadastro novo: não pode haver documento com esse id (dois cadastros simultâneos do mesmo nome/nº).
        if (versaoLida === undefined && atual.exists())
            throw new Error('Já existe um registro com este identificador no banco (alguém cadastrou o mesmo cliente ou processo agora há pouco). Recarregue a página e confira.')
        // Edição: a versão lida na abertura do formulário tem de ser a que está no banco. Registro importado da planilha
        // não tem `versao`: vale 0 nos dois lados, para o controle valer desde a primeira edição.
        const versaoNoBanco = atual.exists() ? (atual.data().versao as number | undefined) ?? 0 : 0
        if (atual.exists() && versaoNoBanco !== versaoLida)
            throw new Error(`Outra pessoa salvou este registro antes de você (${atual.data().atualizadoPor ?? 'sem identificação'}). Recarregue a página e refaça a alteração.`)
        if (atual.exists()) tx.set(doc(collection(ref, 'historico')), { ...atual.data(), arquivadoEm: serverTimestamp(), arquivadoPor: quem })
        // Firestore não aceita `undefined`; o JSON round-trip limpa os campos opcionais vazios.
        tx.set(ref, { ...JSON.parse(JSON.stringify(dados)), versao: versaoNoBanco + 1, atualizadoEm: serverTimestamp(), atualizadoPor: quem })
    })
}

function docs<T>(snap: QuerySnapshot<DocumentData>): T[] {
    // `ordem` guarda a posição da planilha na importação, para a árvore sair na mesma ordem de lá.
    return snap.docs
        .map(d => ({ ...(d.data() as T & { ordem?: number; atualizadoEm?: unknown; atualizadoPor?: unknown }), id: d.id }))
        .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
        .map(({ atualizadoEm: _a, atualizadoPor: _b, ...resto }) => resto as T)
}

function agoraIso() {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
