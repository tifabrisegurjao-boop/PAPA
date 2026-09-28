export declare const LIMITES: {
    papaClientes: Record<string, number>
    papaProcessos: Record<string, number>
}
export declare const CHAVES: {
    papaClientes: readonly string[]
    papaProcessos: readonly string[]
}
export declare const CHAVES_DE_CONTROLE: readonly string[]
export declare function erroTamanho(colecao: 'papaClientes' | 'papaProcessos', campo: string, valor: string | undefined): string | undefined
