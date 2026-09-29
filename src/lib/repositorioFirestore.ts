import { FirebaseError } from 'firebase/app'
import { collection, doc, getFirestore, onSnapshot, runTransaction, serverTimestamp, type DocumentData, type QuerySnapshot } from 'firebase/firestore'
import { app, auth } from './firebase.ts'
import { PROJETO } from './firebaseConfig.mjs'
import { paraTextoLocal } from './formatacao.ts'
import type { Cliente, Processo } from '../tipos.ts'
import type { Repositorio } from './repositorio.ts'

// Coleções do PAPA no projeto próprio (`papa-85025`). O prefixo "papa" ficou de quando o plano era morar dentro do
// projeto do Nexus; manter os nomes evita migrar dado. As regras (firestore.rules; publicar com `npm run regras` —
// ver README) só liberam quem está na coleção `papaEquipe`.
export const COLECAO_CLIENTES = 'papaClientes'
export const COLECAO_PROCESSOS = 'papaProcessos'

const db = getFirestore(app)

const SEM_CONEXAO = 'Sem conexão com o banco (firestore.googleapis.com). Verifique a internet ou bloqueadores de conteúdo e recarregue a página.'

// "permission-denied" tem mais de uma causa na ativação; a mensagem lista todas, na ordem em que costumam acontecer,
// e mostra o e-mail exato do login — é ele, em minúsculas, que tem de ser o id do documento em papaEquipe.
type Acao = 'ler' | 'gravar' | 'excluir'

function explicarPermissao(acao: Acao): string {
    const email = auth.currentUser?.email ?? null
    return `Sem permissão para ${acao === 'ler' ? 'ler o banco' : acao === 'gravar' ? 'gravar no banco' : 'excluir ou restaurar'} como ${email ?? 'usuário sem e-mail'}. Confira, nesta ordem: ` +
        `(1) existe o documento papaEquipe/${email?.toLowerCase() ?? '<e-mail>'} no Firestore do projeto ${PROJETO} (o id é o e-mail, todo em minúsculas); ` +
        '(2) as regras deste projeto foram publicadas (npm run regras, a partir da pasta do PAPA)' +
        (acao === 'gravar' ? '; (3) nenhum campo passou do tamanho permitido' : '') +
        (acao === 'excluir' ? ' — a exclusão precisa das regras publicadas a partir de 29/09/2026 (campos excluidoEm/excluidoPor)' : '') +
        '. Depois de corrigir, recarregue a página.'
}

const traduzir = (e: unknown, acao: Acao): Error => {
    const codigo = e instanceof FirebaseError || (typeof e === 'object' && e && 'code' in e) ? String((e as { code?: string }).code) : ''
    if (codigo === 'permission-denied') return new Error(explicarPermissao(acao))
    // Na gravação, "recarregue" apagaria o formulário: o que foi digitado continua lá, basta tentar de novo.
    if (codigo === 'unavailable')
        return new Error(acao === 'gravar' ? 'Sem conexão com o banco no momento. Confira a internet e clique em Salvar de novo — o que você digitou continua no formulário.'
            : acao === 'excluir' ? 'Sem conexão com o banco no momento. Confira a internet e tente de novo.' : SEM_CONEXAO)
    const mensagem = e instanceof Error ? e.message : String(e)
    return new Error(acao === 'ler' ? `Falha ao ler o banco: ${mensagem}` : `O banco recusou a gravação${codigo ? ` (${codigo})` : ''}: ${mensagem}`)
}

export function repositorioFirestore(): Repositorio {
    return {
        nome: `Firestore (${PROJETO})`,
        persistente: true,
        assinar(aoMudar, aoFalhar) {
            let clientes: Cliente[] | null = null
            let processos: Processo[] | null = null
            const entregar = () => {
                if (clientes && processos) aoMudar({ geradoEm: paraTextoLocal(), origem: 'Firestore', clientes, processos })
            }
            const receber = (snap: QuerySnapshot<DocumentData>, guardar: () => void) => {
                // Sem alcançar o servidor, o SDK entrega o cache — vazio numa aba nova — como se fosse a base. Avisar em vez de
                // mostrar uma lista vazia; quando a conexão volta, o snapshot do servidor substitui o aviso pela base.
                if (snap.metadata.fromCache && snap.empty) { aoFalhar(new Error(SEM_CONEXAO)); return }
                guardar()
                entregar()
            }
            const falhar = (e: Error) => aoFalhar(traduzir(e, 'ler'))
            // includeMetadataChanges: uma coleção VAZIA que sai do cache para o servidor não muda de conteúdo, e sem isso o SDK não
            // avisaria — o "sem conexão" ficaria preso na tela mesmo depois de a rede voltar (primeira ativação, banco ainda vazio).
            const opcoes = { includeMetadataChanges: true }
            const pararClientes = onSnapshot(collection(db, COLECAO_CLIENTES), opcoes, snap => receber(snap, () => { clientes = docs<Cliente>(snap) }), falhar)
            const pararProcessos = onSnapshot(collection(db, COLECAO_PROCESSOS), opcoes, snap => receber(snap, () => { processos = docs<Processo>(snap) }), falhar)
            return () => { pararClientes(); pararProcessos() }
        },
        salvarCliente: cliente => gravar(COLECAO_CLIENTES, cliente),
        salvarProcesso: processo => gravar(COLECAO_PROCESSOS, processo),
        definirExclusao: (tipo, registro, excluir) => marcarExclusao(tipo === 'cliente' ? COLECAO_CLIENTES : COLECAO_PROCESSOS, registro, excluir),
    }
}

/**
 * Exclusão lógica / restauração, na mesma transação com `versao` e `historico` das edições. Excluir acrescenta
 * `excluidoEm` (carimbo do servidor) e `excluidoPor`; restaurar grava o conteúdo sem os dois. O resto do documento
 * vem do próprio banco — a tela só manda id e versão —, então nada que outra pessoa gravou é perdido.
 */
async function marcarExclusao(colecao: string, registro: { id: string; versao?: number }, excluir: boolean): Promise<void> {
    const ref = doc(db, colecao, registro.id)
    const quem = auth.currentUser?.email ?? null
    const acao = excluir ? 'excluir' : 'restaurar'
    try {
        await runTransaction(db, async tx => {
            const atual = await tx.get(ref)
            if (!atual.exists()) throw new Error('Este registro não existe mais no banco. Recarregue a página.')
            const dados = atual.data()
            const versaoNoBanco = (dados.versao as number | undefined) ?? 0
            if (versaoNoBanco !== (registro.versao ?? 0))
                throw new Error(`Outra pessoa alterou este registro agora há pouco (${dados.atualizadoPor ?? 'sem identificação'}). Recarregue a página e confira antes de ${acao}.`)
            if (!!dados.excluidoEm === excluir) throw new Error(excluir ? 'Este registro já está na lixeira.' : 'Este registro já foi restaurado.')
            tx.set(doc(collection(ref, 'historico')), { ...dados, arquivadoEm: serverTimestamp(), arquivadoPor: quem })
            const { excluidoEm: _e, excluidoPor: _p, versao: _v, atualizadoEm: _a, atualizadoPor: _b, ...conteudo } = dados
            tx.set(ref, {
                ...conteudo,
                ...(excluir ? { excluidoEm: serverTimestamp(), excluidoPor: quem } : {}),
                versao: versaoNoBanco + 1,
                atualizadoEm: serverTimestamp(),
                atualizadoPor: quem,
            })
        })
    } catch (e) {
        if (e instanceof FirebaseError) throw traduzir(e, 'excluir')
        throw e
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
    try {
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
    } catch (e) {
        // Os erros lançados acima já vêm em português; os do SDK (regras, rede) chegam em inglês e sem causa.
        if (e instanceof FirebaseError) throw traduzir(e, 'gravar')
        throw e
    }
}

function docs<T>(snap: QuerySnapshot<DocumentData>): T[] {
    // `ordem` guarda a posição da planilha na importação, para a árvore sair na mesma ordem de lá.
    // serverTimestamps 'estimate': logo depois de excluir, o carimbo ainda não voltou do servidor; sem a estimativa ele
    // viria null e o registro "piscaria" como ativo até a confirmação.
    return snap.docs
        .map(d => {
            const { excluidoEm, atualizadoEm: _a, atualizadoPor: _b, ...resto } = d.data({ serverTimestamps: 'estimate' }) as T & {
                ordem?: number; atualizadoEm?: unknown; atualizadoPor?: unknown; excluidoEm?: { toDate?: () => Date } | null
            }
            const quando = excluidoEm?.toDate ? paraTextoLocal(excluidoEm.toDate()) : undefined
            return { ...resto, id: d.id, ...(quando ? { excluidoEm: quando } : {}) } as T & { ordem?: number }
        })
        .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9))
}
