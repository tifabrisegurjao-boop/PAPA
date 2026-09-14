// A planilha guarda a hora de parede do escritório (AAAA-MM-DD ou AAAA-MM-DDTHH:mm, sem fuso).
// Formatar pelo texto, sem `new Date`, evita que um navegador fora do fuso de Porto Velho desloque dia e hora.
export function formatarDataHora(valor: string): string {
    const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/)
    if (!m) return valor
    const [, ano, mes, dia, hora, minuto] = m
    return hora ? `${dia}/${mes}/${ano} às ${hora}:${minuto}` : `${dia}/${mes}/${ano}`
}

/** Compara só a data (AAAA-MM-DD) com o dia local de hoje: negativo = já passou. */
export function diasAte(data: string, hoje = new Date()): number | null {
    const m = data.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (!m) return null
    const alvo = Date.UTC(+m[1], +m[2] - 1, +m[3])
    const local = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    return Math.round((alvo - local) / 86400000)
}
