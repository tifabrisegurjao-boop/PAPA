import { useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, FileText, Lock, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { comLiberacao, semAcesso, soComLiberacao } from '../lib/acesso.ts'
import { buscarProcessos, filtrarClientes } from '../lib/busca.ts'
import { bloqueioRestaurarCliente, bloqueioRestaurarProcesso, type Lixeira } from '../lib/exclusao.ts'
import { formatarDataHora } from '../lib/formatacao.ts'
import { paginar } from '../lib/paginacao.ts'
import type { Base, Cliente, Processo, TipoPessoa } from '../tipos.ts'
import FormularioCliente from './FormularioCliente.tsx'

const MAX_PROCESSOS_LISTADOS = 40

interface Resumo { total: number; expirados: number; liberados: number }

/** Filtro da tela inicial (pedido de 01/10/2026): todos os clientes, ou só os que têm processo com acesso valendo hoje. */
type Filtro = 'todos' | 'liberacao'
const CHAVE_FILTRO = 'papa:filtro'
function lerFiltro(): Filtro {
    try { return sessionStorage.getItem(CHAVE_FILTRO) === 'liberacao' ? 'liberacao' : 'todos' } catch { return 'todos' }
}

interface Props {
    /** Só o que está ativo (os excluídos ficam em `lixeira`). */
    base: Base
    lixeira: Lixeira
    /** Todos os ids de cliente do banco, inclusive os da lixeira (o cadastro novo não pode reusar um). */
    idsClientes: string[]
    termo: string
    onSalvarCliente: (cliente: Cliente) => Promise<void>
    onRestaurar: (tipo: 'cliente' | 'processo', registro: Cliente | Processo) => Promise<void>
}

// Tela 1 — inspirada no Controle de Processos do SEI: as colunas "recebidos/gerados" viram Pessoa física/jurídica.
export default function ListaClientes({ base, lixeira, idsClientes, termo, onSalvarCliente, onRestaurar }: Props) {
    const [cadastrando, setCadastrando] = useState(false)
    // Lembrado nesta aba (como a página de cada coluna): abrir um cliente e voltar mantém o filtro.
    const [filtro, setFiltro] = useState<Filtro>(lerFiltro)
    const mudarFiltro = (novo: Filtro) => {
        setFiltro(novo)
        try { sessionStorage.setItem(CHAVE_FILTRO, novo) } catch { /* sem armazenamento: só não lembra */ }
    }
    const hoje = new Date()
    const resumo = new Map<string, Resumo>()
    for (const p of base.processos) {
        const r = resumo.get(p.clienteId) ?? { total: 0, expirados: 0, liberados: 0 }
        r.total++
        if (semAcesso(p, hoje)) r.expirados++
        if (comLiberacao(p, hoje)) r.liberados++
        resumo.set(p.clienteId, r)
    }
    const soLiberados = filtro === 'liberacao'
    const vista = soLiberados ? soComLiberacao(base, hoje) : base
    const visiveis = filtrarClientes(vista.clientes, vista.processos, termo)
    const semTipo = visiveis.filter(c => !c.tipoPessoa)
    const encontrados = buscarProcessos(vista.processos, termo)
    // Página lembrada por coluna: muda a busca OU o filtro, volta para a página 1.
    const chaveDaLista = soLiberados ? `${termo}\u0001liberacao` : termo
    const nomeDe = new Map(base.clientes.map(c => [c.id, c.nome]))
    const totalExpirados = [...resumo.values()].reduce((s, r) => s + r.expirados, 0)

    const cadastrar = async (cliente: Cliente) => {
        await onSalvarCliente(cliente)
        setCadastrando(false)
        window.location.hash = `#/cliente/${encodeURIComponent(cliente.id)}`
    }

    return (
        <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <h1 className="font-slab text-2xl font-bold text-fg-700 md:text-3xl">Controle de Processos</h1>
                    <div role="group" aria-label="Mostrar clientes" className="inline-flex rounded-full border border-slate-300 bg-white p-0.5 text-xs font-medium shadow-sm">
                        {([['todos', 'Todos', 'Todos os clientes'], ['liberacao', 'Com liberação', 'Só clientes com algum processo de acesso externo valendo hoje']] as const).map(([valor, texto, dica]) => (
                            <button key={valor} type="button" aria-pressed={filtro === valor} title={dica} onClick={() => mudarFiltro(valor)}
                                className={`rounded-full px-3 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ouro-500/70 ${
                                    filtro === valor ? 'bg-fg-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                {texto}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Lock size={14} className="text-rose-600" /> nome em vermelho = cliente com acesso expirado
                        {totalExpirados > 0 && <span className="text-rose-600">({totalExpirados} {totalExpirados === 1 ? 'processo' : 'processos'})</span>}
                    </p>
                    <button onClick={() => setCadastrando(v => !v)} aria-expanded={cadastrando}
                        className="flex items-center gap-2 rounded-lg bg-fg-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-fg-800">
                        <UserPlus size={16} /> Cadastrar cliente
                    </button>
                </div>
            </div>

            {cadastrando && (
                <section className="mb-6 rounded-xl border border-ouro-300 bg-white p-5 shadow-sm">
                    <FormularioCliente todosClientes={base.clientes} idsUsados={idsClientes} onSalvar={cadastrar} onCancelar={() => setCadastrando(false)} />
                </section>
            )}

            {encontrados.length > 0 && <ProcessosEncontrados processos={encontrados} nomeDe={nomeDe} hoje={hoje} />}

            <div className="grid gap-6 md:grid-cols-2">
                <Coluna chave="pf" termo={chaveDaLista} titulo="Pessoa física" clientes={doTipo(visiveis, 'PF')} resumo={resumo} soLiberados={soLiberados} />
                <Coluna chave="pj" termo={chaveDaLista} titulo="Pessoa jurídica" clientes={doTipo(visiveis, 'PJ')} resumo={resumo} soLiberados={soLiberados} />
            </div>
            {semTipo.length > 0 && (
                <div className="mt-6">
                    <Coluna chave="sem-tipo" termo={chaveDaLista} titulo="Sem classificação (preencher PF/PJ)" clientes={ordenar(semTipo)} resumo={resumo} soLiberados={soLiberados} alerta />
                </div>
            )}
            {(termo || soLiberados) && visiveis.length === 0 && encontrados.length === 0 && (() => {
                // Só existe na lixeira, ou só fora do filtro? Dizer isso evita recadastrar o que já está na base.
                const naLixeira = termo ? filtrarClientes(lixeira.clientes, [], termo).length + buscarProcessos(lixeira.processos, termo).length : 0
                const foraDoFiltro = soLiberados ? filtrarClientes(base.clientes, base.processos, termo).length + buscarProcessos(base.processos, termo).length : 0
                return (
                    <p className="mt-6 text-center text-slate-500">
                        {termo ? <>Nenhum cliente ou processo ativo encontrado para “{termo}”{soLiberados && ' entre os que estão com liberação'}.</> : 'Nenhum cliente com processo com liberação hoje.'}
                        {foraDoFiltro > 0 && (
                            <> {foraDoFiltro === 1 ? 'Há 1 resultado' : `Há ${foraDoFiltro} resultados`} sem liberação:{' '}
                                <button type="button" onClick={() => mudarFiltro('todos')} className="font-medium text-fg-700 underline">mostrar todos</button>.</>
                        )}
                        {naLixeira > 0 && <> {naLixeira === 1 ? '1 item da Lixeira bate' : `${naLixeira} itens da Lixeira batem`} com a busca (fim da página): restaure em vez de cadastrar de novo.</>}
                    </p>
                )
            })()}
            {base.avisos && base.avisos.length > 0 && (
                <details className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <summary className="flex cursor-pointer items-center gap-2 font-medium">
                        <AlertTriangle size={18} /> A planilha tem {base.avisos.length} {base.avisos.length === 1 ? 'ponto' : 'pontos'} para revisar
                    </summary>
                    <ul className="mt-3 list-disc space-y-1 pl-6">
                        {base.avisos.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                </details>
            )}
            {lixeira.clientes.length + lixeira.processos.length > 0 && <PainelLixeira ativa={base} lixeira={lixeira} onRestaurar={onRestaurar} />}
        </>
    )
}

// Lixeira: o que foi excluído pela tela (exclusão lógica, src/lib/exclusao.ts). Fechada por padrão, no fim da página.
function PainelLixeira({ ativa, lixeira, onRestaurar }: { ativa: Base; lixeira: Lixeira; onRestaurar: Props['onRestaurar'] }) {
    const total = lixeira.clientes.length + lixeira.processos.length
    const nomeDe = new Map([...ativa.clientes, ...lixeira.clientes].map(c => [c.id, c.nome]))
    const quando = (r: { excluidoEm?: string; excluidoPor?: string }) =>
        r.excluidoEm
            ? `excluído em ${formatarDataHora(r.excluidoEm)}${r.excluidoPor ? ` por ${r.excluidoPor}` : ''}`
            : 'não foi excluído — está aqui porque o cliente dele está na lixeira'
    return (
        <details className="mt-8 rounded-lg border border-slate-300 bg-white p-4 text-sm shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                <Trash2 size={18} /> Lixeira: {total} {total === 1 ? 'item excluído' : 'itens excluídos'} — dá para restaurar
            </summary>
            {lixeira.clientes.length > 0 && (
                <>
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Clientes</h3>
                    <ul className="divide-y divide-slate-100">
                        {lixeira.clientes.map(c => (
                            <ItemLixeira key={c.id} titulo={c.nome} detalhe={quando(c)} bloqueio={bloqueioRestaurarCliente(c, ativa.clientes)}
                                onRestaurar={() => onRestaurar('cliente', c)} />
                        ))}
                    </ul>
                </>
            )}
            {lixeira.processos.length > 0 && (
                <>
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Processos</h3>
                    <ul className="divide-y divide-slate-100">
                        {lixeira.processos.map(p => (
                            <ItemLixeira key={p.id} titulo={p.numero} detalhe={`${nomeDe.get(p.clienteId) ?? p.clienteId} · ${quando(p)}`}
                                bloqueio={bloqueioRestaurarProcesso(p, ativa, lixeira)} onRestaurar={() => onRestaurar('processo', p)} />
                        ))}
                    </ul>
                </>
            )}
        </details>
    )
}

function ItemLixeira({ titulo, detalhe, bloqueio, onRestaurar }: { titulo: string; detalhe: string; bloqueio?: string; onRestaurar: () => Promise<void> }) {
    const [restaurando, setRestaurando] = useState(false)
    const [falha, setFalha] = useState('')
    const restaurar = async () => {
        setRestaurando(true)
        setFalha('')
        try {
            await onRestaurar() // deu certo: o item sai da lista e este componente desmonta
        } catch (e) {
            setFalha(e instanceof Error ? e.message : 'Não foi possível restaurar.')
            setRestaurando(false)
        }
    }
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div className="min-w-0">
                <p className="font-medium text-slate-800">{titulo}</p>
                <p className="text-xs text-slate-500">{detalhe}</p>
                {(bloqueio || falha) && <p className="mt-0.5 text-xs text-rose-700">{bloqueio ?? falha}</p>}
            </div>
            <button type="button" onClick={restaurar} disabled={!!bloqueio || restaurando}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-fg-300 px-3 py-1.5 text-xs font-semibold text-fg-700 hover:border-ouro-500 hover:bg-ouro-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent">
                <RotateCcw size={13} /> {restaurando ? 'Restaurando…' : 'Restaurar'}
            </button>
        </li>
    )
}

// Ordem alfabética do português: acento e caixa não mudam a posição (Ágata fica entre Adão e Bruno).
const ordenar = (lista: Cliente[]) => [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
const doTipo = (lista: Cliente[], tipo: TipoPessoa) => ordenar(lista.filter(c => c.tipoPessoa === tipo))

// Resultado da busca por número: leva direto ao processo dentro do painel do cliente.
function ProcessosEncontrados({ processos, nomeDe, hoje }: { processos: Processo[]; nomeDe: Map<string, string>; hoje: Date }) {
    const mostrados = processos.slice(0, MAX_PROCESSOS_LISTADOS)
    return (
        <section className="mb-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between bg-fg-900 px-5 py-3 text-white">
                <h2 className="text-lg font-semibold">Processos encontrados</h2>
                <span className="text-sm">{processos.length} {processos.length === 1 ? 'processo' : 'processos'}</span>
            </header>
            <ul className="divide-y divide-slate-100">
                {mostrados.map(p => {
                    const expirado = semAcesso(p, hoje)
                    return (
                        <li key={p.id}>
                            <a href={`#/cliente/${encodeURIComponent(p.clienteId)}/${encodeURIComponent(p.id)}`}
                                title={expirado ? 'Acesso externo expirado' : undefined}
                                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 hover:bg-fg-50">
                                <FileText size={18} className={`shrink-0 ${expirado ? 'text-rose-500' : 'text-fg-600'}`} />
                                <span className={`flex items-center gap-1 font-medium ${expirado ? 'text-rose-700' : 'text-slate-900'}`}>
                                    {p.numero}
                                    {expirado && <Lock size={13} aria-label="acesso expirado" />}
                                </span>
                                {p.tipo && <span className="text-sm text-slate-500">{p.tipo}</span>}
                                <span className="ml-auto text-sm text-slate-600">{nomeDe.get(p.clienteId) ?? p.clienteId}</span>
                            </a>
                        </li>
                    )
                })}
            </ul>
            {processos.length > mostrados.length && (
                <p className="px-5 py-2 text-xs text-slate-500">Mostrando {mostrados.length} de {processos.length}. Digite mais números para refinar.</p>
            )}
        </section>
    )
}

interface ColunaProps {
    /** Identifica a coluna para lembrar a página ao abrir um cliente e voltar. */
    chave: string
    /** Busca atual (mais o filtro): mudou, a coluna volta para a página 1. */
    termo: string
    titulo: string
    clientes: Cliente[]
    resumo: Map<string, Resumo>
    /** Filtro "Com liberação" ligado: a contagem de cada cliente passa a ser "N de M com liberação". */
    soLiberados?: boolean
    alerta?: boolean
}

// Página lembrada por aba do navegador: abrir um cliente e voltar mantém a página; busca nova começa da 1.
function lerPagina(chave: string, termo: string): number {
    try {
        const salvo = JSON.parse(sessionStorage.getItem(`papa:pagina:${chave}`) ?? 'null') as { termo: string; pagina: number } | null
        return salvo && salvo.termo === termo ? salvo.pagina : 1
    } catch {
        return 1
    }
}

function Coluna({ chave, termo, titulo, clientes, resumo, soLiberados, alerta }: ColunaProps) {
    const [pedida, setPedida] = useState(() => lerPagina(chave, termo))
    const [termoDaPagina, setTermoDaPagina] = useState(termo)
    // Busca mudou: volta para a página 1 (ajuste de estado durante o render, sem efeito extra).
    if (termoDaPagina !== termo) {
        setTermoDaPagina(termo)
        setPedida(1)
    }
    const { itens, pagina, totalPaginas, inicio, fim } = paginar(clientes, termoDaPagina === termo ? pedida : 1)
    const irPara = (n: number) => {
        setPedida(n)
        try { sessionStorage.setItem(`papa:pagina:${chave}`, JSON.stringify({ termo, pagina: n })) } catch { /* sem armazenamento: só não lembra */ }
    }
    return (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className={`flex items-center justify-between border-b-2 px-5 py-3 ${alerta ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-ouro-500 bg-fg-700 text-white'}`}>
                <h2 className="text-lg font-semibold">{titulo}</h2>
                <span className="text-sm">
                    {clientes.length} {clientes.length === 1 ? 'registro' : 'registros'}
                </span>
            </header>
            {clientes.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">Nenhum cliente.</p>
            ) : (
                <ul className="divide-y divide-slate-100">
                    {itens.map(c => {
                        const r = resumo.get(c.id) ?? { total: 0, expirados: 0, liberados: 0 }
                        const vermelho = r.expirados > 0
                        return (
                            <li key={c.id}>
                                <a href={`#/cliente/${encodeURIComponent(c.id)}`}
                                    title={vermelho ? `${r.expirados} de ${r.total} ${r.total === 1 ? 'processo' : 'processos'} com acesso expirado` : undefined}
                                    className={`flex items-center justify-between gap-4 px-5 py-2 hover:bg-fg-50 ${vermelho ? 'font-medium text-rose-700' : 'text-slate-800 hover:text-fg-700'}`}>
                                    <span className="flex min-w-0 items-center gap-1.5">
                                        <span className="truncate">{c.nome}</span>
                                        {vermelho && <Lock size={13} className="shrink-0" aria-label="acesso expirado" />}
                                    </span>
                                    <span className="shrink-0 text-xs text-slate-500">
                                        {soLiberados ? `${r.liberados} de ${r.total} com liberação` : `${r.total} ${r.total === 1 ? 'processo' : 'processos'}`}
                                    </span>
                                </a>
                            </li>
                        )
                    })}
                </ul>
            )}
            {totalPaginas > 1 && (
                <nav aria-label={`Páginas de ${titulo}`} className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-2 text-sm">
                    <button onClick={() => irPara(pagina - 1)} disabled={pagina <= 1}
                        className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-fg-700 hover:bg-ouro-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent">
                        <ChevronLeft size={16} /> Anterior
                    </button>
                    <span className="text-center text-xs tabular-nums text-slate-600">
                        {inicio}–{fim} de {clientes.length} · página {pagina} de {totalPaginas}
                    </span>
                    <button onClick={() => irPara(pagina + 1)} disabled={pagina >= totalPaginas}
                        className="flex items-center gap-1 rounded-md px-2 py-1 font-medium text-fg-700 hover:bg-ouro-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent">
                        Próxima <ChevronRight size={16} />
                    </button>
                </nav>
            )}
        </section>
    )
}
