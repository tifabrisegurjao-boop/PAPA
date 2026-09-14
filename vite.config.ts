import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// A base em JSON (dados/base.json, gerada por `npm run dados`) fica FORA de public/ de propósito: um arquivo em public/
// entra em todo build e é baixável por quem souber o endereço, mesmo com login na tela. Ela só é servida
// (1) no servidor de desenvolvimento e (2) no build da demo (`--mode demo`), que é fictícia por definição.
// O build de produção não leva base nenhuma: os dados vêm do Firestore.
function baseJson(): Plugin {
    const arquivo = resolve(__dirname, 'dados/base.json')
    return {
        name: 'papa-base-json',
        configureServer(servidor) {
            servidor.middlewares.use('/dados/base.json', (_req, res) => {
                if (!existsSync(arquivo)) { res.statusCode = 404; res.end('Gere a base com `npm run dados`.'); return }
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.setHeader('Cache-Control', 'no-store')
                res.end(readFileSync(arquivo))
            })
        },
        generateBundle() {
            if (process.env.VITE_DEMO === '1' && existsSync(arquivo))
                this.emitFile({ type: 'asset', fileName: 'dados/base.json', source: readFileSync(arquivo) })
        },
    }
}

export default defineConfig(({ mode }) => {
    if (mode === 'demo') process.env.VITE_DEMO = '1'
    return {
        plugins: [react(), baseJson()],
        // Caminhos relativos: o build funciona em qualquer subpasta do site (ex.: /processos/) quando for integrado à Legal Suite.
        base: './',
        // O OneDrive segura os arquivos logo após o build e o esvaziamento do dist/ não pega: scripts/limpar-dist.mjs (postbuild) confere.
        build: { emptyOutDir: true },
    }
})
