/** @type {import('tailwindcss').Config} */
// Identidade visual do escritório (arquivos de marca recebidos em 11/09/2026):
// wordmark em petróleo #173a4c, monograma e linha OAB em ouro-areia #d1cda9, fundos escuros #0a1d2a…#2f5d72.
// `fg` é a escala do petróleo (cor principal); `ouro` é o acento. A Legal Suite usa um navy/ouro um pouco
// diferentes (#08162e / #c5a059) — ouro-500 é justamente esse, para os dois sistemas conversarem.
export default {
    content: ['./index.html', './src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                fg: {
                    50: '#eef3f5',
                    100: '#d9e4e9',
                    200: '#b3c9d3',
                    300: '#7fa3b3',
                    400: '#4f7f94',
                    500: '#2f5d72',
                    600: '#23495b',
                    700: '#173a4c', // petróleo do wordmark
                    800: '#10293a',
                    900: '#0a1d2a', // fundo dos mockups
                },
                // Pastéis dos cartões (uma cor por informação), na família da marca. Contraste dos textos ≥ 4,5:1 sobre o fundo 100.
                salvia: { 100: '#e6efe6', 200: '#cadcca', 300: '#d3e3d3', 700: '#3f6b4f', 800: '#2f5140' },
                terracota: { 100: '#f5e8e3', 200: '#e8cfc6', 300: '#ecd6cd', 700: '#8a4b3c', 800: '#6f3b2f' },
                ardosia: { 100: '#e8ebf3', 200: '#cfd5e6', 300: '#d8ddeb', 700: '#3f4f7a', 800: '#334063' },
                areia: { 100: '#f3efdc', 200: '#e3dab2', 300: '#e6dfbf' },
                petroleo: { 100: '#e3ecf0', 200: '#c9dae2', 300: '#cfdee6' },
                ouro: {
                    100: '#f3f1e4',
                    200: '#e8e4cc',
                    300: '#d1cda9', // ouro-areia do monograma
                    400: '#c9bd8e',
                    500: '#c5a059', // ouro da Legal Suite
                    600: '#9e7f44',
                    700: '#7e6435',
                },
            },
            fontFamily: {
                // Inter = mesma fonte de texto da Legal Suite; Roboto Slab = a slab serif mais próxima do wordmark "Fabris & Gurjão".
                sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
                slab: ['"Roboto Slab"', 'Georgia', 'serif'],
            },
        },
    },
    plugins: [],
}
