import { Power, Search, User } from 'lucide-react'

interface Props {
    subtitulo?: string
    termo: string
    onPesquisar: (texto: string) => void
    email: string | null
    /** Texto do selo quando a tela está aberta sem login ("sem login" no dev, "demonstração" no build de demo). */
    semLogin?: string
    /** Encerra a sessão (src/lib/autenticacao.ts); ausente enquanto o módulo de login não carregou. */
    onSair?: () => Promise<void>
}

const monograma = `${import.meta.env.BASE_URL}brand/monograma.png`

// Barra superior na identidade do escritório: fundo petróleo, monograma em ouro, nome do sistema em slab serif
// (como o wordmark) e a linha de baixo em ouro com o espaçamento da linha "Sociedade OAB-RO" do logotipo.
export default function Cabecalho({ subtitulo, termo, onPesquisar, email, semLogin, onSair }: Props) {
    return (
        <header className="bg-gradient-to-r from-fg-900 via-fg-800 to-fg-700 text-white shadow-md">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:px-8">
                <a href="#/" className="mr-auto flex items-center gap-3">
                    <img src={monograma} alt="" className="h-11 w-auto shrink-0" />
                    <span className="leading-tight">
                        <span className="block font-slab text-2xl font-bold tracking-wide md:text-[1.75rem]">Projeto PAPA</span>
                        <span className={`block text-[11px] tracking-[0.18em] ${subtitulo ? 'text-white/85' : 'uppercase text-ouro-300'}`}>
                            {subtitulo ?? 'Fabris & Gurjão · Controle de Processos'}
                        </span>
                    </span>
                </a>
                <label className="flex w-full items-center gap-2 rounded-lg bg-white px-4 py-2 text-slate-700 shadow-inner ring-1 ring-ouro-300/40 focus-within:ring-2 focus-within:ring-ouro-400 sm:w-96">
                    <input value={termo} onChange={e => onPesquisar(e.target.value)} placeholder="Pesquisar cliente ou nº do processo…"
                        aria-label="Pesquisar cliente ou número do processo" className="w-full bg-transparent outline-none placeholder:text-slate-400" />
                    <Search size={18} className="text-fg-500" />
                </label>
                <div className="flex items-center gap-1">
                    <span title={email ?? ''} aria-label={email ? `Conectado como ${email}` : undefined} className="rounded-md p-2 text-ouro-300">
                        <User size={22} />
                    </span>
                    {semLogin ? (
                        <span className="rounded-md bg-amber-300/90 px-2 py-1 text-xs font-semibold text-amber-900" title="Versão aberta sem login — base fictícia">
                            {semLogin}
                        </span>
                    ) : (
                        <button onClick={() => onSair?.()} disabled={!onSair} title="Sair" aria-label="Sair"
                            className="rounded-md p-2 text-ouro-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-ouro-300 disabled:opacity-50">
                            <Power size={22} />
                        </button>
                    )}
                </div>
            </div>
        </header>
    )
}
