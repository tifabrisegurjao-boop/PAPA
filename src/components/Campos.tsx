import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

// Campos de formulário na identidade do painel: rótulo pequeno em caixa alta, foco em ouro, erro em vermelho.
const BASE = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-fg-500 focus:ring-2 focus:ring-ouro-500/70 disabled:bg-slate-100'

export function Rotulo({ children, obrigatorio }: { children: ReactNode; obrigatorio?: boolean }) {
    return (
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            {children}
            {obrigatorio && <span className="ml-0.5 text-rose-600" title="obrigatório">*</span>}
        </span>
    )
}

interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
    rotulo: string
    obrigatorio?: boolean
    erro?: string
    ajuda?: string
    /** Valores sugeridos (menu com escrita livre — mesmos valores da aba Listas da planilha). */
    opcoes?: readonly string[]
}

export function Campo({ rotulo, obrigatorio, erro, ajuda, opcoes, className = '', id, ...props }: CampoProps) {
    const listaId = opcoes ? `${id ?? rotulo}-opcoes`.replace(/\W+/g, '-') : undefined
    return (
        <label className={`block ${className}`}>
            <Rotulo obrigatorio={obrigatorio}>{rotulo}</Rotulo>
            <input id={id} list={listaId} className={`${BASE} ${erro ? 'border-rose-400' : ''}`} aria-invalid={!!erro} {...props} />
            {listaId && (
                <datalist id={listaId}>
                    {opcoes!.map(o => <option key={o} value={o} />)}
                </datalist>
            )}
            {erro ? <span className="mt-1 block text-xs text-rose-600">{erro}</span> : ajuda ? <span className="mt-1 block text-xs text-slate-500">{ajuda}</span> : null}
        </label>
    )
}

interface SelecaoProps extends SelectHTMLAttributes<HTMLSelectElement> {
    rotulo: string
    obrigatorio?: boolean
    erro?: string
    ajuda?: string
    opcoes: { valor: string; texto: string }[]
    vazio?: string
}

export function Selecao({ rotulo, obrigatorio, erro, ajuda, opcoes, vazio = '—', className = '', ...props }: SelecaoProps) {
    return (
        <label className={`block ${className}`}>
            <Rotulo obrigatorio={obrigatorio}>{rotulo}</Rotulo>
            <select className={`${BASE} ${erro ? 'border-rose-400' : ''}`} aria-invalid={!!erro} {...props}>
                <option value="">{vazio}</option>
                {opcoes.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
            {erro ? <span className="mt-1 block text-xs text-rose-600">{erro}</span> : ajuda ? <span className="mt-1 block text-xs text-slate-500">{ajuda}</span> : null}
        </label>
    )
}

interface AreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    rotulo: string
    ajuda?: string
}

export function Area({ rotulo, ajuda, className = '', ...props }: AreaProps) {
    return (
        <label className={`block ${className}`}>
            <Rotulo>{rotulo}</Rotulo>
            <textarea className={`${BASE} min-h-[5rem] leading-relaxed`} {...props} />
            {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
        </label>
    )
}

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
    return (
        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <legend className="px-1 font-slab text-sm font-bold text-fg-700">{titulo}</legend>
            <div className="grid gap-3 md:grid-cols-2">{children}</div>
        </fieldset>
    )
}
