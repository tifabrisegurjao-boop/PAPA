import { useState } from 'react'
import { AlertTriangle, FileText, Lock, UserPlus } from 'lucide-react'
import { semAcesso } from '../lib/acesso.ts'
import { buscarProcessos, filtrarClientes } from '../lib/busca.ts'
import type { Base, Cliente, Processo, TipoPessoa } from '../tipos.ts'
import FormularioCliente from './FormularioCliente.tsx'

const MAX_PROCESSOS_LISTADOS = 40

interface Resumo { total: number; expirados: number }

interface Props {
    base: Base
    termo: string
    onSalvarCliente: (cliente: Cliente) => Promise<void>
}

// Tela 1 — inspirada no Controle de Processos do SEI: as colunas "recebidos/gerados" viram Pessoa física/jurídica.
export default function ListaClientes({ base, termo, onSalvarCliente }: Props) {
    const [cadastrando, setCadastrando] = useState(false)
    const hoje = new Date()
    const resumo = new Map<string, Resumo>()
    for (const p of base.processos) {
        const r = resumo.get(p.clienteId) ?? { total: 0, expirados: 0 }
        r.total++
        if (semAcesso(p, hoje)) r.expirados++
        resumo.set(p.clienteId, r)
    }
    const visiveis = filtrarClientes(base.clientes, base.processos, termo)
    const semTipo = visiveis.filter(c => !c.tipoPessoa)
    const encontrados = buscarProcessos(base.processos, termo)
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
                <h1 className="font-slab text-2xl font-bold text-fg-700 md:text-3xl">Controle de Processos</h1>
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
                    <FormularioCliente todosClientes={base.clientes} onSalvar={cadastrar} onCancelar={() => setCadastrando(false)} />
                </section>
            )}

            {encontrados.length > 0 && <ProcessosEncontrados processos={encontrados} nomeDe={nomeDe} hoje={hoje} />}

            <div className="grid gap-6 md:grid-cols-2">
                <Coluna titulo="Pessoa física" clientes={doTipo(visiveis, 'PF')} resumo={resumo} />
                <Coluna titulo="Pessoa jurídica" clientes={doTipo(visiveis, 'PJ')} resumo={resumo} />
            </div>
            {semTipo.length > 0 && (
                <div className="mt-6">
                    <Coluna titulo="Sem classificação (preencher PF/PJ)" clientes={ordenar(semTipo)} resumo={resumo} alerta />
                </div>
            )}
            {termo && visiveis.length === 0 && encontrados.length === 0 && (
                <p className="mt-6 text-center text-slate-500">Nenhum cliente ou processo encontrado para “{termo}”.</p>
            )}
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
        </>
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
    titulo: string
    clientes: Cliente[]
    resumo: Map<string, Resumo>
    alerta?: boolean
}

function Coluna({ titulo, clientes, resumo, alerta }: ColunaProps) {
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
                    {clientes.map(c => {
                        const r = resumo.get(c.id) ?? { total: 0, expirados: 0 }
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
                                    <span className="shrink-0 text-xs text-slate-500">{r.total} {r.total === 1 ? 'processo' : 'processos'}</span>
                                </a>
                            </li>
                        )
                    })}
                </ul>
            )}
        </section>
    )
}
