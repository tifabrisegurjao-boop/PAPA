import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { ArrowLeft, CalendarDays, Clock, Copy, FileText, Filter, Folder, History, KeyRound, Landmark, LogIn, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import { comLiberacao, estadoAcesso } from '../lib/acesso.ts'
import { rotaDeAcesso } from '../lib/acessoSei.ts'
import { abrirNoSeiPelaExtensao, versaoDaExtensaoSei } from '../lib/extensaoSei.ts'
import { montarArvoreFiltrada } from '../lib/arvore.ts'
import { bloqueioExcluirCliente, bloqueioExcluirProcesso } from '../lib/exclusao.ts'
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
    /** Clientes e processos ATIVOS (sem os da lixeira): validações de nome/nº e bloqueios de exclusão. */
    todosClientes: Cliente[]
    todosProcessos: Processo[]
    /** Todos os ids do banco, inclusive os da lixeira: um cadastro novo não pode reusar o id de um excluído. */
    idsClientes: string[]
    idsProcessos: string[]
    /** Filtro "Com acesso" ligado (estado no App): árvore e cartões mostram só os processos com acesso valendo hoje. */
    soLiberados: boolean
    /** Desliga o filtro (o "ver todos" do aviso em cima da árvore). */
    aoVerTodos: () => void
    onSalvarCliente: (cliente: Cliente) => Promise<void>
    onSalvarProcesso: (processo: Processo) => Promise<void>
    /** Exclusão lógica: o registro vai para a Lixeira da tela inicial (dá para restaurar). */
    onExcluir: (tipo: 'cliente' | 'processo', registro: Cliente | Processo) => Promise<void>
}

type Modo =
    | { tipo: 'ver' }
    | { tipo: 'editarProcesso'; id: string }
    | { tipo: 'novoProcesso'; origemId?: string }
    | { tipo: 'editarCliente' }

// Tela 2 — árvore processual à esquerda (como no SEI), cartões e situação atual do processo selecionado à direita.
// O lápis (no cliente e em cada processo) e o "Novo processo" abrem o formulário no lugar dos cartões.
export default function PainelCliente({
    cliente, processos, processoInicialId, todosClientes, todosProcessos, idsClientes, idsProcessos, soLiberados, aoVerTodos, onSalvarCliente, onSalvarProcesso, onExcluir,
}: Props) {
    // O endereço (#/cliente/<id>/<processo>) aponta para um processo que o filtro esconderia: o endereço manda — este painel
    // já abre mostrando tudo e o filtro é desligado, para a lista acompanhar. Ninguém fica olhando o processo errado.
    const pedidoEscondido = soLiberados && !!processoInicialId && processos.some(x => x.id === processoInicialId && !comLiberacao(x))
    useEffect(() => { if (pedidoEscondido) aoVerTodos() }, [pedidoEscondido]) // eslint-disable-line react-hooks/exhaustive-deps
    // Filtro ligado: árvore, seleção e cartões enxergam só os processos com acesso válido — os outros ficam como se não
    // existissem (nenhum vermelho na tela). Formulários, validações e bloqueios continuam com a lista inteira.
    const filtrado = soLiberados && !pedidoEscondido
    const visiveis = filtrado ? processos.filter(x => comLiberacao(x)) : processos
    const { raizes, orfaos, origemOculta } = montarArvoreFiltrada(processos, visiveis)
    const [selecionadoId, setSelecionadoId] = useState(
        processoInicialId && visiveis.some(x => x.id === processoInicialId) ? processoInicialId : raizes[0]?.processo.id,
    )
    const [modo, setModo] = useState<Modo>({ tipo: 'ver' })
    // Selecionado que sumiu (excluído agora, por aqui ou por outra pessoa; ou escondido pelo filtro) cai no primeiro da árvore.
    const idSelecionado = selecionadoId && visiveis.some(x => x.id === selecionadoId) ? selecionadoId : raizes[0]?.processo.id
    const p = visiveis.find(x => x.id === idSelecionado)
    const relacionados = visiveis.filter(x => x.vinculo === 'relacionado')
    const acesso = p ? estadoAcesso(p) : 'desconhecido'
    const expirado = acesso === 'expirado'
    const rota = p ? rotaDeAcesso(p) : undefined
    // Id do processo cujo nº acabou de ser copiado (a faixa do login confirma; trocar de processo apaga a confirmação).
    const [copiado, setCopiado] = useState<string>()
    const copiarNumero = () => {
        if (!p) return
        const id = p.id
        // Sem permissão de área de transferência (navegador antigo, página sem https) o link abre do mesmo jeito.
        navigator.clipboard?.writeText(p.numero).then(() => setCopiado(id), () => setCopiado(undefined))
    }
    // Com a extensão "PAPA — Acesso ao SEI" instalada neste navegador, Entrar deixa de abrir o link: a extensão faz o
    // login com a conta do processo e abre o processo lá dentro. Sem ela, o link abre como sempre.
    const [versaoExtensao] = useState(versaoDaExtensaoSei)
    const temExtensao = !!versaoExtensao
    const [pedidoSei, setPedidoSei] = useState<{ id: string; texto: string; erro?: boolean }>()
    const entrarNoSei = (evento: MouseEvent<HTMLAnchorElement>) => {
        copiarNumero()
        if (!p || !rota?.host || !temExtensao) return
        evento.preventDefault()
        const id = p.id
        setPedidoSei({ id, texto: 'Pedindo à extensão para abrir o SEI…' })
        abrirNoSeiPelaExtensao({ numero: p.numero, conta: rota.conta, host: rota.host }).then(r =>
            setPedidoSei({
                id,
                erro: !r.ok,
                texto: r.ok ? 'A extensão está entrando no SEI em outra aba e vai abrir este processo.' : r.mensagem ?? 'A extensão não conseguiu abrir o SEI. Use "Abrir sem a extensão".',
            }),
        )
    }
    const situacao = p?.situacaoAtual || p?.observacao

    const selecionar = (id: string) => {
        setSelecionadoId(id)
        setModo({ tipo: 'ver' })
    }
    const salvarProcesso = async (processo: Processo) => {
        await onSalvarProcesso(processo)
        // Salvou um processo que o filtro esconderia (novo sem acesso, ou o acesso deixou de valer)? O filtro se desliga: o que a pessoa
        // acabou de salvar não pode "sumir" da árvore.
        if (filtrado && !comLiberacao(processo)) aoVerTodos()
        setSelecionadoId(processo.id)
        setModo({ tipo: 'ver' })
    }
    const salvarCliente = async (c: Cliente) => {
        await onSalvarCliente(c)
        setModo({ tipo: 'ver' })
    }

    return (
        <div className="relative grid gap-6 lg:grid-cols-[21rem_1fr]">
            {/* Voltar: em tela larga fica na margem em branco à esquerda da árvore, acompanhando a rolagem (pedido de 29/09).
                A margem só comporta o botão a partir de ~1480px; abaixo disso ele fica no alto da coluna da árvore. */}
            <div className="absolute right-full top-0 mr-5 hidden h-full min-[1480px]:block">
                <a href="#/" title="Voltar para a lista de clientes"
                    className="sticky top-6 flex w-24 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-3 text-center text-xs font-semibold leading-tight text-fg-700 shadow-sm transition hover:border-ouro-500 hover:bg-ouro-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-fg-700 text-white"><ArrowLeft size={20} /></span>
                    Voltar à lista de clientes
                </a>
            </div>
            <div className="flex flex-col gap-3">
            <a href="#/"
                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-fg-700 shadow-sm hover:border-ouro-500 hover:bg-ouro-100 focus:outline-none focus:ring-2 focus:ring-ouro-500/70 min-[1480px]:hidden">
                <ArrowLeft size={16} /> Voltar para a lista de clientes
            </a>
            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {/* Filtro ligado: avisa quantos processos estão à vista e dá a saída ("ver todos"), para ninguém achar que sumiram. */}
                {filtrado && (
                    <p className="mb-3 flex items-center gap-1.5 rounded-md border border-petroleo-200 bg-petroleo-100/60 px-2.5 py-1.5 text-[11px] leading-tight text-fg-800">
                        <Filter size={12} className="shrink-0 text-fg-700" />
                        <span className="min-w-0 flex-1">Só com acesso: <strong>{visiveis.length} de {processos.length}</strong></span>
                        <button type="button" onClick={aoVerTodos} title="Desligar o filtro e mostrar todos os processos"
                            className="shrink-0 rounded font-semibold text-fg-700 underline hover:text-fg-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-ouro-500/70">
                            ver todos
                        </button>
                    </p>
                )}
                {raizes.length ? (
                    <ArvoreProcessos raizes={raizes} orfaos={orfaos} origemOculta={origemOculta} semExpirados={filtrado} selecionadoId={idSelecionado} onSelecionar={selecionar}
                        onEditar={id => { setSelecionadoId(id); setModo({ tipo: 'editarProcesso', id }) }} />
                ) : (
                    <p className="text-sm text-slate-500">
                        {filtrado && processos.length > 0 ? 'Nenhum processo deste cliente está com acesso válido hoje.' : 'Nenhum processo cadastrado para este cliente.'}
                    </p>
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
            </div>

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
                        {(cliente.numeroNexus || p?.natureza) && (
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                {cliente.numeroNexus && <span>Nº Nexus {cliente.numeroNexus}</span>}
                                {cliente.numeroNexus && p?.natureza && <span aria-hidden="true">·</span>}
                                {/* Natureza é do processo selecionado na árvore (muda ao trocar de pasta). */}
                                {p?.natureza && <span>Natureza: <span className="font-medium text-slate-600">{p.natureza}</span></span>}
                            </p>
                        )}
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
                    <>
                        <FormularioCliente key={cliente.id} inicial={cliente} todosClientes={todosClientes} idsUsados={idsClientes}
                            onSalvar={salvarCliente} onCancelar={() => setModo({ tipo: 'ver' })} />
                        <ZonaExclusao key={`excluir:${cliente.id}`} oQue="este cliente" rotulo={cliente.nome} bloqueio={bloqueioExcluirCliente(cliente, todosProcessos)}
                            onExcluir={async () => { await onExcluir('cliente', cliente); window.location.hash = '#/' }} />
                    </>
                )}
                {modo.tipo === 'novoProcesso' && (
                    <>
                        <TituloFormulario>Novo processo de {cliente.nome}</TituloFormulario>
                        <FormularioProcesso key={`novo:${modo.origemId ?? ''}`} clienteId={cliente.id} origemInicialId={modo.origemId} processosDoCliente={processos} todosProcessos={todosProcessos}
                            idsUsados={idsProcessos} onSalvar={salvarProcesso} onCancelar={() => setModo({ tipo: 'ver' })} />
                    </>
                )}
                {modo.tipo === 'editarProcesso' && (() => {
                    const alvo = processos.find(x => x.id === modo.id)
                    return alvo ? (
                        <>
                            <TituloFormulario>Editar {alvo.numero}</TituloFormulario>
                            <FormularioProcesso key={alvo.id} inicial={alvo} clienteId={cliente.id} processosDoCliente={processos} todosProcessos={todosProcessos}
                                idsUsados={idsProcessos} onSalvar={salvarProcesso} onCancelar={() => setModo({ tipo: 'ver' })} />
                            <ZonaExclusao key={`excluir:${alvo.id}`} oQue="este processo" rotulo={alvo.numero}
                                bloqueio={bloqueioExcluirProcesso(alvo, todosProcessos, id => todosClientes.find(c => c.id === id)?.nome)}
                                onExcluir={async () => { await onExcluir('processo', alvo); setModo({ tipo: 'ver' }) }} />
                        </>
                    ) : null
                })()}

                {modo.tipo === 'ver' && p && (
                    <>
                        <div className="grid gap-4 md:grid-cols-2">
                            {/* O cartão do número é o atalho para o SEI: clicar nele abre o processo. */}
                            <CartaoInfo icone={FileText} cor="processo" rotulo={p.sistema ?? 'Processo'} valor={p.numero}
                                detalhe={descreverAcesso(p, acesso)} alerta={expirado} href={rota?.url}
                                rotuloAtalho={rota?.modo === 'login' ? 'Entrar' : 'Abrir'} aoAbrir={rota?.modo === 'login' ? entrarNoSei : undefined}
                                titulo={rota?.modo !== 'login' ? 'Abrir o processo no sistema de origem (nova aba)'
                                    : temExtensao && rota.host ? 'A extensão PAPA entra no SEI e abre este processo (nova aba)' : 'Abre o SEI (nova aba) e copia o nº do processo'} />
                            <CartaoInfo icone={Folder} cor="pasta" rotulo="Pasta no OneDrive" valor={cliente.linkPasta ? 'Processos do cliente' : 'Sem link'}
                                detalhe={[cliente.numeroNexus ? `Nº Nexus ${cliente.numeroNexus}` : 'Sem nº Nexus', cliente.linkPasta ? 'Documentos do cliente' : 'Cadastre o link (lápis ao lado do nome)'].join(' · ')}
                                href={cliente.linkPasta} titulo="Abrir a pasta do cliente no OneDrive (nova aba)" />
                            {/* Natureza saiu do painel a pedido (continua no formulário e na planilha). */}
                            <CartaoInfo icone={Tag} cor="tipo" rotulo="Tipo" valor={p.tipo} />
                            <CartaoInfo icone={Clock} cor="status" rotulo="Status" valor={p.status} />
                        </div>
                        {/* Processo que só abre com login no SEI: diz a conta, copia o nº e dá o atalho da tela de login. */}
                        {rota?.modo === 'login' && (
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-petroleo-200 bg-petroleo-100/60 px-4 py-2.5 text-sm text-fg-800">
                                <KeyRound size={16} className="shrink-0 text-fg-700" />
                                <span className="min-w-0 flex-1">
                                    Abre com <strong>login no SEI</strong>{rota.conta ? <> — conta <strong className="break-all">{rota.conta}</strong></> : ' (conta de acesso não cadastrada: preencha no lápis)'}.{' '}
                                    {temExtensao && rota.host ? (
                                        pedidoSei?.id === p.id
                                            ? <span className={`font-semibold ${pedidoSei.erro ? 'text-rose-700' : 'text-salvia-800'}`}>{pedidoSei.texto}</span>
                                            : <>Extensão PAPA {versaoExtensao} instalada: <strong>Entrar</strong> faz o login e já abre este processo.</>
                                    ) : copiado === p.id
                                        ? <span className="font-semibold text-salvia-800">Nº copiado: depois de entrar, cole na lista de processos.</span>
                                        : 'Ao clicar em Entrar, o nº é copiado para você colar lá dentro.'}
                                </span>
                                <button type="button" onClick={copiarNumero}
                                    className="flex items-center gap-1.5 rounded-md border border-fg-300 bg-white px-2.5 py-1 text-xs font-semibold text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                                    <Copy size={13} /> {copiado === p.id ? 'Nº copiado' : 'Copiar nº'}
                                </button>
                                {/* Com a extensão, o cartão é dela: este é o caminho manual. Sem ela, é o atalho da tela de login quando o link guardado é outro. */}
                                {temExtensao && rota.host && rota.url ? (
                                    <a href={rota.url} target="_blank" rel="noopener noreferrer" onClick={copiarNumero}
                                        className="flex items-center gap-1.5 rounded-md border border-fg-300 bg-white px-2.5 py-1 text-xs font-semibold text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                                        <LogIn size={13} /> Abrir sem a extensão
                                    </a>
                                ) : rota.urlLogin && rota.urlLogin !== rota.url && (
                                    <a href={rota.urlLogin} target="_blank" rel="noopener noreferrer" onClick={copiarNumero}
                                        className="flex items-center gap-1.5 rounded-md border border-fg-300 bg-white px-2.5 py-1 text-xs font-semibold text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                                        <LogIn size={13} /> Tela de login do SEI
                                    </a>
                                )}
                            </div>
                        )}

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
                {modo.tipo === 'ver' && !p && (
                    filtrado && processos.length > 0 ? (
                        <p className="text-slate-500">
                            Nenhum processo deste cliente está com acesso válido hoje.{' '}
                            <button type="button" onClick={aoVerTodos} className="font-medium text-fg-700 underline">
                                Ver {processos.length === 1 ? 'o processo dele' : `os ${processos.length} processos dele`}
                            </button>
                        </p>
                    ) : <p className="text-slate-500">Selecione um processo na árvore ou cadastre o primeiro.</p>
                )}
            </section>
        </div>
    )
}

function TituloFormulario({ children }: { children: ReactNode }) {
    return <h2 className="mb-4 font-slab text-lg font-bold text-fg-700">{children}</h2>
}

// Fica embaixo do formulário de edição (lápis): excluir é deliberado — dois cliques e o nome à vista. Não apaga:
// o registro vai para a Lixeira da tela inicial e pode ser restaurado.
function ZonaExclusao({ oQue, rotulo, bloqueio, onExcluir }: { oQue: string; rotulo: string; bloqueio?: string; onExcluir: () => Promise<void> }) {
    const [confirmando, setConfirmando] = useState(false)
    const [excluindo, setExcluindo] = useState(false)
    const [falha, setFalha] = useState('')
    const executar = async () => {
        setExcluindo(true)
        setFalha('')
        try {
            await onExcluir()
        } catch (e) {
            setFalha(e instanceof Error ? e.message : 'Não foi possível excluir.')
            setExcluindo(false)
        }
    }
    return (
        <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-rose-800">
                <Trash2 size={16} /> Excluir {oQue}
            </h3>
            <p className="mt-1 text-sm text-rose-900/80">
                Sai das telas e vai para a <strong>Lixeira</strong> (no fim da tela inicial), de onde pode ser restaurado. Nada é apagado do banco.
            </p>
            {bloqueio ? (
                <p className="mt-2 text-sm font-medium text-rose-800">{bloqueio}</p>
            ) : !confirmando ? (
                <button type="button" onClick={() => setConfirmando(true)}
                    className="mt-3 flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-400">
                    <Trash2 size={15} /> Excluir {oQue}
                </button>
            ) : (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-rose-900">Excluir “{rotulo}”?</span>
                    <button type="button" onClick={executar} disabled={excluindo} autoFocus
                        className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-60">
                        {excluindo ? 'Excluindo…' : 'Sim, excluir'}
                    </button>
                    <button type="button" onClick={() => setConfirmando(false)} disabled={excluindo}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Cancelar
                    </button>
                </div>
            )}
            {falha && <p className="mt-2 text-sm text-rose-700">{falha}</p>}
        </div>
    )
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
