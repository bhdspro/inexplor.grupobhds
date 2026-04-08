// Importação das bibliotecas necessárias
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
// O Render define a porta automaticamente através do process.env.PORT
const PORT = process.env.PORT || 3000;

// Configuração para permitir que o Frontend acesse o Backend
app.use(cors());
app.use(express.json());

// Rota de Health Check (Essencial para o Render saber que o servidor está online e não ficar travado)
app.get('/', (req, res) => {
    res.status(200).send('Servidor de Extração Ativo e Rodando!');
});

// Rota principal de extração
app.post('/api/extrair', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ erro: 'Nenhuma URL fornecida.' });
    }

    try {
        let ucodeExtraido = null;

        // Configuração padrão do Axios para simular um navegador real e evitar bloqueios
        const axiosConfig = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        };

        // LÓGICA 1: URL começando com https://hotmart.com/
        if (url.startsWith('https://hotmart.com/')) {
            console.log('Analisando URL do tipo Marketplace (Axios)...');
            
            const response = await axios.get(url, axiosConfig);
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
            console.log('Analisando URL de Checkout via Axios (Regra de Proximidade Estrita)...');
            
            const response = await axios.get(url, axiosConfig);
            let html = response.data;

            // 1. Limpeza profunda: Remove escapes HTML, aspas, espaços e colchetes.
            // O código "sujo" se transforma exatamente nisto: EMAIL_CONFIRMATION,PHONE,EMAIL,NAME,id-do-produto
            let htmlLimpo = html.replace(/&quot;/g, '').replace(/["'\\\s\[\]\{\}]/g, '');

            // 2. REGRA DE PROXIMIDADE ESTRITA: 
            // - Exige a palavra "EMAIL_CONFIRMATION"
            // - Exige que seja seguida por uma sequência de palavras em maiúsculo (PHONE, EMAIL, DOCUMENT, etc) separadas por vírgula
            // - Exige que o UUID venha LOGO APÓS essas palavras.
            // Essa regra bloqueia completamente pulos para outras partes do código.
            const regexPayEstrita = /EMAIL_CONFIRMATION(?:,[A-Z_]+){1,10},([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
            
            const match = regexPayEstrita.exec(htmlLimpo);

            if (match && match[1]) {
                ucodeExtraido = match[1];
                console.log('ID encontrado com sucesso e com precisão absoluta.');
            }
        } 
        else {
            return res.status(400).json({ erro: 'A URL informada não é suportada.' });
        }

        // Validação e retorno do link montado
        if (ucodeExtraido) {
            const urlFinal = `https://app.hotmart.com/products/view/${ucodeExtraido}`;
            console.log('Produto extraído com sucesso:', urlFinal);
            return res.json({ 
                sucesso: true, 
                ucode: ucodeExtraido,
                urlFinal: urlFinal 
            });
        } else {
            return res.status(404).json({ erro: 'Não foi possível localizar o código do produto oculto nesta página com as regras fornecidas.' });
        }

    } catch (error) {
        console.error('Erro durante a extração:', error.message);
        return res.status(500).json({ erro: 'Ocorreu um erro interno ao processar a página.', detalhes: error.message });
    }
});

// Inicializando o servidor com '0.0.0.0' para evitar bloqueios de porta no Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Extração rodando na porta ${PORT}`);
});