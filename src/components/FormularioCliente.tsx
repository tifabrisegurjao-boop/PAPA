import { useState, type FormEvent } from 'react'
import { Save, X } from 'lucide-react'
import { erroNomeCliente } from '../lib/validacao.ts'
import { idCliente, idLivre } from '../lib/ids.ts'
import type { Cliente, TipoPessoa } from '../tipos.ts'
import { Area, Campo, Rotulo, Secao } from './Campos.tsx'

interface Props {
    inicial?: Cliente
    todosClientes: Cliente[]
    onSalvar: (cliente: Cliente) => Promise<void>
    onCancelar: () => void
}

/** Registro novo entra no fim da lista (a posição da planilha é a ordem de exibição). */
export const proximaOrdem = (lista: { ordem?: number }[]) => lista.reduce((m, x) => Math.max(m, x.ordem ?? -1), -1) + 1

// A linha da aba Clientes da planilha: nome, PF/PJ, nº do Nexus, link da pasta, observação.
export default function FormularioCliente({ inicial, todosClientes, onSalvar, onCancelar }: Props) {
    const [nome, setNome] = useState(inicial?.nome ?? '')
    const [tipoPessoa, setTipoPessoa] = useState<TipoPessoa | ''>(inicial?.tipoPessoa ?? '')
    const [numeroNexus, setNumeroNexus] = useState(inicial?.numeroNexus ?? '')
    const [linkPasta, setLinkPasta] = useState(inicial?.linkPasta ?? '')
    const [observacao, setObservacao] = useState(inicial?.observacao ?? '')
    // Versão lida na abertura (ver FormularioProcesso): a prop `inicial` é viva e não pode ser lida no envio.
    const [versaoLida] = useState(() => (inicial ? inicial.versao ?? 0 : undefined))
    const [erros, setErros] = useState<Record<string, string>>({})
    const [salvando, setSalvando] = useState(false)
    const [falha, setFalha] = useState('')

    function validar() {
        const e: Record<string, string> = {}
        const erroNome = erroNomeCliente(nome, inicial, todosClientes)
        if (erroNome) e.nome = erroNome
        if (!tipoPessoa) e.tipoPessoa = 'Escolha pessoa física ou jurídica.'
        if (numeroNexus && !/^\d{3,6}$/.test(numeroNexus.trim())) e.numeroNexus = 'O nº do Nexus tem de 3 a 6 dígitos.'
        if (linkPasta && !/^https?:\/\//i.test(linkPasta.trim())) e.linkPasta = 'O link precisa começar com https:// (link de compartilhamento do OneDrive).'
        setErros(e)
        return Object.keys(e).length === 0
    }

    async function enviar(ev: FormEvent) {
        ev.preventDefault()
        if (!validar()) return
        const cliente: Cliente = {
            id: inicial?.id ?? idLivre(idCliente(nome.trim()), todosClientes.map(c => c.id)),
            nome: nome.trim(),
            tipoPessoa: tipoPessoa || null,
            numeroNexus: numeroNexus.trim() || undefined,
            linkPasta: linkPasta.trim() || undefined,
            observacao: observacao.trim() || undefined,
            versao: versaoLida,
            ordem: inicial?.ordem ?? proximaOrdem(todosClientes),
        }
        setSalvando(true)
        setFalha('')
        try {
            await onSalvar(cliente)
        } catch (err) {
            setFalha(err instanceof Error ? err.message : 'Não foi possível salvar.')
            setSalvando(false)
        }
    }

    return (
        <form onSubmit={enviar} className="space-y-4">
            <Secao titulo={inicial ? 'Dados do cliente' : 'Novo cliente'}>
                <Campo rotulo="Nome do cliente" obrigatorio value={nome} onChange={e => setNome(e.target.value)} erro={erros.nome} autoFocus
                    ajuda="Como vai aparecer no sistema. Grafia única." />
                <div>
                    <Rotulo obrigatorio>Pessoa física ou jurídica</Rotulo>
                    <div className="mt-1 flex gap-2">
                        {(['PF', 'PJ'] as const).map(t => (
                            <label key={t} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ouro-500/70 ${
                                tipoPessoa === t ? 'border-fg-700 bg-fg-50 text-fg-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                                <input type="radio" name="tipoPessoa" value={t} checked={tipoPessoa === t} onChange={() => setTipoPessoa(t)} className="sr-only" />
                                {t === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}
                            </label>
                        ))}
                    </div>
                    {erros.tipoPessoa && <span className="mt-1 block text-xs text-rose-600">{erros.tipoPessoa}</span>}
                </div>
                <Campo rotulo="Nº do cliente (Nexus)" value={numeroNexus} onChange={e => setNumeroNexus(e.target.value)} erro={erros.numeroNexus}
                    inputMode="numeric" placeholder="4821" ajuda="Opcional por enquanto: número da Biblioteca de Clientes do Nexus." />
                <Campo rotulo="Link da pasta (OneDrive)" value={linkPasta} onChange={e => setLinkPasta(e.target.value)} erro={erros.linkPasta}
                    placeholder="https://…" ajuda="Link de compartilhamento; caminho C:\ não abre para os outros." />
                <Area rotulo="Observação" value={observacao} onChange={e => setObservacao(e.target.value)} className="md:col-span-2" />
            </Secao>
            {falha && <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{falha}</p>}
            <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={salvando}
                    className="flex items-center gap-2 rounded-lg bg-fg-700 px-5 py-2.5 font-semibold text-white shadow hover:bg-fg-800 disabled:opacity-60">
                    <Save size={18} /> {salvando ? 'Salvando…' : inicial ? 'Salvar alterações' : 'Cadastrar cliente'}
                </button>
                <button type="button" onClick={onCancelar} className="flex items-center gap-2 rounded-lg border border-fg-300 px-4 py-2.5 text-sm font-medium text-fg-700 hover:border-ouro-500 hover:bg-ouro-100">
                    <X size={16} /> Cancelar
                </button>
            </div>
        </form>
    )
}
