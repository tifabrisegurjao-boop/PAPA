import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { carregarBase } from './lib/dados.ts'
import { repositorioMemoria, type Repositorio } from './lib/repositorio.ts'
import type { Sessao } from './lib/autenticacao.ts'
import type { Base } from './tipos.ts'
import Login from './components/Login.tsx'
import Cabecalho from './components/Cabecalho.tsx'
import ListaClientes from './components/ListaClientes.tsx'
import PainelCliente from './components/PainelCliente.tsx'

type Rota = { tela: 'lista' } | { tela: 'cliente'; clienteId: string; processoId?: string }
type Autenticacao = typeof import('./lib/autenticacao.ts')

// Só no servidor de desenvolvimento (`npm run dev`): http://localhost:5173/?semLogin abre as telas sem entrar no Firebase,
// para mexer no visual sem senha. `import.meta.env.DEV` é falso no build, então isso não existe no site publicado.
// `npm run build:demo` (VITE_DEMO=1, ver .env.demo) gera uma versão SEM login para demonstração com a base fictícia —
// nunca publicar essa versão com dado real.
const DEMO = import.meta.env.VITE_DEMO === '1'
const SEM_LOGIN = DEMO || (import.meta.env.DEV && new URLSearchParams(window.location.search).has('semLogin'))
// Banco: Firestore por padrão; JSON estático na demo, sem login, ou com VITE_BANCO=json (ver README).
const BANCO_JSON = DEMO || SEM_LOGIN || import.meta.env.VITE_BANCO === 'json'

// Rotas por hash (#/, #/cliente/<id> e #/cliente/<id>/<processo>): funcionam em hospedagem estática sem configurar o servidor.
function useRota(): Rota {
    const [hash, setHash] = useState(window.location.hash)
    useEffect(() => {
        const ouvir = () => setHash(window.location.hash)
        window.addEventListener('hashchange', ouvir)
        return () => window.removeEventListener('hashchange', ouvir)
    }, [])
    const m = hash.match(/^#\/cliente\/([^/]+)(?:\/(.+))?$/)
    if (!m) return { tela: 'lista' }
    // Um % solto no endereço faria decodeURIComponent lançar URIError dentro do render; nesse caso tratamos o texto cru.
    const decodificar = (t: string) => { try { return decodeURIComponent(t) } catch { return t } }
    return { tela: 'cliente', clienteId: decodificar(m[1]), processoId: m[2] ? decodificar(m[2]) : undefined }
}

export default function App() {
    const [sessao, setSessao] = useState<Sessao | null | undefined>(SEM_LOGIN ? { email: 'desenvolvimento' } : undefined)
    const [autenticacao, setAutenticacao] = useState<Autenticacao | null>(null)
    const [base, setBase] = useState<Base | null>(null)
    const [erro, setErro] = useState('')
    const [termo, setTermo] = useState('')
    const rota = useRota()
    // Firebase (Auth e Firestore) entra por import() dinâmico: no build da demo (SEM_LOGIN/BANCO_JSON constantes) esses ramos
    // são código morto e o bundle público não leva nem inicializa o projeto real.
    const memoria = useMemo(() => (BANCO_JSON ? repositorioMemoria(carregarBase) : null), [])
    const [repositorio, setRepositorio] = useState<Repositorio | null>(memoria)

    useEffect(() => {
        if (SEM_LOGIN) return
        let parar = () => {}
        import('./lib/autenticacao.ts')
            .then(m => { setAutenticacao(m); parar = m.observar(setSessao) })
            .catch((e: Error) => setErro(`Não foi possível carregar o login: ${e.message}`))
        return () => parar()
    }, [])

    useEffect(() => {
        if (BANCO_JSON) return
        import('./lib/repositorioFirestore.ts').then(m => setRepositorio(m.repositorioFirestore())).catch((e: Error) => setErro(`Não foi possível carregar o banco: ${e.message}`))
    }, [])

    useEffect(() => {
        if (!sessao || !repositorio) return
        return repositorio.assinar(setBase, (e: Error) => setErro(e.message))
    }, [sessao, repositorio])

    const cliente = rota.tela === 'cliente' ? base?.clientes.find(c => c.id === rota.clienteId) : undefined
    // Logo depois de cadastrar, o registro pode levar um instante para chegar pelo banco: espera 3 s antes de dizer que não existe.
    const [esperouCliente, setEsperouCliente] = useState(false)
    const clienteFaltando = rota.tela === 'cliente' && !!base && !cliente
    useEffect(() => {
        setEsperouCliente(false)
        if (!clienteFaltando) return
        const t = window.setTimeout(() => setEsperouCliente(true), 3000)
        return () => window.clearTimeout(t)
    }, [clienteFaltando, rota.tela === 'cliente' ? rota.clienteId : ''])

    if (sessao === undefined) return <Aviso>{erro || 'Carregando…'}</Aviso>
    if (!sessao) return autenticacao ? <Login entrar={autenticacao.entrar} /> : <Aviso>{erro || 'Carregando…'}</Aviso>
    if (!repositorio) return <Aviso>{erro || 'Conectando ao banco…'}</Aviso>

    // Pesquisar a partir do painel volta para a listagem, onde o resultado aparece.
    const pesquisar = (texto: string) => {
        setTermo(texto)
        if (rota.tela !== 'lista') window.location.hash = '#/'
    }

    let conteudo: ReactNode
    if (erro) conteudo = <Aviso>{erro}</Aviso>
    else if (!base) conteudo = <Aviso>Carregando a base…</Aviso>
    else if (rota.tela === 'lista') conteudo = <ListaClientes base={base} termo={termo} onSalvarCliente={c => repositorio.salvarCliente(c)} />
    else if (cliente)
        conteudo = (
            <PainelCliente
                key={`${cliente.id}:${rota.processoId ?? ''}`}
                cliente={cliente}
                processos={base.processos.filter(p => p.clienteId === cliente.id)}
                processoInicialId={rota.processoId}
                todosClientes={base.clientes}
                todosProcessos={base.processos}
                onSalvarCliente={c => repositorio.salvarCliente(c)}
                onSalvarProcesso={p => repositorio.salvarProcesso(p)}
            />
        )
    else if (!esperouCliente) conteudo = <Aviso>Carregando o cliente…</Aviso>
    else
        conteudo = (
            <Aviso>
                Cliente não encontrado.{' '}
                <a href="#/" className="text-fg-700 underline">
                    Voltar à listagem
                </a>
            </Aviso>
        )

    return (
        <div className="flex min-h-screen flex-col bg-fg-50 text-slate-800">
            <Cabecalho subtitulo={cliente && `Cliente: ${cliente.nome}`} termo={termo} onPesquisar={pesquisar} email={sessao.email}
                semLogin={SEM_LOGIN ? (DEMO ? 'demonstração' : 'sem login') : undefined} onSair={autenticacao?.sair} />
            {!repositorio.persistente && base && (
                <p className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
                    Versão de demonstração: o que você cadastrar ou editar fica só nesta aba e some ao recarregar.
                </p>
            )}
            <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{conteudo}</main>
            {base && (
                <footer className="px-4 pb-4 text-center text-xs text-slate-500">
                    Base: {repositorio.nome}{base.origem && repositorio.persistente ? '' : ` · ${base.origem ?? 'base.json'}`} · {base.geradoEm.replace('T', ' ')}
                </footer>
            )}
        </div>
    )
}

function Aviso({ children }: { children: ReactNode }) {
    return <p className="p-8 text-center text-slate-500">{children}</p>
}
