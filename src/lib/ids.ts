import { normalizar } from './busca.ts'

// Mesma regra do conversor (scripts/converter.mjs): id determinístico a partir do nome/nº, para que
// importar a planilha de novo ATUALIZE o registro em vez de duplicar.
const slug = (texto: string) => normalizar(texto).replace(/ /g, '-')

export const idCliente = (nome: string) => `c-${slug(nome)}`
export const idProcesso = (numero: string) => `p-${slug(numero)}`

/** Garante id único: se já existir, acrescenta -2, -3… (mesma convenção do conversor para nº repetido). */
export function idLivre(base: string, usados: Iterable<string>): string {
    const conjunto = new Set(usados)
    if (!conjunto.has(base)) return base
    for (let n = 2; ; n++) if (!conjunto.has(`${base}-${n}`)) return `${base}-${n}`
}
