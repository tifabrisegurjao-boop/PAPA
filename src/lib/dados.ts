import type { Base } from '../tipos.ts'

// JSON gerado da planilha por `npm run dados` (dados/base.json). Só existe no servidor de desenvolvimento e no build da
// demo (vite.config.ts): o build de produção não leva base nenhuma — os dados vêm do Firestore (repositorioFirestore.ts).
export async function carregarBase(): Promise<Base> {
    const resposta = await fetch(`${import.meta.env.BASE_URL}dados/base.json`, { cache: 'no-store' })
    if (!resposta.ok) throw new Error(`Não foi possível carregar a base de dados (HTTP ${resposta.status}).`)
    const base: Base = await resposta.json()
    if (!Array.isArray(base.clientes) || !Array.isArray(base.processos)) throw new Error('A base de dados está num formato inesperado. Gere de novo com `npm run dados`.')
    return base
}
