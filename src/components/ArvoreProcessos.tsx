import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Folder, FolderOpen, Lock, Pencil } from 'lucide-react'
import { semAcesso } from '../lib/acesso.ts'
import type { NoArvore } from '../lib/arvore.ts'
import type { Processo } from '../tipos.ts'

interface Props {
    raizes: NoArvore[]
    orfaos: Processo[]
    selecionadoId?: string
    onSelecionar: (id: string) => void
    /** Lápis ao lado do número: abre o formulário de edição daquele processo. */
    onEditar?: (id: string) => void
}

// Árvore como a do SEI: cada processo principal é um ramo (pasta ouro, cheia); recursos, comunicações e demais
// desdobramentos ficam embaixo (pasta azul, cheia). Ramo com filhos recolhe/expande pela seta.
// Número em vermelho + cadeado = acesso externo expirado.
export default function ArvoreProcessos({ raizes, orfaos, selecionadoId, onSelecionar, onEditar }: Props) {
    const hoje = new Date()
    const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
    const idsComFilhos = comFilhos(raizes)
    const alternar = (id: string) =>
        setRecolhidos(prev => {
            const novo = new Set(prev)
            if (novo.has(id)) novo.delete(id)
            else novo.add(id)
            return novo
        })
    const tudoRecolhido = idsComFilhos.length > 0 && idsComFilhos.every(id => recolhidos.has(id))
    // Selecionou (ou salvou) um processo dentro de um ramo recolhido? Abre o caminho até ele.
    const presente = !!selecionadoId && existe(raizes, selecionadoId)
    useEffect(() => {
        if (!selecionadoId || !presente) return
        const caminho = ancestrais(raizes, selecionadoId)
        if (caminho.some(id => recolhidos.has(id))) setRecolhidos(prev => { const novo = new Set(prev); caminho.forEach(id => novo.delete(id)); return novo })
    }, [selecionadoId, presente]) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <nav aria-label="Processos do cliente">
            {idsComFilhos.length > 0 && (
                <div className="mb-2 flex justify-end">
                    <button onClick={() => setRecolhidos(tudoRecolhido ? new Set() : new Set(idsComFilhos))}
                        className="text-[11px] font-medium text-fg-600 hover:text-fg-800 hover:underline">
                        {tudoRecolhido ? 'Expandir tudo' : 'Recolher tudo'}
                    </button>
                </div>
            )}
            <ul className="space-y-2">
                {raizes.map(no => (
                    <Ramo key={no.processo.id} no={no} principal selecionadoId={selecionadoId} onSelecionar={onSelecionar} onEditar={onEditar}
                        hoje={hoje} recolhidos={recolhidos} alternar={alternar} />
                ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1"><Folder size={14} className="fill-ouro-500 text-ouro-500" /> principal</span>
                <span className="flex items-center gap-1"><Folder size={14} className="fill-sky-600 text-sky-600" /> desdobramento</span>
                <span className="flex items-center gap-1 font-medium text-rose-700"><Lock size={12} /> acesso expirado</span>
            </p>
            {orfaos.length > 0 && (
                <p className="mt-3 flex gap-2 rounded bg-amber-50 p-3 text-xs text-amber-800">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span>
                        Processo de origem inexistente ou circular na planilha — exibido como principal: {orfaos.map(p => p.numero).join(', ')}.
                    </span>
                </p>
            )}
        </nav>
    )
}

const existe = (nos: NoArvore[], id: string): boolean => nos.some(n => n.processo.id === id || existe(n.filhos, id))

/** Ids dos ramos acima do processo (sem ele mesmo), da raiz até o pai. */
function ancestrais(nos: NoArvore[], alvo: string, trilha: string[] = []): string[] {
    for (const no of nos) {
        if (no.processo.id === alvo) return trilha
        const achado = ancestrais(no.filhos, alvo, [...trilha, no.processo.id])
        if (achado.length || no.filhos.some(f => f.processo.id === alvo)) return achado
    }
    return []
}

const comFilhos = (nos: NoArvore[]): string[] =>
    nos.flatMap(n => (n.filhos.length ? [n.processo.id, ...comFilhos(n.filhos)] : []))

/** Quantos processos ficam escondidos quando o ramo está recolhido (filhos, netos…). */
const contar = (no: NoArvore): number => no.filhos.reduce((s, f) => s + 1 + contar(f), 0)

interface RamoProps {
    no: NoArvore
    principal?: boolean
    selecionadoId?: string
    onSelecionar: (id: string) => void
    onEditar?: (id: string) => void
    hoje: Date
    recolhidos: Set<string>
    alternar: (id: string) => void
}

function Ramo({ no, principal, selecionadoId, onSelecionar, onEditar, hoje, recolhidos, alternar }: RamoProps) {
    const { processo, filhos } = no
    const ativo = processo.id === selecionadoId
    const expirado = semAcesso(processo, hoje)
    const recolhido = recolhidos.has(processo.id)
    const Icone = ativo ? FolderOpen : Folder
    // Pasta cheia; na linha ativa o miolo clareia e o contorno escurece, para a pasta "aberta" ser visível.
    const corPasta = principal
        ? ativo ? 'fill-ouro-300 text-ouro-700' : 'fill-ouro-500 text-ouro-500'
        : ativo ? 'fill-sky-200 text-sky-700' : 'fill-sky-600 text-sky-600'
    const corNumero = expirado ? 'text-rose-700' : principal ? 'text-fg-700' : 'text-slate-800'
    return (
        <li>
            <div className={`group flex items-start gap-1 rounded-md pr-1 ${ativo ? 'bg-fg-50 ring-1 ring-ouro-500/70' : 'hover:bg-slate-100'}`}>
                {filhos.length > 0 ? (
                    <button onClick={() => alternar(processo.id)} aria-label={recolhido ? `Expandir ${processo.numero}` : `Recolher ${processo.numero}`}
                        aria-expanded={!recolhido} className="mt-1.5 shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700">
                        {recolhido ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                ) : (
                    <span className="mt-1.5 w-[22px] shrink-0" />
                )}
                <button onClick={() => onSelecionar(processo.id)} aria-current={ativo} title={expirado ? 'Acesso externo expirado' : undefined}
                    className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pr-1 text-left">
                    <Icone size={20} className={`mt-0.5 shrink-0 ${corPasta}`} />
                    <span className="min-w-0 flex-1">
                        <span className={`flex items-center gap-1 text-sm ${principal ? 'font-semibold' : ''} ${corNumero}`}>
                            <span className="truncate">{processo.numero}</span>
                            {expirado && <Lock size={13} className="shrink-0" aria-label="acesso expirado" />}
                            {recolhido && filhos.length > 0 && (
                                <span className="shrink-0 rounded-full bg-sky-100 px-1.5 text-[10px] font-semibold text-sky-700" title={`${contar(no)} processos recolhidos`}>+{contar(no)}</span>
                            )}
                        </span>
                        {(processo.tipo || processo.vinculo === 'relacionado') && (
                            <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500">
                                {processo.tipo && <span className="truncate">{processo.tipo}</span>}
                                {processo.vinculo === 'relacionado' && <span className="rounded bg-slate-200 px-1 text-[10px] uppercase tracking-wide text-slate-600">relacionado</span>}
                            </span>
                        )}
                    </span>
                </button>
                {onEditar && (
                    <button onClick={() => onEditar(processo.id)} title={`Editar ${processo.numero}`} aria-label={`Editar ${processo.numero}`}
                        className={`mt-1.5 shrink-0 rounded p-1 text-slate-500 hover:bg-ouro-100 hover:text-ouro-700 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70 ${ativo ? '' : 'opacity-0 group-hover:opacity-100'}`}>
                        <Pencil size={14} />
                    </button>
                )}
            </div>
            {filhos.length > 0 && !recolhido && (
                <ul className="ml-4 space-y-1 border-l-2 border-sky-200 pl-2">
                    {filhos.map(filho => (
                        <Ramo key={filho.processo.id} no={filho} selecionadoId={selecionadoId} onSelecionar={onSelecionar} onEditar={onEditar}
                            hoje={hoje} recolhidos={recolhidos} alternar={alternar} />
                    ))}
                </ul>
            )}
        </li>
    )
}
