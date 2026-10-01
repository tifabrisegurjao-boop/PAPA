// PAPA — Acesso ao SEI · tela de contas. As contas ficam em chrome.storage.local › "contas":
// [{ host, email, senha, padrao }]. Esta página é da própria extensão (contexto confiável) e por isso lê e grava direto.
// A senha salva nunca é mostrada de volta: para corrigir, digite a nova por cima.
(() => {
    'use strict'
    const { HOSTS } = globalThis.PapaSei
    const el = id => document.getElementById(id)
    const hosts = Object.keys(HOSTS)

    for (const host of hosts) el('host').append(new Option(`${HOSTS[host]} — ${host}`, host))

    const ler = async () => (await chrome.storage.local.get('contas')).contas ?? []
    const gravar = contas => chrome.storage.local.set({ contas })
    const mesma = (c, host, email) => c.host === host && c.email === email

    function recado(texto, erro = false) {
        el('recado').textContent = texto
        el('recado').className = erro ? 'erro' : ''
    }

    async function desenhar() {
        const contas = (await ler()).slice().sort((a, b) => hosts.indexOf(a.host) - hosts.indexOf(b.host) || a.email.localeCompare(b.email))
        el('vazio').hidden = contas.length > 0
        el('tabela').hidden = contas.length === 0
        const linhas = el('linhas')
        linhas.replaceChildren()
        for (const c of contas) {
            const tr = document.createElement('tr')
            const celula = texto => { const td = document.createElement('td'); td.textContent = texto; return td }
            const acoes = document.createElement('td')
            acoes.className = 'acoes'
            const trocar = Object.assign(document.createElement('button'), { type: 'button', className: 'leve', textContent: 'Trocar senha' })
            trocar.addEventListener('click', () => {
                el('host').value = c.host
                el('email').value = c.email
                el('padrao').checked = !!c.padrao
                el('senha').value = ''
                el('senha').focus()
                recado('Digite a senha nova e salve.')
            })
            const remover = Object.assign(document.createElement('button'), { type: 'button', className: 'leve perigo', textContent: 'Remover' })
            remover.addEventListener('click', async () => {
                if (!confirm(`Remover a conta ${c.email} (${HOSTS[c.host] ?? c.host})?`)) return
                await gravar((await ler()).filter(x => !mesma(x, c.host, c.email)))
                recado('Conta removida.')
                desenhar()
            })
            acoes.append(trocar, ' ', remover)
            tr.append(celula(HOSTS[c.host] ?? c.host), celula(c.email), celula('salva'), celula(c.padrao ? 'sim' : ''), acoes)
            linhas.append(tr)
        }
    }

    el('formulario').addEventListener('submit', async evento => {
        evento.preventDefault()
        const host = el('host').value
        const email = el('email').value.trim().toLowerCase()
        const senha = el('senha').value
        const padrao = el('padrao').checked
        if (!hosts.includes(host)) return recado('Escolha o SEI.', true)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return recado('E-mail inválido.', true)
        if (!senha) return recado('Digite a senha.', true)
        let contas = (await ler()).filter(c => !mesma(c, host, email))
        // Só uma conta padrão por SEI.
        if (padrao) contas = contas.map(c => (c.host === host ? { ...c, padrao: false } : c))
        contas.push({ host, email, senha, padrao })
        await gravar(contas)
        el('senha').value = ''
        el('email').value = ''
        el('padrao').checked = false
        recado(`Conta ${email} salva.`)
        desenhar()
    })

    desenhar()
})()
