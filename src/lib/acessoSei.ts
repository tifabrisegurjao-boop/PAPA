import type { Processo } from '../tipos.ts'

// Como se chega ao processo no sistema de origem (01/10/2026). Regra pura, testada em tests/acessoSei.test.ts.
//   direto  = link de acesso externo que abre sozinho (o que o órgão manda por e-mail): clicar e pronto.
//   login   = só abre com alguém logado no SEI como usuário externo (forma "Login SEI" / "SEI GERAL", ou o link guardado
//             é a própria tela de login). O painel diz com qual conta entrar e copia o nº para colar lá dentro.
//   sem-link = não há o que abrir.
// O PAPA não guarda senha de ninguém: quem preenche o login é o gerenciador de senhas do navegador de cada pessoa.

export type ModoAcesso = 'direto' | 'login' | 'sem-link'

export interface RotaAcesso {
    modo: ModoAcesso
    /** O que o cartão abre: o link guardado ou, na falta dele, a tela de login do SEI do órgão. */
    url?: string
    /** Tela de login do mesmo SEI, para quando o link guardado pede login. */
    urlLogin?: string
    /** E-mail da conta de acesso (coluna CONTA DE ACESSO). */
    conta?: string
}

/** SEI de cada sistema quando o processo não tem link (só o que é certo; órgão federal varia de host). */
const HOST_DO_SISTEMA: Record<string, string> = { 'SEI/RO': 'sei.sistemas.ro.gov.br' }

const ehHttps = (url?: string): url is string => !!url && /^https:\/\//i.test(url)
const ehTelaDeLogin = (url: string) => /[?&]acao=usuario_externo_logar\b/i.test(url)

/** Tela de login de usuário externo do SEI que hospeda `url` (ou do sistema, se não houver link). */
function telaDeLogin(p: Processo): string | undefined {
    let host = HOST_DO_SISTEMA[p.sistema ?? '']
    if (ehHttps(p.linkProcesso)) {
        try {
            const u = new URL(p.linkProcesso)
            if (/\/sei\//i.test(u.pathname)) host = u.host
        } catch { /* link malformado: fica o host do sistema */ }
    }
    return host ? `https://${host}/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0` : undefined
}

export function rotaDeAcesso(p: Processo): RotaAcesso {
    const link = ehHttps(p.linkProcesso) ? p.linkProcesso : undefined
    const conta = p.acesso?.conta || undefined
    const urlLogin = telaDeLogin(p)
    const formaPedeLogin = /login sei|sei geral/i.test(p.acesso?.forma ?? '')
    if (link && !ehTelaDeLogin(link) && !formaPedeLogin) return { modo: 'direto', url: link, urlLogin, conta }
    // Sem link, só vale como "login" quando a planilha diz que o acesso é por conta (forma ou SEI GERAL = SIM).
    const temComoEntrar = link || (urlLogin && (formaPedeLogin || p.acesso?.seiGeral === 'SIM'))
    if (!temComoEntrar) return { modo: 'sem-link', conta }
    return { modo: 'login', url: link ?? urlLogin, urlLogin, conta }
}
