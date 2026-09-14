import { useState, type ReactNode } from 'react'
import { CalendarDays, Clock, ExternalLink, Eye, FileText, Folder, History, Landmark, Pencil, Plus, Scale, Search, Tag } from 'lucide-react'
import { estadoAcesso } from '../lib/acesso.ts'
import { montarArvore } from '../lib/arvore.ts'
import { formatarDataHora } from '../lib/formatacao.ts'
import type { Cliente, Processo } from '../tipos.ts'
import ArvoreProcessos from './ArvoreProcessos.tsx'
import CartaoInfo from './CartaoInfo.tsx'
import FormularioCliente from './FormularioCliente.tsx'
import FormularioProcesso from './FormularioProcesso.tsx'

interface Props {
    cliente: Cliente
    processos: Processo[]
    /** Processo a abrir já selecionado (vindo da busca por número). */
    processoInicialId?: string
    todosClientes: Cliente[]
    todosProcessos: Processo[]
    onSalvarCliente: (cliente: Cliente) => Promise<void>
    onSalvarProcesso: (processo: Processo) => Promise<void>
}

type Modo =
    | { tipo: 'ver' }
    | { tipo: 'editarProcesso'; id: string }
    | { tipo: 'novoProcesso'; origemId?: string }
    | { tipo: 'editarCliente' }

// Tela 2 — árvore processual à esquerda (como no SEI), cartões e situação atual do processo selecionado à direita.
// O lápis (no cliente e em cada processo) e o "Novo processo" abrem o formulário no lugar dos cartões.
export default function PainelCliente({ cliente, processos, processoInicialId, todosClientes, todosProcessos, onSalvarCliente, onSalvarProcesso }: Props) {
    const { raizes, orfaos } = montarArvore(processos)
    const [selecionadoId, setSelecionadoId] = useState(
        processoInicialId && processos.some(x => x.id === processoInicialId) ? processoInicialId : raizes[0]?.processo.id,
    )
    const [modo, setModo] = useState<Modo>({ tipo: 'ver' })
    const p = processos.find(x => x.id === selecionadoId)
    const relacionados = processos.filter(x => x.vinculo === 'relacionado')
    const acesso = p ? estadoAcesso(p) : 'desconhecido'
    const expirado = acesso === 'expirado'
    const nomeSistema = p?.sistema ?? 'sistema de origem'
    const situacao = p?.situacaoAtual || p?.observacao

    const selecionar = (id: string) => {
        setSelecionadoId(id)
        setModo({ tipo: 'ver' })
    }
    const salvarProcesso = async (processo: Processo) => {
        await onSalvarProcesso(processo)
        setSelecionadoId(processo.id)
        setModo({ tipo: 'ver' })
    }
    const salvarCliente = async (c: Cliente) => {
        await onSalvarCliente(c)
        setModo({ tipo: 'ver' })
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[21rem_1fr]">
            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {raizes.length ? (
                    <ArvoreProcessos raizes={raizes} orfaos={orfaos} selecionadoId={selecionadoId} onSelecionar={selecionar}
                        onEditar={id => { setSelecionadoId(id); setModo({ tipo: 'editarProcesso', id }) }} />
                ) : (
                    <p className="text-sm text-slate-500">Nenhum processo cadastrado para este cliente.</p>
                )}
                <div className="mt-4 border-t border-slate-200 pt-4">
                    <button onClick={() => setModo({ tipo: 'novoProcesso', origemId: undefined })}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-fg-300 px-3 py-2 text-sm font-medium text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                        <Plus size={16} /> Novo processo
                    </button>
                    {p && (
                        <button onClick={() => setModo({ tipo: 'novoProcesso', origemId: p.id })}
                            className="mt-2 w-full text-center text-xs text-fg-600 hover:underline">
                            + desdobramento de {p.numero}
                        </button>
                    )}
                </div>
                {p && (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                        {p.linkProcesso ? (
                            <a href={p.linkProcesso} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-fg-700 hover:underline">
                                <Search size={18} /> Consultar andamento no {nomeSistema} <ExternalLink size={14} className="opacity-70" />
                            </a>
                        ) : (
                            <span className="flex items-center gap-2 text-sm text-slate-500" title="Cadastre o link do processo (lápis ao lado do número)">
                                <Search size={18} /> Consultar andamento (sem link)
                            </span>
                        )}
                    </div>
                )}
                {relacionados.length > 0 && (
                    <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
                        <p className="font-medium text-slate-700">Processos relacionados:</p>
                        <ul className="mt-1 space-y-0.5 pl-4 text-slate-600">
                            {Object.entries(contarPor(relacionados, x => x.tipo ?? 'Sem tipo')).map(([tipo, n]) => (
                                <li key={tipo}>{tipo} ({n})</li>
                            ))}
                        </ul>
                    </div>
                )}
            </aside>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ouro-700">Painel do cliente</p>
                        <h1 className="flex items-center gap-2 font-slab text-xl font-bold leading-tight text-fg-700 md:text-2xl">
                            <span className="min-w-0">{cliente.nome}</span>
                            <button onClick={() => setModo({ tipo: 'editarCliente' })} title="Editar dados do cliente" aria-label="Editar dados do cliente"
                                className="shrink-0 rounded p-1 text-slate-500 hover:bg-ouro-100 hover:text-ouro-700 focus:outline-none focus:ring-2 focus:ring-ouro-500/70">
                                <Pencil size={16} />
                            </button>
                        </h1>
                        {cliente.numeroNexus && <p className="mt-0.5 text-xs text-slate-500">Nº Nexus {cliente.numeroNexus}</p>}
                    </div>
                    {/* Órgão no canto, pequeno; a pasta do OneDrive virou cartão ao lado do processo (troca pedida em 14/09). */}
                    {p && (
                        <div className="flex shrink-0 flex-wrap gap-2 md:justify-end">
                            <span title={p.orgaoNome ?? (p.orgaoSigla ? 'Órgão sem nome completo na aba Listas' : 'Órgão não informado')}
                                className="flex items-center gap-1.5 rounded-md border border-[#e3dab2] bg-[#f3efdc] px-3 py-1.5 text-sm font-medium text-ouro-700">
                                <Landmark size={16} /> {p.orgaoSigla ?? 'Órgão —'}
                            </span>
                        </div>
                    )}
                </div>

                {modo.tipo === 'editarCliente' && (
                    <FormularioCliente key={cliente.id} inicial={cliente} todosClientes={todosClientes} onSalvar={salvarCliente} onCancelar={() => setModo({ tipo: 'ver' })} />
                )}
                {modo.tipo === 'novoProcesso' && (
                    <>
                        <TituloFormulario>Novo processo de {cliente.nome}</TituloFormulario>
                        <FormularioProcesso key={`novo:${modo.origemId ?? ''}`} clienteId={cliente.id} origemInicialId={modo.origemId} processosDoCliente={processos} todosProcessos={todosProcessos}
                            onSalvar={salvarProcesso} onCancelar={() => setModo({ tipo: 'ver' })} />
                    </>
                )}
                {modo.tipo === 'editarProcesso' && (() => {
                    const alvo = processos.find(x => x.id === modo.id)
                    return alvo ? (
                        <>
                            <TituloFormulario>Editar {alvo.numero}</TituloFormulario>
                            <FormularioProcesso key={alvo.id} inicial={alvo} clienteId={cliente.id} processosDoCliente={processos} todosProcessos={todosProcessos}
                                onSalvar={salvarProcesso} onCancelar={() => setModo({ tipo: 'ver' })} />
                        </>
                    ) : null
                })()}

                {modo.tipo === 'ver' && p && (
                    <>
                        <div className="grid gap-4 md:grid-cols-3">
                            {/* O cartão do número é o atalho para o SEI: clicar nele abre o processo. */}
                            <CartaoInfo icone={FileText} cor="processo" rotulo={p.sistema ?? 'Processo'} valor={p.numero}
                                detalhe={descreverAcesso(p, acesso)} alerta={expirado} href={p.linkProcesso} titulo="Abrir o processo no sistema de origem (nova aba)" className="md:col-span-2" />
                            <CartaoInfo icone={Folder} cor="pasta" rotulo="Pasta no OneDrive" valor={cliente.linkPasta ? 'Processos do cliente' : 'Sem link'}
                                detalhe={cliente.linkPasta ? 'Documentos do cliente no OneDrive' : 'Cadastre o link (lápis ao lado do nome)'} href={cliente.linkPasta} titulo="Abrir a pasta do cliente no OneDrive (nova aba)" />
                            <CartaoInfo icone={Tag} cor="tipo" rotulo="Tipo" valor={p.tipo} />
                            <CartaoInfo icone={Scale} cor="natureza" rotulo="Natureza" valor={p.natureza} />
                            <CartaoInfo icone={Clock} cor="status" rotulo="Status" valor={p.status} />
                        </div>

                        <div className="mt-6 grid gap-6 rounded-xl border border-slate-200 bg-slate-50/60 p-5 md:grid-cols-[1fr_17rem]">
                            <div>
                                <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                                    <History size={20} className="text-fg-700" /> Histórico / Situação atual
                                </h2>
                                {p.objeto && (
                                    <p className="mb-2 text-sm text-slate-600"><span className="font-semibold text-slate-700">Objeto:</span> {p.objeto}</p>
                                )}
                                <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-700">
                                    {situacao || 'Sem situação registrada (situação atual e observação vazias). Use o lápis ao lado do número para preencher.'}
                                </p>
                                {!p.situacaoAtual && p.observacao && <p className="mt-2 text-xs text-slate-500">Texto da observação (situação atual ainda não preenchida).</p>}
                            </div>
                            <div className="md:border-l md:border-slate-200 md:pl-6">
                                <h2 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                                    <CalendarDays size={20} className="text-fg-700" /> Última movimentação
                                </h2>
                                {p.ultimaMovimentacao?.dataHora || p.ultimaMovimentacao?.descricao ? (
                                    <>
                                        {p.ultimaMovimentacao.dataHora && <p className="font-semibold">{formatarDataHora(p.ultimaMovimentacao.dataHora)}</p>}
                                        {p.ultimaMovimentacao.descricao && <p className="text-sm text-slate-600">{p.ultimaMovimentacao.descricao}</p>}
                                    </>
                                ) : (
                                    <p className="text-sm text-slate-500">Sem registro.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-6">
                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                {p.linkProcesso ? (
                                    <a href={p.linkProcesso} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 rounded-lg bg-fg-700 px-5 py-3 font-semibold text-white shadow hover:bg-fg-800">
                                        <Eye size={20} /> Ver andamento do processo <ExternalLink size={16} className="opacity-80" />
                                    </a>
                                ) : (
                                    <span title="Cadastre o link do processo (lápis ao lado do número)"
                                        className="flex cursor-not-allowed items-center gap-2 rounded-lg border border-dashed border-slate-300 px-5 py-3 font-medium text-slate-500">
                                        <Eye size={20} /> Ver andamento do processo (sem link)
                                    </span>
                                )}
                                <button onClick={() => setModo({ tipo: 'editarProcesso', id: p.id })}
                                    className="flex items-center gap-2 rounded-lg border border-fg-300 px-4 py-3 text-sm font-medium text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                                    <Pencil size={16} /> Editar este processo
                                </button>
                                {/* "Visualizar Peças" e "Enviar Comunicação" saíram da tela até serem definidos (relatório, item 8). */}
                                <p className="text-sm text-slate-500">Visualizar peças e enviar comunicação: em definição para o MVP.</p>
                            </div>
                            {expirado && (
                                <p className="mt-3 text-sm font-medium text-rose-700">
                                    Acesso externo expirado: o link pode não abrir o processo. Peça a renovação ao órgão e marque "Solicitar renovação" no processo (lápis).
                                </p>
                            )}
                        </div>
                    </>
                )}
                {modo.tipo === 'ver' && !p && <p className="text-slate-500">Selecione um processo na árvore ou cadastre o primeiro.</p>}
            </section>
        </div>
    )
}

function TituloFormulario({ children }: { children: ReactNode }) {
    return <h2 className="mb-4 font-slab text-lg font-bold text-fg-700">{children}</h2>
}

function descreverAcesso(p: Processo, estado: ReturnType<typeof estadoAcesso>): string | undefined {
    const a = p.acesso
    if (!a) return p.linkProcesso ? undefined : 'Sem link cadastrado'
    const data = a.termino ? formatarDataHora(a.termino) : ''
    switch (estado) {
        case 'expirado': return data ? `Acesso expirado em ${data}` : 'Acesso expirado'
        case 'a-vencer': return `Acesso vence em ${data}`
        case 'ok': return data ? `Acesso até ${data}` : 'Acesso ativo'
        case 'sem-info': return 'Acesso: sem informação'
        case 'fisico': return 'Processo físico'
        default: return a.forma
    }
}

function contarPor<T>(lista: T[], chave: (x: T) => string): Record<string, number> {
    const r: Record<string, number> = {}
    for (const x of lista) r[chave(x)] = (r[chave(x)] ?? 0) + 1
    return r
}
