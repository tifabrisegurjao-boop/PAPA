// Roda depois do build (postbuild / postbuild:demo): apaga em <dist>/assets o que nenhum arquivo do build referencia.
// Motivo: esta pasta fica no OneDrive, e o cliente de sincronização segura os arquivos logo após o build —
// o `emptyOutDir` do Vite e o `fs.rm` do Node dizem "apagado", mas o bundle antigo continua lá até o OneDrive soltar.
// Aqui a exclusão é conferida e repetida; se ainda assim sobrar, avisa em vez de fingir que limpou.
// A referência é procurada em TODOS os html/js/css do dist (um chunk de import() dinâmico, como o do Firestore,
// só aparece dentro do JS principal, nunca no index.html).
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as esperar } from 'node:timers/promises'

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', process.argv[2] ?? 'dist')
const ASSETS = join(DIST, 'assets')
if (!existsSync(ASSETS)) process.exit(0)

const listar = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? listar(p) : [p] })
const textos = listar(DIST).filter(p => ['.html', '.js', '.css'].includes(extname(p))).map(p => ({ p, t: readFileSync(p, 'utf8') }))
const orfaos = readdirSync(ASSETS).filter(nome => !textos.some(x => !x.p.endsWith(nome) && x.t.includes(nome)))
for (const nome of orfaos) {
    const caminho = join(ASSETS, nome)
    for (let tentativa = 1; tentativa <= 6 && existsSync(caminho); tentativa++) {
        try { rmSync(caminho, { force: true }) } catch { /* tenta de novo */ }
        if (existsSync(caminho)) await esperar(500 * tentativa)
    }
    console.log(existsSync(caminho) ? `  ⚠ assets/${nome} é antigo e o OneDrive não deixou apagar — apague à mão antes de publicar` : `  removido: assets/${nome} (antigo)`)
}
if (!orfaos.length) console.log(`  ${process.argv[2] ?? 'dist'}/assets só tem o build atual`)

// O build de PRODUÇÃO nunca leva a base em JSON (vem do Firestore). Se sobrou um dados/base.json de build antigo
// que o OneDrive segurou, apaga — e avisa se não conseguir.
if ((process.argv[2] ?? 'dist') === 'dist') {
    const baseAntiga = join(DIST, 'dados', 'base.json')
    if (existsSync(baseAntiga)) {
        try { rmSync(baseAntiga, { force: true }) } catch { /* avisa abaixo */ }
        console.log(existsSync(baseAntiga) ? '  ⚠ dist/dados/base.json é resto de build antigo e NÃO pode ir para o site — apague à mão' : '  removido: dados/base.json (resto de build antigo; produção não leva base)')
    }
}
