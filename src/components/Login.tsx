import { useState, type FormEvent } from 'react'
import { Lock } from 'lucide-react'

interface Props {
    /** Faz o login (src/lib/autenticacao.ts); lança Error com a mensagem a mostrar. */
    entrar: (email: string, senha: string) => Promise<void>
}

const fundo = `${import.meta.env.BASE_URL}brand/fundo-login.jpg`
const logo = `${import.meta.env.BASE_URL}brand/logo.png`

// Tela de entrada com o papel de parede oficial ao fundo e o logotipo completo (versão para fundo claro) no cartão.
export default function Login({ entrar }: Props) {
    const [email, setEmail] = useState('')
    const [senha, setSenha] = useState('')
    const [erro, setErro] = useState('')
    const [enviando, setEnviando] = useState(false)

    async function enviar(e: FormEvent) {
        e.preventDefault()
        setErro('')
        setEnviando(true)
        try {
            await entrar(email, senha)
        } catch (err) {
            setErro(err instanceof Error ? err.message : 'Falha no login.')
        } finally {
            setEnviando(false)
        }
    }

    return (
        // Em tela larga o cartão fica à esquerda, para não cobrir o logotipo que o próprio papel de parede traz à direita.
        <div className="grid min-h-screen place-items-center bg-fg-900 bg-cover bg-center p-4 lg:justify-items-start lg:pl-[10vw]"
            style={{ backgroundImage: `linear-gradient(rgba(10,29,42,.45), rgba(10,29,42,.7)), url(${fundo})` }}>
            <form onSubmit={enviar} className="w-full max-w-sm space-y-5 rounded-xl border-t-4 border-ouro-300 bg-white p-8 shadow-2xl">
                <div className="text-center">
                    <img src={logo} alt="Fabris & Gurjão — Sociedade OAB-RO nº 005/2014" className="mx-auto w-64" />
                    <p className="mt-4 font-slab text-2xl font-bold text-fg-700">Projeto PAPA</p>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-ouro-700">Controle de Processos</p>
                </div>
                <label className="block text-sm text-slate-700">
                    E-mail
                    <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-fg-500 focus:ring-2 focus:ring-ouro-500/70" />
                </label>
                <label className="block text-sm text-slate-700">
                    Senha
                    <input type="password" required autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-fg-500 focus:ring-2 focus:ring-ouro-500/70" />
                </label>
                {erro && <p className="text-sm text-rose-600">{erro}</p>}
                <button type="submit" disabled={enviando}
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-fg-700 py-2.5 font-semibold text-white hover:bg-fg-800 disabled:opacity-60">
                    <Lock size={16} /> {enviando ? 'Entrando…' : 'Entrar'}
                </button>
                <p className="text-center text-xs text-slate-500">Mesmo acesso do Nexus.</p>
            </form>
        </div>
    )
}
