// npm run dados:links-exemplo -- [base.json]
// SÓ PARA A BASE FICTÍCIA DA DEMO: preenche o link da pasta do OneDrive dos clientes que não têm um, apontando para
// um endereço genérico, para o cartão "Pasta no OneDrive" ficar clicável nos testes. Não mexe em quem já tem link.
// Nunca rode isto numa base real — o link não leva à pasta de ninguém.
import { readFileSync, writeFileSync } from 'node:fs'

const LINK_EXEMPLO = 'https://onedrive.live.com/'
const arquivo = process.argv[2] ?? 'dados/base.json'
const base = JSON.parse(readFileSync(arquivo, 'utf8'))

let preenchidos = 0
for (const c of base.clientes) {
    if (!c.linkPasta) { c.linkPasta = LINK_EXEMPLO; preenchidos++ }
}
writeFileSync(arquivo, JSON.stringify(base, null, 2) + '\n')
console.log(`✔ ${arquivo}: link de exemplo da pasta em ${preenchidos} de ${base.clientes.length} clientes (${LINK_EXEMPLO})`)
