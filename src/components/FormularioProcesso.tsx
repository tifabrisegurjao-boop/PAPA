import { useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { erroNumero } from '../lib/validacao.ts'
import { idLivre, idProcesso } from '../lib/ids.ts'
import { LISTAS, NOME_DO_ORGAO } from '../lib/listas.ts'
import type { Processo } from '../tipos.ts'
import { Area, Campo, Secao, Selecao } from './Campos.tsx'
import { proximaOrdem } from './FormularioCliente.tsx'

const SIM_NAO = [{ valor: 'SIM', texto: 'SIM' }, { valor: 'NÃO', texto: 'NÃO' }]

interface Props {
    /** Processo existente (edição) ou vazio (novo). */
    inicial?: Processo
    clienteId: string
    /** Pré-seleciona a origem quando o botão foi "adicionar desdobramento". */
    origemInicialId?: string
    /** Processos do mesmo cliente: menu de origem. */
    processosDoCliente: Processo[]
    /** Todos os processos da base: recusa nº repetido. */
    todosProcessos: Processo[]
    onSalvar: (processo: Processo) => Promise<void>
    onCancelar: () => void
}

// O formulário é a linha da aba Processos da planilha, seção por seção. Mesmos menus (aba Listas), mesmas regras
// (nº obrigatório e único; origem só entre processos do próprio cliente).
export default function FormularioProcesso({ inicial, clienteId, origemInicialId, processosDoCliente, todosProcessos, onSalvar, onCancelar }: Props) {
    const [f, setF] = useState(() => ({
        numero: inicial?.numero ?? '',
        sistema: inicial ? inicial.sistema ?? '' : 'SEI/RO',
        processoPaiId: inicial?.processoPaiId ?? origemInicialId ?? '',
        vinculo: inicial?.vinculo ?? (origemInicialId ? 'derivado' : ''),
        tipo: inicial?.tipo ?? '',
        natureza: inicial?.natureza ?? '',
        objeto: inicial?.objeto ?? '',
        orgaoSigla: inicial?.orgaoSigla ?? '',
        status: inicial?.status ?? '',
        situacaoAtual: inicial?.situacaoAtual ?? '',
        observacao: inicial?.observacao ?? '',
        movData: (inicial?.ultimaMovimentacao?.dataHora ?? '').slice(0, 10),
        movHora: (inicial?.ultimaMovimentacao?.dataHora ?? '').slice(11, 16),
        movDescricao: inicial?.ultimaMovimentacao?.descricao ?? '',
        linkProcesso: inicial?.linkProcesso ?? '',
        codigoCasoNexus: inicial?.codigoCasoNexus ?? '',
        acessoForma: inicial?.acesso?.forma ?? '',
        acessoConta: inicial?.acesso?.conta ?? '',
        acessoSeiGeral: inicial?.acesso?.seiGeral ?? '',
        acessoPedidoEm: (inicial?.acesso?.pedidoEm ?? '').slice(0, 10),
        acessoTermino: (inicial?.acesso?.termino ?? '').slice(0, 10),
        acessoRenovar: inicial?.acesso?.renovar ?? '',
        acessoSituacao: inicial?.acesso?.situacao ?? '',
    }))
    // Versão lida NA ABERTURA do formulário. `inicial` é uma prop viva (o banco em tempo real a atualiza); se lêssemos
    // `inicial.versao` no envio, a edição de um colega chegaria antes e a nossa gravação passaria por cima sem aviso.
    // undefined = cadastro (o banco recusa se o id já existir).
    const [versaoLida] = useState(() => (inicial ? inicial.versao ?? 0 : undefined))
    const [erros, setErros] = useState<Record<string, string>>({})
    const [salvando, setSalvando] = useState(false)
    const [falha, setFalha] = useState('')
    const muda = (campo: keyof typeof f) => (e: { target: { value: string } }) => setF(v => ({ ...v, [campo]: e.target.value }))

    const opcoesOrigem = processosDoCliente
        .filter(p => p.id !== inicial?.id)
        .map(p => ({ valor: p.id, texto: `${p.numero}${p.tipo ? ` — ${p.tipo}` : ''}` }))
    // Origem que veio da planilha mas não existe (ou é de outro cliente) fica visível no menu, em vez de sumir como "Nenhum".
    if (f.processoPaiId && !opcoesOrigem.some(o => o.valor === f.processoPaiId)) {
        const outro = todosProcessos.find(p => p.id === f.processoPaiId)
        opcoesOrigem.unshift({ valor: f.processoPaiId, texto: outro ? `⚠ ${outro.numero} (de outro cliente)` : `⚠ origem não encontrada: ${f.processoPaiId.replace('nao-encontrado:', '')}` })
    }

    function validar() {
        const e: Record<string, string> = {}
        const numero = f.numero.trim()
        const erroN = erroNumero(numero, inicial, todosProcessos)
        if (erroN) e.numero = erroN
        if (f.processoPaiId && !f.vinculo) e.vinculo = 'Diga se é derivado ou relacionado.'
        if (f.processoPaiId && !processosDoCliente.some(p => p.id === f.processoPaiId && p.id !== inicial?.id) && !f.processoPaiId.startsWith('nao-encontrado:'))
            e.processoPaiId = 'A origem precisa ser um processo deste cliente. Escolha outra ou "Nenhum".'
        if (f.linkProcesso && !/^https?:\/\//i.test(f.linkProcesso.trim())) e.linkProcesso = 'O link precisa começar com https://'
        setErros(e)
        return Object.keys(e).length === 0
    }

    async function enviar(ev: FormEvent) {
        ev.preventDefault()
        if (!validar()) return
        const numero = f.numero.trim()
        const id = inicial?.id ?? idLivre(idProcesso(numero), todosProcessos.map(p => p.id))
        const limpo = (s: string) => s.trim() || undefined
        const processo: Processo = {
            id,
            clienteId,
            numero,
            versao: versaoLida,
            ordem: inicial?.ordem ?? proximaOrdem(todosProcessos),
            sistema: limpo(f.sistema),
            processoPaiId: limpo(f.processoPaiId),
            vinculo: f.processoPaiId ? (f.vinculo === 'relacionado' ? 'relacionado' : 'derivado') : undefined,
            tipo: limpo(f.tipo),
            natureza: limpo(f.natureza),
            objeto: limpo(f.objeto),
            orgaoSigla: limpo(f.orgaoSigla),
            // Nome do órgão: da lista do modelo; se a sigla veio da aba Listas da planilha (fora do modelo), mantém o nome que já havia.
            orgaoNome: f.orgaoSigla ? NOME_DO_ORGAO[f.orgaoSigla.trim()] ?? (f.orgaoSigla.trim() === inicial?.orgaoSigla ? inicial?.orgaoNome : undefined) : undefined,
            status: limpo(f.status),
            situacaoAtual: limpo(f.situacaoAtual),
            observacao: limpo(f.observacao),
            ultimaMovimentacao: f.movData || f.movDescricao
                ? { dataHora: f.movData ? (f.movHora ? `${f.movData}T${f.movHora}` : f.movData) : '', descricao: f.movDescricao.trim() }
                : undefined,
            linkProcesso: limpo(f.linkProcesso),
            codigoCasoNexus: limpo(f.codigoCasoNexus),
            acesso: f.acessoForma || f.acessoConta || f.acessoSeiGeral || f.acessoPedidoEm || f.acessoTermino || f.acessoRenovar || f.acessoSituacao
                ? {
                    forma: limpo(f.acessoForma), conta: limpo(f.acessoConta), seiGeral: limpo(f.acessoSeiGeral), pedidoEm: limpo(f.acessoPedidoEm),
                    termino: limpo(f.acessoTermino), renovar: limpo(f.acessoRenovar), situacao: limpo(f.acessoSituacao),
                }
                : undefined,
        }
        setSalvando(true)
        setFalha('')
        try {
            await onSalvar(processo)
        } catch (err) {
            setFalha(err instanceof Error ? err.message : 'Não foi possível salvar.')
            setSalvando(false)
        }
    }

    return (
        <form onSubmit={enviar} className="space-y-4">
            <Secao titulo="Identificação">
                <Campo rotulo="Nº do processo" obrigatorio value={f.numero} onChange={muda('numero')} erro={erros.numero} autoFocus
                    placeholder="0038.001245/2026-31" ajuda="Número exato do sistema de origem (SEI, PJe, TCU…)." />
                <Campo rotulo="Sistema" value={f.sistema} onChange={muda('sistema')} opcoes={LISTAS.sistema} />
                <Selecao rotulo="Processo de origem" value={f.processoPaiId} onChange={muda('processoPaiId')} opcoes={opcoesOrigem} erro={erros.processoPaiId}
                    vazio="Nenhum — é um processo principal" ajuda="Só para desdobramentos (recurso, comunicação…)." />
                <Selecao rotulo="Vínculo" value={f.vinculo} onChange={muda('vinculo')} disabled={!f.processoPaiId} erro={erros.vinculo}
                    opcoes={LISTAS.vinculo.map(v => ({ valor: v.toLowerCase(), texto: v }))} />
            </Secao>
            <Secao titulo="Classificação">
                <Campo rotulo="Tipo" value={f.tipo} onChange={muda('tipo')} opcoes={LISTAS.tipo} />
                <Campo rotulo="Natureza" value={f.natureza} onChange={muda('natureza')} opcoes={LISTAS.natureza} />
                <Campo rotulo="Órgão (sigla)" value={f.orgaoSigla} onChange={muda('orgaoSigla')} opcoes={LISTAS.orgaos.map(o => o[0])}
                    ajuda={f.orgaoSigla && NOME_DO_ORGAO[f.orgaoSigla.trim()] ? NOME_DO_ORGAO[f.orgaoSigla.trim()] : 'Sigla fora da lista fica sem o nome completo no painel.'} />
                <Campo rotulo="Status do processo" value={f.status} onChange={muda('status')} opcoes={LISTAS.status} />
                <Area rotulo="Objeto" value={f.objeto} onChange={muda('objeto')} className="md:col-span-2" placeholder="Descrição curta do que se discute." />
            </Secao>
            <Secao titulo="Andamento">
                <Area rotulo="Situação atual" value={f.situacaoAtual} onChange={muda('situacaoAtual')} className="md:col-span-2"
                    ajuda="É o que aparece em 'Histórico / Situação atual'. Escreva para quem vai ler sem contexto." />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Campo rotulo="Última movimentação — data" type="date" value={f.movData} onChange={muda('movData')} />
                    <Campo rotulo="Hora" type="time" value={f.movHora} onChange={muda('movHora')} disabled={!f.movData} />
                </div>
                <Campo rotulo="Última movimentação — descrição" value={f.movDescricao} onChange={muda('movDescricao')} />
                <Area rotulo="Observação" value={f.observacao} onChange={muda('observacao')} className="md:col-span-2"
                    ajuda="Histórico de acessos e justificativas. Enquanto a situação atual estiver vazia, o painel mostra este texto." />
            </Secao>
            <Secao titulo="Acesso externo">
                <Campo rotulo="Link do processo (URL)" value={f.linkProcesso} onChange={muda('linkProcesso')} erro={erros.linkProcesso} className="md:col-span-2" placeholder="https://sei.sistemas.ro.gov.br/…" />
                <Campo rotulo="Forma de acesso" value={f.acessoForma} onChange={muda('acessoForma')} opcoes={LISTAS.formaAcesso} />
                <Campo rotulo="Conta de acesso" value={f.acessoConta} onChange={muda('acessoConta')} opcoes={LISTAS.conta} ajuda="Só o e-mail. Senha fica no gerenciador de senhas." />
                <Selecao rotulo="Acesso no SEI GERAL?" value={f.acessoSeiGeral} onChange={muda('acessoSeiGeral')} opcoes={SIM_NAO} />
                <Campo rotulo="Data do pedido de acesso" type="date" value={f.acessoPedidoEm} onChange={muda('acessoPedidoEm')} />
                <Campo rotulo="Término do acesso" type="date" value={f.acessoTermino} onChange={muda('acessoTermino')} ajuda="Vencido, o processo fica vermelho no painel." />
                <Selecao rotulo="Solicitar renovação?" value={f.acessoRenovar} onChange={muda('acessoRenovar')} opcoes={SIM_NAO} ajuda="SIM = entra na fila da rotina semanal." />
                <Campo rotulo="Situação do acesso" value={f.acessoSituacao} onChange={muda('acessoSituacao')} opcoes={LISTAS.situacaoAcesso} />
                <Campo rotulo="Código do caso (Nexus)" value={f.codigoCasoNexus} onChange={muda('codigoCasoNexus')} placeholder="1234-26.5678" />
            </Secao>
            {falha && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{falha}</p>}
            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={salvando}
                    className="flex items-center gap-2 rounded-lg bg-fg-700 px-5 py-2.5 font-semibold text-white shadow hover:bg-fg-800 disabled:opacity-60">
                    <Save size={18} /> {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Cadastrar processo'}
                </button>
                <button type="button" onClick={onCancelar} className="flex items-center gap-2 rounded-lg border border-fg-300 px-4 py-2.5 text-sm font-medium text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                    <X size={16} /> Cancelar
                </button>
            </div>
        </form>
    )
}
