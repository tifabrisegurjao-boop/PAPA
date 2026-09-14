# -*- coding: utf-8 -*-
"""Gera as planilhas do modelo v2 (Controle de Processos) a partir de modelo.json.

    python planilha/gerar_planilha.py modelo                        → planilha/Modelo_Controle_de_Processos_v2.xlsx (vazio, 1 linha de exemplo)
    python planilha/gerar_planilha.py exemplo                       → planilha/exemplo/Controle_de_Processos_EXEMPLO.xlsx (base fictícia do sistema)
    python planilha/gerar_planilha.py migrar ORIGEM.xlsx DESTINO.xlsx → converte a planilha antiga (Planilha1) para o modelo v2

A migração NUNCA copia a coluna LOGIN / SENHA da planilha antiga: só o e-mail da conta, sem senha.
Tudo que não pôde ser convertido com segurança vai para a coluna PENDÊNCIA (migração), nunca some.
"""
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, date
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.properties import CalcProperties
from openpyxl.worksheet.datavalidation import DataValidation

sys.stdout.reconfigure(encoding="utf-8")  # console do Windows vem em cp1252 e não imprime acentos nem ✔

AQUI = Path(__file__).resolve().parent
MODELO = json.loads((AQUI / "modelo.json").read_text(encoding="utf-8"))
ABAS, CAP, LISTAS = MODELO["abas"], MODELO["capacidade"], MODELO["listas"]

FONTE = "Arial"
ROXO, CINZA = "173A4C", "595959"  # ROXO é o nome histórico da cor de cabeçalho; desde 11/09/2026 é o petróleo da identidade do escritório
COR_LINHA = {"ATIVO": "E2F0D9", "EXPIRADO": "FFF2CC", "SEM INFO": "E4DFEC", "FÍSICO": "DDEBF7"}
ROSA, VERMELHO, LARANJA = "FFD9EC", "FFC7CE", "F8CBAD"


def preencher(cor):
    return PatternFill("solid", start_color=cor, end_color=cor)


def normalizar(texto):
    """Mesma chave do sistema (src/lib/busca.ts): sem acento, caixa, pontuação e espaços extras."""
    t = unicodedata.normalize("NFD", str(texto or ""))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn").lower()
    t = re.sub(r"[.,\-/_]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# ──────────────────────────────────────────────────────────────────────────────
# Construção do arquivo
# ──────────────────────────────────────────────────────────────────────────────
def colunas(aba, migrado=False):
    cols = list(MODELO["colunas"][aba])
    if migrado and aba == "processos":
        cols.append({"chave": "pendencia", "titulo": "PENDÊNCIA (migração)", "largura": 60, "longo": True,
                     "ajuda": "O que a migração automática não conseguiu decidir sozinha. Resolva e apague o texto."})
    return cols


def letra(aba, chave, migrado=False):
    for i, c in enumerate(colunas(aba, migrado), start=1):
        if c["chave"] == chave:
            return get_column_letter(i)
    raise KeyError(chave)


def faixa_lista(nome):
    """Endereço absoluto da lista na aba Listas (colunas fixas, na ordem do modelo.json)."""
    nomes = list(LISTAS)
    col = 1
    for n in nomes:
        if n == nome:
            return f"{ABAS['listas']}!${get_column_letter(col)}$2:${get_column_letter(col)}${CAP['listas'] + 1}"
        col += 2 if n == "orgao" else 1
    raise KeyError(nome)


def cabecalho(ws, cols):
    ws.row_dimensions[1].height = 45
    for i, c in enumerate(cols, start=1):
        titulo = c["titulo"] + (" *" if c.get("obrigatorio") else "")
        cel = ws.cell(row=1, column=i, value=titulo)
        cel.font = Font(name=FONTE, bold=True, color="FFFFFF", size=10)
        cel.fill = preencher(CINZA if c.get("formula") else ROXO)
        cel.alignment = Alignment(wrap_text=True, vertical="center", horizontal="center")
        if c.get("ajuda"):
            com = Comment(c["ajuda"], "Modelo v2")
            com.width, com.height = 320, 110
            cel.comment = com
        ws.column_dimensions[get_column_letter(i)].width = c.get("largura", 18)
    ws.freeze_panes = "A2"


def estilo_corpo(ws, cols, ultima_linha):
    fonte = Font(name=FONTE, size=10)
    for i, c in enumerate(cols, start=1):
        al = Alignment(wrap_text=bool(c.get("longo")), vertical="top")
        for r in range(2, ultima_linha + 1):
            cel = ws.cell(row=r, column=i)
            cel.font = fonte
            cel.alignment = al
            if c.get("tipo") == "data":
                cel.number_format = "dd/mm/yyyy"


def validacoes(ws, aba, cols, cap):
    for i, c in enumerate(cols, start=1):
        col = get_column_letter(i)
        faixa = f"{col}2:{col}{cap + 1}"
        dv = None
        if c.get("lista"):
            dv = DataValidation(type="list", formula1=faixa_lista(c["lista"]), allow_blank=True,
                                errorTitle="Valor fora do menu",
                                error="Escolha um valor do menu. Para incluir um valor novo, acrescente na aba Listas.")
        elif c.get("listaDe") == "clientes":
            dv = DataValidation(type="list", formula1=f"{ABAS['clientes']}!$A$2:$A${CAP['clientes'] + 1}", allow_blank=True,
                                errorTitle="Cliente não cadastrado",
                                error="Cadastre o cliente na aba Clientes primeiro (uma linha por cliente).")
        elif c.get("tipo") == "data":
            dv = DataValidation(type="date", operator="greaterThan", formula1="36526", allow_blank=True,
                                errorTitle="Data inválida",
                                error="Digite uma data real (dd/mm/aaaa). Data escrita como texto não conta prazo.")
        if dv:
            dv.showErrorMessage = True
            ws.add_data_validation(dv)
            dv.add(faixa)


def formulas_e_cores(ws, cols, cap, migrado):
    L = lambda chave: letra("processos", chave, migrado)
    fim = cap + 1
    n, u, t, o, a, cli = L("numero"), L("url"), L("terminoAcesso"), L("origem"), L("cliente"), L("cliente")
    for r in range(2, fim + 1):
        ws[f"{L('abrir')}{r}"] = f'=IF(${u}{r}="","",HYPERLINK(${u}{r},"Abrir ↗"))'
        ws[f"{L('prazoAcesso')}{r}"] = (f'=IF(${n}{r}="","",IF(${t}{r}="","SEM DATA",'
                                        f'IF(${t}{r}<TODAY(),"EXPIRADO",IF(${t}{r}<=TODAY()+7,"A VENCER","OK"))))')
    ultima = get_column_letter(len(cols))
    linha = f"A2:{ultima}{fim}"
    # Ordem importa: a primeira regra verdadeira dá a cor. Erros antes das cores de situação.
    ws.conditional_formatting.add(f"{n}2:{n}{fim}", FormulaRule(formula=[f'AND(${n}2<>"",COUNTIF(${n}$2:${n}${fim},${n}2)>1)'], fill=preencher(VERMELHO)))
    ws.conditional_formatting.add(f"{o}2:{o}{fim}", FormulaRule(formula=[f'AND(${o}2<>"",COUNTIF(${n}$2:${n}${fim},${o}2)=0)'], fill=preencher(LARANJA)))
    ws.conditional_formatting.add(f"{cli}2:{cli}{fim}", FormulaRule(formula=[f'AND(${cli}2<>"",COUNTIF({ABAS["clientes"]}!$A$2:$A${CAP["clientes"] + 1},${cli}2)=0)'], fill=preencher(LARANJA)))
    for chave in ("cliente", "numero"):
        c = L(chave)
        outra = n if chave == "cliente" else a
        ws.conditional_formatting.add(f"{c}2:{c}{fim}", FormulaRule(formula=[f'AND(${c}2="",${outra}2<>"")'], fill=preencher(ROSA)))
    pa = L("prazoAcesso")
    ws.conditional_formatting.add(f"{pa}2:{pa}{fim}", FormulaRule(formula=[f'${pa}2="EXPIRADO"'], font=Font(name=FONTE, size=10, bold=True, color="C00000")))
    ws.conditional_formatting.add(f"{pa}2:{pa}{fim}", FormulaRule(formula=[f'${pa}2="A VENCER"'], font=Font(name=FONTE, size=10, bold=True, color="C65911")))
    s = L("situacaoAcesso")
    for valor, cor in COR_LINHA.items():
        ws.conditional_formatting.add(linha, FormulaRule(formula=[f'${s}2="{valor}"'], fill=preencher(cor)))
    ws.auto_filter.ref = f"A1:{ultima}{fim}"


def cores_clientes(ws, cols, cap):
    fim = cap + 1
    ws.conditional_formatting.add(f"A2:A{fim}", FormulaRule(formula=[f'AND($A2<>"",COUNTIF($A$2:$A${fim},$A2)>1)'], fill=preencher(VERMELHO)))
    ws.conditional_formatting.add(f"B2:B{fim}", FormulaRule(formula=['AND($B2="",$A2<>"")'], fill=preencher(ROSA)))
    ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}{fim}"


def aba_listas(wb, contas=None):
    ws = wb.create_sheet(ABAS["listas"])
    col = 1
    for nome, valores in LISTAS.items():
        if nome == "conta" and contas:
            valores = contas
        if nome == "orgao":
            titulos, linhas = ["ÓRGÃO (sigla)", "ÓRGÃO (nome completo — aparece no painel)"], valores
        else:
            titulos, linhas = [{
                "pfpj": "PF OU PJ", "simnao": "SIM / NÃO",
                "vinculo": "VÍNCULO", "sistema": "SISTEMA", "tipo": "TIPO", "natureza": "NATUREZA", "status": "STATUS DO PROCESSO",
                "formaAcesso": "FORMA DE ACESSO", "conta": "CONTA DE ACESSO (sem senha)", "situacaoCor": "SITUAÇÃO DO ACESSO"}[nome]], [[v] for v in valores]
        for j, t in enumerate(titulos):
            cel = ws.cell(row=1, column=col + j, value=t)
            cel.font = Font(name=FONTE, bold=True, color="FFFFFF", size=10)
            cel.fill = preencher(ROXO)
            cel.alignment = Alignment(wrap_text=True, vertical="center")
            ws.column_dimensions[get_column_letter(col + j)].width = 44 if "nome completo" in t else max(14, min(40, max(len(str(l[j])) for l in linhas) + 2))
        for r, l in enumerate(linhas, start=2):
            for j, v in enumerate(l):
                ws.cell(row=r, column=col + j, value=v).font = Font(name=FONTE, size=10)
        col += len(titulos)
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"
    nota = ws.cell(row=CAP["listas"] + 3, column=1,
                   value=f"Os menus das abas Clientes e Processos leem estas colunas até a linha {CAP['listas'] + 1}. "
                         "Para incluir um valor novo, digite na primeira linha vazia da coluna. Não renomeie as abas.")
    nota.font = Font(name=FONTE, size=9, italic=True, color=CINZA)
    return ws


MANUAL = [
    ("T", "MANUAL DE UTILIZAÇÃO — Controle de Processos v2"),
    ("S", f"Modelo v{MODELO['versao']} · {MODELO['atualizadoEm']} · alimenta o sistema web de consulta (Controle de Processos MVP)"),
    ("", ""),
    ("H", "1. PARA QUE SERVE"),
    ("P", "Esta planilha é a ENTRADA de dados do sistema de consulta do escritório. O que for digitado aqui vira a listagem de clientes, a árvore de processos, "
          "os cartões e a 'situação atual' de cada processo no sistema. Continua servindo também para o controle de acesso (prazos, renovações)."),
    ("P", "Fluxo: você preenche as abas Clientes e Processos → o desenvolvedor roda a conversão (npm run dados) → o sistema mostra."),
    ("", ""),
    ("H", "2. AS ABAS"),
    ("K", "Clientes", "UMA linha por cliente: nome (grafia única), PF ou PJ, link da pasta no OneDrive. Digite aqui ANTES de lançar processos do cliente."),
    ("K", "Processos", "UMA linha por processo. O cliente é escolhido no MENU (vem da aba Clientes). Colunas roxas = digitação; cinzas '(auto)' = fórmula, não digitar."),
    ("K", "Listas", "Os valores dos menus (Tipo, Natureza, Órgão, Status, Sistema, Forma e Conta de acesso). Pode incluir valores novos nas linhas vazias."),
    ("K", "Manual", "Esta aba."),
    ("", ""),
    ("H", "3. COMO PREENCHER — ABA CLIENTES"),
    ("K", "NOME DO CLIENTE *", "Como vai aparecer no sistema. Uma linha por cliente; nome repetido fica VERMELHO."),
    ("K", "PF OU PJ *", "Decide a coluna da tela inicial (Pessoa física / Pessoa jurídica). Fica ROSA enquanto faltar."),
    ("K", "Nº DO CLIENTE (Nexus)", "Opcional por enquanto. Número de 4 dígitos da Biblioteca de Clientes do Nexus. Vai ligar os dois sistemas depois."),
    ("K", "LINK DA PASTA (OneDrive)", "Link de COMPARTILHAMENTO (https://...). O cartão 'Pasta' do painel abre esse link. Caminho C:\\ não funciona para outra pessoa."),
    ("", ""),
    ("H", "4. COMO PREENCHER — ABA PROCESSOS"),
    ("K", "CLIENTE *", "Menu com os nomes da aba Clientes. Fica LARANJA se o nome não existir lá."),
    ("K", "Nº DO PROCESSO *", "Número exato do sistema de origem. Nunca repetir — fica VERMELHO se já existir. É a identidade do processo no sistema."),
    ("K", "SISTEMA", "SEI/RO, SEI federal, PJe, TCU, Físico... O cartão do painel mostra esse nome."),
    ("K", "PROCESSO DE ORIGEM", "VAZIO = processo PRINCIPAL (ramo próprio na árvore). Preenchido = número do processo do qual este nasceu. Fica LARANJA se o número não existir na coluna Nº DO PROCESSO."),
    ("K", "VÍNCULO", "Só com origem preenchida. Derivado = desdobramento (recurso, comunicação, desmembrado). Relacionado = ligação sem ser desdobramento."),
    ("K", "TIPO / NATUREZA / ÓRGÃO / STATUS", "Menus. O painel mostra cada um num cartão. O nome completo do órgão vem da aba Listas."),
    ("K", "OBJETO", "Descrição curta do que se discute."),
    ("K", "SITUAÇÃO ATUAL", "O texto do painel em 'Histórico / Situação atual'. Escreva para quem vai ler daqui a meses: o que já aconteceu e o que se espera. "
          "REGRA PROVISÓRIA: se ficar vazia, o painel mostra a OBSERVAÇÃO no lugar — então, por enquanto, pode continuar registrando o andamento na OBSERVAÇÃO."),
    ("K", "ÚLT. MOVIMENTAÇÃO — DATA / DESCRIÇÃO", "A última movimentação do processo. Data como data (dd/mm/aaaa, pode ter hora); descrição em uma frase."),
    ("K", "LINK DO PROCESSO (URL)", "Link de acesso externo. A coluna ABRIR (auto) vira 'Abrir ↗' sozinha."),
    ("K", "CÓDIGO DO CASO (Nexus)", "Opcional. Código do contrato gerado no Nexus (1234-26.5678)."),
    ("K", "FORMA DE ACESSO / CONTA DE ACESSO / ACESSO NO SEI GERAL?", "Como e com qual conta o escritório acessa. SEM SENHA na planilha: senhas ficam no gerenciador de senhas."),
    ("K", "DATA DO PEDIDO / TÉRMINO DO ACESSO", "Datas reais (dd/mm/aaaa). O TÉRMINO alimenta PRAZO DO ACESSO (auto): OK / A VENCER (7 dias) / EXPIRADO / SEM DATA."),
    ("K", "SOLICITAR RENOVAÇÃO?", "SIM = entra na fila da rotina semanal."),
    ("K", "SITUAÇÃO DO ACESSO (cor)", "ATIVO (verde) · EXPIRADO (amarelo) · SEM INFO (roxo) · FÍSICO (azul). Pinta a linha inteira."),
    ("K", "OBSERVAÇÃO", "Histórico e justificativas. Não apagar: complementar. Enquanto SITUAÇÃO ATUAL estiver vazia, é este texto que aparece no painel do sistema."),
    ("", ""),
    ("H", "5. CORES AUTOMÁTICAS"),
    ("K", "Vermelho", "Nº de processo (ou nome de cliente) repetido."),
    ("K", "Laranja", "Processo de origem ou cliente que não existe na planilha."),
    ("K", "Rosa", "Campo obrigatório em branco numa linha já usada."),
    ("K", "Verde / Amarelo / Roxo / Azul", "Situação do acesso (coluna SITUAÇÃO DO ACESSO)."),
    ("", ""),
    ("H", "6. ROTINA"),
    ("K", "Cliente novo", "Aba Clientes, primeira linha vazia: nome, PF/PJ, link da pasta."),
    ("K", "Processo novo", "Aba Processos, primeira linha vazia: cliente (menu), nº, sistema, tipo, órgão, status, situação atual, link. Se for desdobramento, informe o PROCESSO DE ORIGEM."),
    ("K", "Andamento", "Atualize SITUAÇÃO ATUAL (ou, por enquanto, a OBSERVAÇÃO) e ÚLT. MOVIMENTAÇÃO — é isso que o advogado lê no painel."),
    ("K", "Prazos de acesso (semanal)", "Filtre PRAZO DO ACESSO = EXPIRADO ou A VENCER e marque SOLICITAR RENOVAÇÃO? = SIM."),
    ("K", "Excluir", "Prefira limpar o conteúdo da linha (Delete) a excluir a linha: as fórmulas (auto) ficam."),
    ("K", "Enviar ao sistema", "Salve e avise o desenvolvedor (ou rode npm run dados). Nada do que estiver LARANJA/VERMELHO some do sistema, mas aparece com aviso."),
    ("", ""),
    ("H", "7. O QUE MUDOU EM RELAÇÃO À PLANILHA ANTIGA"),
    ("P", "• Clientes ganharam aba própria: nome, PF/PJ e pasta são digitados UMA vez, não em cada processo."),
    ("P", "• PRINCIPAL? e 'VEIO DE / GEROU' viraram PROCESSO DE ORIGEM + VÍNCULO: só o sentido 'veio de' é digitado; o 'gerou' o sistema calcula."),
    ("P", "• Tipo, Natureza, Órgão, Status, Sistema, Forma e Conta de acesso viraram MENUS (aba Listas) — sem variações de grafia."),
    ("P", "• Colunas novas para o painel: SISTEMA, STATUS DO PROCESSO, SITUAÇÃO ATUAL, ÚLT. MOVIMENTAÇÃO (data e descrição), CÓDIGO DO CASO (Nexus)."),
    ("P", "• LOGIN / SENHA saiu. Fica só CONTA DE ACESSO (qual e-mail), sem senha."),
    ("P", "• As abas automáticas Pessoa Física / Pessoa Jurídica saíram: essa visão agora é a tela inicial do sistema."),
    ("", ""),
    ("H", "8. BOAS PRÁTICAS"),
    ("P", "• Ao colar dados de outra planilha, use Colar Especial > Valores (colar com formatação apaga menus e fórmulas)."),
    ("P", "• Datas sempre como data (dd/mm/aaaa). Data digitada como texto não conta prazo."),
    ("P", "• Um valor novo de menu entra pela aba Listas, não digitando por cima do menu."),
    ("P", "• Grafia única de cliente e de órgão: o sistema agrupa por nome."),
]


def aba_manual(wb):
    ws = wb.create_sheet(ABAS["manual"], 0)
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 110
    ws.sheet_view.showGridLines = False
    r = 2
    for item in MANUAL:
        tipo, texto = item[0], item[1]
        if tipo == "T":
            c = ws.cell(row=r, column=2, value=texto)
            c.font = Font(name=FONTE, bold=True, size=16, color=ROXO)
        elif tipo == "S":
            c = ws.cell(row=r, column=2, value=texto)
            c.font = Font(name=FONTE, italic=True, size=10, color=CINZA)
        elif tipo == "H":
            c = ws.cell(row=r, column=2, value=texto)
            c.font = Font(name=FONTE, bold=True, size=12, color="FFFFFF")
            c.fill = preencher(ROXO)
            ws.cell(row=r, column=3).fill = preencher(ROXO)
        elif tipo == "K":
            k = ws.cell(row=r, column=2, value=texto)
            k.font = Font(name=FONTE, bold=True, size=10)
            k.alignment = Alignment(vertical="top", wrap_text=True)
            v = ws.cell(row=r, column=3, value=item[2])
            v.font = Font(name=FONTE, size=10)
            v.alignment = Alignment(vertical="top", wrap_text=True)
        elif tipo == "P":
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=3)
            c = ws.cell(row=r, column=2, value=texto)
            c.font = Font(name=FONTE, size=10)
            c.alignment = Alignment(vertical="top", wrap_text=True)
            ws.row_dimensions[r].height = 15 * (1 + len(texto) // 150)
        r += 1
    return ws


def escrever_linhas(ws, cols, linhas):
    for r, linha in enumerate(linhas, start=2):
        for i, c in enumerate(cols, start=1):
            v = linha.get(c["chave"])
            if v in (None, ""):
                continue
            ws.cell(row=r, column=i, value=v)


def montar(clientes, processos, destino, migrado=False, contas=None):
    wb = Workbook()
    wb.remove(wb.active)
    aba_manual(wb)
    wc = wb.create_sheet(ABAS["clientes"])
    cc = colunas("clientes")
    cabecalho(wc, cc)
    escrever_linhas(wc, cc, clientes)
    estilo_corpo(wc, cc, CAP["clientes"] + 1)
    validacoes(wc, "clientes", cc, CAP["clientes"])
    cores_clientes(wc, cc, CAP["clientes"])

    wp = wb.create_sheet(ABAS["processos"])
    cp = colunas("processos", migrado)
    cabecalho(wp, cp)
    escrever_linhas(wp, cp, processos)
    estilo_corpo(wp, cp, CAP["processos"] + 1)
    validacoes(wp, "processos", cp, CAP["processos"])
    formulas_e_cores(wp, cp, CAP["processos"], migrado)

    aba_listas(wb, contas)
    wb.calculation = CalcProperties(fullCalcOnLoad=True)  # sem LibreOffice aqui: o Excel calcula as fórmulas ao abrir
    wb.active = 1
    Path(destino).parent.mkdir(parents=True, exist_ok=True)
    wb.save(destino)
    print(f"✔ {destino}  ({len(clientes)} clientes, {len(processos)} processos)")


# ──────────────────────────────────────────────────────────────────────────────
# Dados fictícios (modelo e exemplo)
# ──────────────────────────────────────────────────────────────────────────────
def d(ano, mes, dia, h=None, m=None):
    return datetime(ano, mes, dia, h, m) if h is not None else date(ano, mes, dia)


CLIENTES_EXEMPLO = [
    {"nome": "Ana Beatriz Souza", "tipoPessoa": "PF", "numeroNexus": "4821", "linkPasta": "https://example.com/onedrive/ana-beatriz-souza"},
    {"nome": "Carlos Eduardo Lima", "tipoPessoa": "PF", "linkPasta": "https://example.com/onedrive/carlos-eduardo-lima"},
    {"nome": "Mariana Alves Rocha", "tipoPessoa": "PF"},
    {"nome": "João Pedro Martins", "tipoPessoa": "PF", "linkPasta": "https://example.com/onedrive/joao-pedro-martins"},
    {"nome": "Fernanda Costa Ribeiro", "tipoPessoa": "PF"},
    {"nome": "Alfa Serviços Ltda.", "tipoPessoa": "PJ", "numeroNexus": "7305", "linkPasta": "https://example.com/onedrive/alfa-servicos"},
    {"nome": "Instituto Nova Gestão", "tipoPessoa": "PJ"},
    {"nome": "Comercial Rondônia Ltda.", "tipoPessoa": "PJ"},
]

_ACESSO_OK = {"formaAcesso": "SEI GERAL", "conta": "SEI GERAL (e-mail do escritório)", "acessoSeiGeral": "SIM",
              "dataPedidoAcesso": d(2026, 6, 25), "terminoAcesso": d(2027, 6, 25), "renovar": "NÃO", "situacaoAcesso": "ATIVO"}

PROCESSOS_EXEMPLO = [
    {"cliente": "Ana Beatriz Souza", "numero": "0038.001245/2026-31", "sistema": "SEI/RO", "tipo": "Recurso Administrativo", "natureza": "Recursal",
     "objeto": "Reconsideração e reexame com pedido de efeito suspensivo", "orgao": "SEFIN/RO", "status": "Em análise",
     "situacaoAtual": "O processo está em análise na SEFIN/RO. O recurso foi protocolado (0038.001301/2026-14) e a comunicação sobre o andamento foi encaminhada (0038.001377/2026-90). Aguardamos a manifestação do órgão para as próximas providências.",
     "ultimaMovData": d(2026, 3, 10, 14, 32), "ultimaMovDescricao": "Processo recebido na unidade SEFIN/RO para análise.",
     "url": "https://example.com/sei/0038.001245-2026-31", "codigoCasoNexus": "4821-26.7392", **_ACESSO_OK},
    {"cliente": "Ana Beatriz Souza", "numero": "0038.001301/2026-14", "sistema": "SEI/RO", "origem": "0038.001245/2026-31", "vinculo": "Derivado",
     "tipo": "Recurso Administrativo", "natureza": "Recursal", "orgao": "SEFIN/RO", "status": "Em andamento",
     "situacaoAtual": "Recurso protocolado por peticionamento intercorrente.", "ultimaMovData": d(2026, 2, 20, 9, 15),
     "ultimaMovDescricao": "Peticionamento intercorrente registrado.", **_ACESSO_OK},
    {"cliente": "Ana Beatriz Souza", "numero": "0038.001377/2026-90", "sistema": "SEI/RO", "origem": "0038.001245/2026-31", "vinculo": "Derivado",
     "tipo": "Comunicação externa", "natureza": "Comunicação", "orgao": "SEFIN/RO", "status": "Concluído",
     "ultimaMovData": d(2026, 3, 2, 16, 40), "ultimaMovDescricao": "Comunicação enviada à unidade.", **_ACESSO_OK},
    {"cliente": "Ana Beatriz Souza", "numero": "0041.000318/2026-09", "sistema": "SEI/RO", "tipo": "Processo Administrativo Disciplinar (PAD)",
     "natureza": "Disciplinar", "objeto": "Apuração de infração disciplinar (arts. 116 e 117 da Lei 8.112/1990)", "orgao": "SEDUC", "status": "Aguardando prazo",
     "situacaoAtual": "Defesa apresentada. Aguardando o prazo para manifestação da comissão.", "ultimaMovData": d(2026, 4, 18, 11, 5),
     "ultimaMovDescricao": "Juntada da defesa escrita.", "url": "https://example.com/sei/0041.000318-2026-09",
     "formaAcesso": "Login SEI", "conta": "Login do advogado", "acessoSeiGeral": "NÃO", "dataPedidoAcesso": d(2026, 4, 1),
     "terminoAcesso": d(2026, 9, 15), "renovar": "SIM", "situacaoAcesso": "ATIVO"},
    {"cliente": "Ana Beatriz Souza", "numero": "0041.000402/2026-77", "sistema": "SEI/RO", "origem": "0041.000318/2026-09", "vinculo": "Derivado",
     "tipo": "Recurso Administrativo", "natureza": "Recursal", "orgao": "SEDUC", "status": "Em andamento", "situacaoAtual": "Minuta do recurso em elaboração."},
    {"cliente": "Ana Beatriz Souza", "numero": "0041.000455/2026-12", "sistema": "SEI/RO", "origem": "0041.000318/2026-09", "vinculo": "Derivado",
     "tipo": "Comunicação externa", "natureza": "Comunicação", "orgao": "SEDUC", "status": "Concluído"},
    {"cliente": "Ana Beatriz Souza", "numero": "0041.000103/2026-55", "sistema": "SEI/RO", "origem": "0041.000318/2026-09", "vinculo": "Relacionado",
     "tipo": "Comunicação interna", "natureza": "Comunicação", "orgao": "SEDUC", "status": "Arquivado"},
    {"cliente": "Carlos Eduardo Lima", "numero": "0012.004567/2025-77", "sistema": "SEI/RO", "tipo": "Requerimento", "natureza": "Requerimento",
     "objeto": "Progressão funcional", "orgao": "SESAU", "status": "Concluído", "situacaoAtual": "Progressão deferida e publicada.",
     "ultimaMovData": d(2025, 12, 5, 10, 0), "ultimaMovDescricao": "Publicação do ato de progressão.", "url": "https://example.com/sei/0012.004567-2025-77",
     "formaAcesso": "E-mail atendimento", "conta": "E-mail atendimento", "acessoSeiGeral": "NÃO", "terminoAcesso": d(2026, 1, 31), "renovar": "NÃO", "situacaoAcesso": "EXPIRADO"},
    {"cliente": "Mariana Alves Rocha", "numero": "0033.000742/2026-18", "sistema": "SEI/RO", "tipo": "Requerimento", "natureza": "Requerimento",
     "objeto": "Revisão de aposentadoria", "orgao": "SEGEP", "status": "Em análise", "situacaoAtual": "Requerimento protocolado; aguardando análise da SEGEP.",
     "formaAcesso": "Verificar", "situacaoAcesso": "SEM INFO"},
    {"cliente": "João Pedro Martins", "numero": "0038.002210/2026-40", "sistema": "SEI/RO", "tipo": "Requerimento", "natureza": "Tributária",
     "objeto": "Restituição de tributo pago a maior", "orgao": "SEFIN/RO", "status": "Aguardando documentos",
     "situacaoAtual": "Órgão solicitou comprovantes de pagamento; cliente avisado em 02/09/2026.", "ultimaMovData": d(2026, 9, 2),
     "ultimaMovDescricao": "Despacho solicitando documentos complementares.", **_ACESSO_OK},
    {"cliente": "Alfa Serviços Ltda.", "numero": "0029.000981/2026-14", "sistema": "SEI/RO", "tipo": "Recurso Administrativo", "natureza": "Recursal",
     "objeto": "Recurso contra inabilitação em pregão", "orgao": "SUPEL", "status": "Em análise",
     "situacaoAtual": "Recurso contra a inabilitação apresentado dentro do prazo. Contrarrazões da concorrente já juntadas.",
     "ultimaMovData": d(2026, 8, 27, 15, 20), "ultimaMovDescricao": "Recurso encaminhado ao pregoeiro.", "url": "https://example.com/sei/0029.000981-2026-14",
     "codigoCasoNexus": "7305-26.1180", **_ACESSO_OK},
    {"cliente": "Alfa Serviços Ltda.", "numero": "0029.001004/2026-63", "sistema": "SEI/RO", "origem": "0029.000981/2026-14", "vinculo": "Relacionado",
     "tipo": "Manifestação", "natureza": "Recursal", "objeto": "Contrarrazões da concorrente", "orgao": "SUPEL", "status": "Concluído"},
    {"cliente": "Instituto Nova Gestão", "numero": "0005.003301/2026-02", "sistema": "SEI/RO", "tipo": "Tomada de Contas", "natureza": "Controle externo",
     "objeto": "Prestação de contas de convênio", "orgao": "SEGEP", "status": "Em análise", "situacaoAtual": "Documentação complementar entregue em 20/08/2026.",
     "ultimaMovData": d(2026, 8, 20), "ultimaMovDescricao": "Juntada de documentos.", "formaAcesso": "Físico", "situacaoAcesso": "FÍSICO"},
    {"cliente": "Comercial Rondônia Ltda.", "numero": "1234567-89.2026.4.01.4100", "sistema": "PJe (TRF1)", "tipo": "Judicial", "natureza": "Judicial",
     "objeto": "Mandado de segurança", "orgao": "TRF1", "status": "Em andamento", "situacaoAtual": "Liminar indeferida; agravo em preparação.",
     "ultimaMovData": d(2026, 9, 8, 17, 45), "ultimaMovDescricao": "Decisão que indeferiu a liminar.", "formaAcesso": "PJe", "conta": "Login do advogado",
     "situacaoAcesso": "ATIVO"},
]


# ──────────────────────────────────────────────────────────────────────────────
# Migração da planilha antiga (Planilha1)
# ──────────────────────────────────────────────────────────────────────────────
NUM_SEI = re.compile(r"\d{4,5}\.\d{6}/\d{4}-\d{2}")
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

MAPA_TIPO = {  # normalizado → (valor do menu, exato?)  exato=False guarda o texto original na pendência
    "processo administrativo preliminar": ("Processo Administrativo Preliminar", True),
    "preliminar": ("Processo Administrativo Preliminar", True),
    "investigacao preliminar": ("Processo Administrativo Preliminar", False),
    "corregedoria: investigacao preliminar": ("Processo Administrativo Preliminar", False),
    "processo de apuracao preliminar": ("Processo Administrativo Preliminar", False),
    "preliminar tac": ("Processo Administrativo Preliminar", False),
    "requerimento (certidao)": ("Requerimento de certidão", True),
    "requerimento": ("Requerimento", True),
    "comunicacao: interna": ("Comunicação interna", True),
    "comunicacao: externa": ("Comunicação externa", True),
    "pad": ("Processo Administrativo Disciplinar (PAD)", True),
    "processo administrativo disciplinar pad": ("Processo Administrativo Disciplinar (PAD)", True),
    "processo administrativo disciplinar (pad)": ("Processo Administrativo Disciplinar (PAD)", True),
    "processo administrativo disciplinar": ("Processo Administrativo Disciplinar (PAD)", True),
    "corregedoria: processo administrativo disciplinar": ("Processo Administrativo Disciplinar (PAD)", True),
    "processo administrativo": ("Processo Administrativo", True),
    "corregedoria: processo administrativo": ("Processo Administrativo", True),
    "recurso": ("Recurso Administrativo", True),
    "gestao da informacao: peticao eletronica": ("Petição eletrônica", True),
    "ouvidoria: denuncia contra a atuacao do orgao": ("Denúncia (Ouvidoria)", True),
    "decisao da denuncia da ouvidoria ro": ("Denúncia (Ouvidoria)", False),
    "fiscalizacao: auto de infracao": ("Auto de Infração", True),
    "auto de infracao": ("Auto de Infração", True),
    "gestao de contrato: processo de pagamento": ("Processo de Pagamento (contrato)", True),
    "manifestacao": ("Manifestação", True),
    "gestao e controle: tomadas de contas": ("Tomada de Contas", True),
    "tomada de contas especial 046 2025": ("Tomada de Contas Especial", False),
    "corregedoria: sindicancia administrativa investigativa": ("Sindicância", True),
    "gestao de contrato: acompanhamento da execucao": ("Acompanhamento de Execução Contratual", True),
    "gestao de contrato: aplicacao de sancao contratual": ("Sanção Contratual", True),
    "corregedoria: processo administrativo sancionador pas": ("Processo Administrativo Sancionador (PAS)", True),
    "convenios ajustes: acompanhamento da execucao": ("Convênio / Ajuste", True),
}
NATUREZA_POR_TIPO = {
    "Processo Administrativo Disciplinar (PAD)": "Disciplinar", "Processo Administrativo Preliminar": "Disciplinar", "Sindicância": "Disciplinar",
    "Processo Administrativo Sancionador (PAS)": "Sancionatória", "Recurso Administrativo": "Recursal", "Requerimento": "Requerimento",
    "Requerimento de certidão": "Requerimento", "Petição eletrônica": "Requerimento", "Comunicação interna": "Comunicação",
    "Comunicação externa": "Comunicação", "Denúncia (Ouvidoria)": "Ouvidoria", "Auto de Infração": "Fiscalizatória",
    "Tomada de Contas": "Controle externo", "Tomada de Contas Especial": "Controle externo", "Processo de Pagamento (contrato)": "Contratual",
    "Acompanhamento de Execução Contratual": "Contratual", "Sanção Contratual": "Contratual", "Convênio / Ajuste": "Contratual", "Judicial": "Judicial",
}
MAPA_FORMA = {
    "e mail: atendimento": ("E-mail atendimento", True), "login sei (ver login senha)": ("Login SEI", True), "sei geral": ("SEI GERAL", True),
    "pje 1° grau tjro": ("PJe", True), "fisico": ("Físico", True), "sei incra": ("Login SEI", False), "sei ibama": ("Login SEI", False),
    "crm ro": ("Outro", False), "obs: verificar se tem acesso no sei": ("Verificar", False),
    "obs: verificar se tem acesso no sei sem acesso no email sei": ("Verificar", False),
}
MAPA_STATUS = {"processo ativo": "Em andamento", "processo arquivado": "Arquivado", "arquivado": "Arquivado"}


def sistema_de(numero, url, orgao):
    u = (url or "").lower()
    if "safelinks" in u:
        m = re.search(r"url=([^&]+)", u)
        u = re.sub(r"%3a", ":", re.sub(r"%2f", "/", m.group(1))) if m else u
    if "sei.sistemas.ro.gov.br" in u:
        return "SEI/RO"
    if re.search(r"sei\.[a-z0-9.-]*(jus|gov)\.br", u) or "sei.fiocruz" in u:
        return "SEI (órgão federal)"
    if re.fullmatch(r"\d{7}-\d{2}\.\d{4}\.8\.22\.\d{4}", numero):
        return "PJe (TJRO)"
    if re.fullmatch(r"\d{7}-\d{2}\.\d{4}\.4\.01\.\d{4}", numero):
        return "PJe (TRF1)"
    if re.fullmatch(r"\d{4}\.\d{6}/\d{4}-\d{2}", numero):
        return "SEI/RO"
    if (orgao or "").upper() == "TCU":
        return "TCU"
    return ""


def migrar(origem, destino):
    wb = load_workbook(origem, data_only=True)
    ws = wb["Planilha1"]
    S = lambda v: "" if v is None else (str(v).strip() if not isinstance(v, (datetime, date)) else v)
    brutas = [r for r in ws.iter_rows(min_row=2, max_col=21, values_only=True) if S(r[3])]
    C = lambda r, L: S(r["ABCDEFGHIJKLMNOPQRSTU".index(L)])

    # ── clientes ──
    clientes, por_chave = [], {}
    numeros_nexus = defaultdict(set)
    for r in brutas:
        nome = C(r, "B")
        if not nome:
            continue
        k = normalizar(nome)
        if k not in por_chave:
            por_chave[k] = {"nome": nome, "tipoPessoa": C(r, "S").upper() or ""}
            clientes.append(por_chave[k])
        nup = C(r, "C")
        if re.fullmatch(r"\d{4}", nup):
            numeros_nexus[k].add(nup)
        elif re.fullmatch(r"\d{4}-\d{2}\.\d{4}(/\d+)?", nup):
            numeros_nexus[k].add(nup[:4])
    dono_do_numero = defaultdict(set)
    for k, ns in numeros_nexus.items():
        for n in ns:
            dono_do_numero[n].add(k)
    for k, c in por_chave.items():
        ns = sorted(numeros_nexus.get(k, ()))
        obs = []
        if len(ns) == 1:
            c["numeroNexus"] = ns[0]
        elif len(ns) > 1:
            obs.append(f"Mais de um nº de cliente na planilha antiga: {', '.join(ns)} — confirmar qual é o do Nexus")
        for n in ns:
            if len(dono_do_numero[n]) > 1:
                outros = [por_chave[o]["nome"] for o in dono_do_numero[n] if o != k]
                obs.append(f"Nº {n} também aparece em: {', '.join(outros)}")
        if not c["tipoPessoa"]:
            obs.append("PF/PJ não informado na planilha antiga")
        if obs:
            c["observacao"] = " | ".join(obs)

    # ── processos ──
    numeros = defaultdict(list)
    for i, r in enumerate(brutas):
        numeros[C(r, "D")].append(i)
    gerou_por = {}  # nº gerado → nº de quem declarou "GEROU"
    for r in brutas:
        f = C(r, "F")
        for g in NUM_SEI.findall(" ".join(re.split(r"GEROU:", f, flags=re.I)[1:])):
            gerou_por.setdefault(g, C(r, "D"))
    cliente_do_numero = {C(r, "D"): normalizar(C(r, "B")) for r in brutas}
    contas = []
    processos = []
    for i, r in enumerate(brutas):
        pend = []
        numero, cliente = C(r, "D"), C(r, "B")
        if len(numeros[numero]) > 1:
            pend.append(f"Nº repetido na planilha antiga (linhas {', '.join(str(j + 2) for j in numeros[numero])}) — conferir se é o mesmo processo")
        if not cliente:
            pend.append("Cliente vazio na planilha antiga")
        principal = C(r, "E").upper()
        f = C(r, "F")
        partes = re.split(r"GEROU:", f, flags=re.I)
        veio = NUM_SEI.findall(partes[0])
        origem_num = ""
        if principal == "NÃO":
            if veio:
                origem_num = veio[0]
            elif numero in gerou_por:
                origem_num = gerou_por[numero]
                pend.append(f"Origem {origem_num} inferida do 'GEROU' da planilha antiga — confirmar")
            else:
                pend.append("PRINCIPAL? = NÃO sem processo de origem informado")
            if origem_num and origem_num not in cliente_do_numero:
                pend.append(f"Origem {origem_num} não existe na planilha")
            elif origem_num and cliente_do_numero[origem_num] != normalizar(cliente):
                pend.append(f"Origem {origem_num} pertence a outro cliente ({por_chave[cliente_do_numero[origem_num]]['nome']})")
        elif veio and not re.search(r"principal", partes[0], re.I):
            pend.append(f"PRINCIPAL? = SIM, mas o vínculo antigo dizia: '{partes[0].strip()}'")
        tipo_orig = C(r, "G")
        tipo, exato = MAPA_TIPO.get(normalizar(tipo_orig), ("", True))
        if tipo_orig and not tipo:
            tipo, exato = "Outro", False
        if tipo_orig and not exato:
            pend.append(f"Tipo original: '{tipo_orig}'")
        forma_orig = C(r, "J")
        forma, exato_f = MAPA_FORMA.get(normalizar(forma_orig), ("", True))
        if forma_orig and not forma:
            forma, exato_f = "Outro", False
        if forma_orig and not exato_f:
            pend.append(f"Forma de acesso original: '{forma_orig}'")
        conta = ""
        m = EMAIL.search(C(r, "K"))
        if m:
            conta = m.group(0).lower()
            if conta not in contas:
                contas.append(conta)
        elif C(r, "K"):
            pend.append(f"Conta de acesso não reconhecida: '{C(r, 'K')[:40]}'")
        nup = C(r, "C")
        codigo = nup if re.fullmatch(r"\d{4}-\d{2}\.\d{4}(/\d+)?", nup) else ""
        if nup and not codigo and not re.fullmatch(r"\d{4}", nup):
            pend.append(f"NUP/contrato não reconhecido: '{nup}'")
        status_orig = C(r, "A")
        status = MAPA_STATUS.get(normalizar(status_orig), "")
        if status_orig and not status:
            pend.append(f"Status original: '{status_orig}'")
        sistema = sistema_de(numero, C(r, "U"), C(r, "I"))
        if not sistema:
            pend.append("Sistema não identificado — informar")
        orgao = C(r, "I")
        if orgao and orgao not in {o[0] for o in LISTAS["orgao"]}:
            pend.append(f"Órgão fora da lista: '{orgao}' — incluir na aba Listas ou corrigir")
        processos.append({
            "cliente": cliente, "numero": numero, "sistema": sistema, "origem": origem_num,
            "vinculo": "Derivado" if origem_num else "", "tipo": tipo, "natureza": NATUREZA_POR_TIPO.get(tipo, ""),
            "objeto": C(r, "H"), "orgao": orgao, "status": status, "url": C(r, "U"), "codigoCasoNexus": codigo,
            "formaAcesso": forma, "conta": conta, "acessoSeiGeral": C(r, "O").upper(),
            "dataPedidoAcesso": C(r, "M") or None, "terminoAcesso": C(r, "N") or None,
            "renovar": C(r, "R").upper(), "situacaoAcesso": C(r, "T").upper(), "observacao": C(r, "P"),
            "pendencia": " | ".join(pend),
        })
    montar(clientes, processos, destino, migrado=True, contas=contas or None)
    total_pend = sum(1 for p in processos if p["pendencia"])
    print(f"  pendências: {total_pend} processos com algo a revisar (coluna PENDÊNCIA); {sum(1 for c in clientes if c.get('observacao'))} clientes com observação")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "modelo":
        montar(CLIENTES_EXEMPLO[:1], PROCESSOS_EXEMPLO[:1], AQUI / "Modelo_Controle_de_Processos_v2.xlsx")
    elif cmd == "exemplo":
        montar(CLIENTES_EXEMPLO, PROCESSOS_EXEMPLO, AQUI / "exemplo" / "Controle_de_Processos_EXEMPLO.xlsx")
    elif cmd == "migrar" and len(sys.argv) == 4:
        migrar(sys.argv[2], sys.argv[3])
    else:
        print(__doc__)
        sys.exit(1)
