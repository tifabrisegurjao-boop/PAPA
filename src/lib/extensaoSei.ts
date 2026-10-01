// Ponte com a extensão "PAPA — Acesso ao SEI" (pasta extensao/). Um site não consegue digitar o login em outro site;
// a extensão consegue, porque roda dentro da página do SEI. Aqui o PAPA só descobre se ela está instalada e pede
// "abra este processo": nº, conta de acesso e endereço do SEI. Senha nenhuma passa por aqui — elas ficam na extensão.

export interface PedidoSei {
    numero: string
    /** E-mail da conta de acesso; vazio = a extensão usa a conta padrão daquele SEI. */
    conta?: string
    /** Host do SEI (ex.: sei.sistemas.ro.gov.br). */
    host: string
}

export interface RespostaSei {
    ok: boolean
    motivo?: string
    /** Texto pronto para mostrar quando não deu (conta sem senha salva, SEI não atendido…). */
    mensagem?: string
}

/** A extensão avisa que está instalada marcando o <html>, antes de o PAPA carregar, com a versão dela (ex.: "0.1.1"). */
export const versaoDaExtensaoSei = (): string | undefined => document.documentElement.dataset.papaExtensaoSei || undefined

let contador = 0

/** Pede a abertura e espera a resposta do fundo da extensão (2,5 s; sem resposta = extensão desligada ou recarregada). */
export function abrirNoSeiPelaExtensao(pedido: PedidoSei): Promise<RespostaSei> {
    const id = `papa-${Date.now()}-${++contador}`
    return new Promise(resolver => {
        const ouvir = (evento: MessageEvent) => {
            if (evento.source !== window || evento.origin !== window.location.origin) return
            const m = evento.data as { origem?: string; tipo?: string; id?: string } & RespostaSei
            if (m?.origem !== 'papa-extensao' || m.tipo !== 'papa-sei-resposta' || m.id !== id) return
            terminar({ ok: !!m.ok, motivo: m.motivo, mensagem: m.mensagem })
        }
        const prazo = window.setTimeout(
            () => terminar({ ok: false, motivo: 'sem-resposta', mensagem: 'A extensão PAPA não respondeu. Recarregue a página (F5) e confira se ela está ligada.' }),
            2500,
        )
        function terminar(resposta: RespostaSei) {
            window.clearTimeout(prazo)
            window.removeEventListener('message', ouvir)
            resolver(resposta)
        }
        window.addEventListener('message', ouvir)
        window.postMessage({ origem: 'papa', tipo: 'papa-sei-abrir', id, ...pedido }, window.location.origin)
    })
}
