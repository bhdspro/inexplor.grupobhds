// Importação das bibliotecas necessárias
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const puppeteer = require('puppeteer');

const app = express();
// O Render define a porta automaticamente através do process.env.PORT
const PORT = process.env.PORT || 3000;

// Configuração para permitir que o Frontend acesse o Backend
app.use(cors());
app.use(express.json());

// Rota principal de extração
app.post('/api/extrair', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ erro: 'Nenhuma URL fornecida.' });
    }

    try {
        let ucodeExtraido = null;

        // LÓGICA 1: URL começando com https://hotmart.com/
        if (url.startsWith('https://hotmart.com/')) {
            console.log('Analisando URL do tipo Marketplace (Axios)...');
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
                }
            });
            const html = response.data;

            const regex = /"ucode":"([a-f0-9\-]{36})"/gi;
            let matches = [];
            let match;
            
            while ((match = regex.exec(html)) !== null) {
                matches.push(match[1]); 
            }

            if (matches.length >= 3) {
                ucodeExtraido = matches[2];
            } else if (matches.length > 0) {
                ucodeExtraido = matches[matches.length - 1];
            }

        } 
        // LÓGICA 2: URL começando com https://pay.hotmart.com/
        else if (url.startsWith('https://pay.hotmart.com/')) {
            console.log('Analisando URL de Checkout via Puppeteer...');
            
            // Configurações focadas em economizar memória (essencial para o Render)
            const browser = await puppeteer.launch({ 
                headless: true,
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Impede falhas de memória compartilhada
                    '--disable-gpu',
                    '--no-zygote',
                    '--single-process'
                ] 
            });
            
            const page = await browser.newPage();
            
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            
            const html = await page.content();
            await browser.close();

            const regexPay = /(?:"EMAIL_CONFIRMATION"|"NAME"|"PHONE"|"DOCUMENT"|"EMAIL").*?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
            const match = regexPay.exec(html);

            if (match && match[1]) {
                ucodeExtraido = match[1];
            }
        } 
        else {
            return res.status(400).json({ erro: 'A URL informada não é suportada.' });
        }

        if (ucodeExtraido) {
            const urlFinal = `https://app.hotmart.com/products/view/${ucodeExtraido}`;
            console.log('Produto extraído com sucesso:', urlFinal);
            return res.json({ 
                sucesso: true, 
                ucode: ucodeExtraido,
                urlFinal: urlFinal 
            });
        } else {
            return res.status(404).json({ erro: 'Não foi possível localizar o código do produto oculto nesta página.' });
        }

    } catch (error) {
        console.error('Erro durante a extração:', error.message);
        return res.status(500).json({ erro: 'Ocorreu um erro interno ao processar a página.', detalhes: error.message });
    }
});

// Inicializando o servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor de Extração rodando na porta ${PORT}`);
});