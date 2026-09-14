import { ExternalLink, type LucideIcon } from 'lucide-react'

// Cartões informativos em pastéis da família da marca (petróleo, areia, sálvia, terracota, ardósia):
// uma cor por tipo de informação, para o olho achar cada dado sem ler o rótulo. Nada de branco.
const CORES = {
    processo: { fundo: 'bg-petroleo-100 border-petroleo-200', icone: 'bg-petroleo-300 text-fg-700', rotulo: 'text-fg-700' },
    pasta: { fundo: 'bg-areia-100 border-areia-200', icone: 'bg-areia-300 text-ouro-700', rotulo: 'text-ouro-700' },
    tipo: { fundo: 'bg-salvia-100 border-salvia-200', icone: 'bg-salvia-300 text-salvia-700', rotulo: 'text-salvia-800' },
    natureza: { fundo: 'bg-terracota-100 border-terracota-200', icone: 'bg-terracota-300 text-terracota-700', rotulo: 'text-terracota-800' },
    status: { fundo: 'bg-ardosia-100 border-ardosia-200', icone: 'bg-ardosia-300 text-ardosia-700', rotulo: 'text-ardosia-800' },
} as const

interface Props {
    icone: LucideIcon
    rotulo: string
    valor?: string
    detalhe?: string
    /** Mostra o detalhe em vermelho (ex.: acesso expirado). */
    alerta?: boolean
    /** Com link, o cartão inteiro vira o atalho (abre em nova aba). */
    href?: string
    /** Tooltip do atalho (o que abre). */
    titulo?: string
    cor: keyof typeof CORES
    className?: string
}

export default function CartaoInfo({ icone: Icone, rotulo, valor, detalhe, alerta, href, titulo, cor, className = '' }: Props) {
    const c = CORES[cor]
    const conteudo = (
        <>
            <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${c.icone}`}>
                <Icone size={24} />
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-[11px] font-semibold uppercase tracking-[0.14em] ${c.rotulo}`}>{rotulo}</span>
                <span className="block text-lg [overflow-wrap:normal] font-bold leading-tight text-fg-800">{valor || '—'}</span>
                {detalhe && <span className={`line-clamp-2 text-sm leading-snug ${alerta ? 'font-semibold text-rose-700' : 'text-slate-600'}`}>{detalhe}</span>}
            </span>
            {href && (
                <span className="flex shrink-0 items-center gap-1 self-start rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-fg-700 ring-1 ring-fg-200 group-hover:bg-fg-700 group-hover:text-white">
                    Abrir <ExternalLink size={12} />
                </span>
            )}
        </>
    )
    const classe = `flex h-full min-h-[5.5rem] items-center gap-4 rounded-xl border p-4 ${c.fundo} ${className}`
    return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" title={titulo ?? 'Abrir (nova aba)'}
            className={`group ${classe} cursor-pointer transition hover:-translate-y-0.5 hover:border-fg-500 hover:shadow-md`}>
            {conteudo}
        </a>
    ) : (
        <div className={classe}>{conteudo}</div>
    )
}
