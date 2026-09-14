import type { Cliente, Processo } from '../tipos.ts'

// Mesma regra da chave `nameKey` do Nexus (acento, caixa, pontuação e espaços extras não contam),
// para que a futura ligação com o nº do cliente reconheça os nomes do mesmo jeito.
export function normalizar(texto: string): string {
    return texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[.,\-/_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

export const soDigitos = (texto: string) => texto.replace(/\D/g, '')

/** Chave de igualdade de nº de processo: só os dígitos (0038.001245/2026-31 = 0038001245202631); sem dígitos suficientes, o texto normalizado. */
export const chaveNumero = (numero: string) => (soDigitos(numero).length >= 4 ? soDigitos(numero) : normalizar(numero))

/** Mínimo de dígitos para procurar por número: com menos, quase todo processo bate (prefixo 0010…). */
const MIN_DIGITOS = 4

/** Processos cujo número contém os dígitos digitados, com ou sem pontuação (0038.001245 ou 0038001245). */
export function buscarProcessos(processos: Processo[], termo: string): Processo[] {
    const digitos = soDigitos(termo)
    if (digitos.length < MIN_DIGITOS) return []
    return processos.filter(p => soDigitos(p.numero).includes(digitos))
}

/** Busca híbrida: acha o cliente pelo nome ou por ser dono de um processo cujo número bate. */
export function filtrarClientes(clientes: Cliente[], processos: Processo[], termo: string): Cliente[] {
    const alvo = normalizar(termo)
    if (!alvo) return clientes
    const donos = new Set(buscarProcessos(processos, termo).map(p => p.clienteId))
    return clientes.filter(c => normalizar(c.nome).includes(alvo) || donos.has(c.id))
}
