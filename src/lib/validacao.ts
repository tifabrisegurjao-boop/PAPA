import { chaveNumero, normalizar } from './busca.ts'
import type { Cliente, Processo } from '../tipos.ts'

// Regras de validação dos formulários, puras e testadas (tests/regras.test.ts).

/**
 * Nº de processo único na base. Só é conferido quando o nº MUDOU em relação ao registro aberto: um processo que já
 * veio repetido da planilha continua editável (corrigir o status, o link…), mas trocar para um nº que pertence a outro
 * registro é recusado. Compara pelos dígitos (0038.001245/2026-31 = 0038001245202631), como a busca.
 */
export function erroNumero(numero: string, inicial: Processo | undefined, todos: Processo[]): string | undefined {
    const n = numero.trim()
    if (!n) return 'Informe o número do processo.'
    if (inicial && chaveNumero(inicial.numero) === chaveNumero(n)) return undefined
    const repetido = todos.find(p => p.id !== inicial?.id && chaveNumero(p.numero) === chaveNumero(n))
    return repetido ? 'Já existe um processo com este número na base.' : undefined
}

/** Nome de cliente único (sem acento/caixa), exceto o próprio registro em edição. */
export function erroNomeCliente(nome: string, inicial: Cliente | undefined, todos: Cliente[]): string | undefined {
    const n = nome.trim()
    if (!n) return 'Informe o nome do cliente.'
    const repetido = todos.some(c => c.id !== inicial?.id && normalizar(c.nome) === normalizar(n))
    return repetido ? 'Já existe um cliente com este nome.' : undefined
}
