// Importação das bibliotecas necessárias
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
// O Render define a porta automaticamente através do process.env.PORT
const PORT = process.env.PORT || 3000;

// Configuração para permitir que o Frontend aceda ao Backend
app.use(cors());
app.use(express.json());

// Rota de Health Check (Essencial para o Render saber que o servidor está online e não ficar bloqueado)
app.get('/', (req, res) => {
    res.status(200).send('Servidor de Extração Ativo e a Rodar!');
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
                'Accept-Language': 'pt-PT,pt;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        };

        // LÓGICA 1: URL a começar com https://hotmart.com/
        if (url.startsWith('https://hotmart.com/')) {
            console.log('A analisar URL do tipo Marketplace (Axios)...');
            
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
        // LÓGICA 2: URL a começar com https://pay.hotmart.com/
        else if (url.startsWith('https://pay.hotmart.com/')) {
            console.log('A analisar URL de Checkout via Axios (Busca Inteligente no NUXT_DATA)...');
            
            const response = await axios.get(url, axiosConfig);
            const html = response.data;

            // REGRA 1: Análise estrutural avançada do __NUXT_DATA__
            // Extrai o bloco de dados JSON que o site utiliza para processar as informações.
            const nuxtDataMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
            
            if (nuxtDataMatch && nuxtDataMatch[1]) {
                try {
                    // Descodifica o JSON bruto num array JavaScript
                    const nuxtData = JSON.parse(nuxtDataMatch[1]);
                    
                    if (Array.isArray(nuxtData)) {
                        // Percorre os itens para encontrar o objeto que detém o 'ucode'
                        for (let item of nuxtData) {
                            if (item && typeof item === 'object' && 'ucode' in item) {
                                const ucodeVal = item.ucode;
                                let possibleUcode = null;
                                
                                // O Nuxt armazena o valor apontando para um índice no array
                                if (typeof ucodeVal === 'number' && nuxtData[ucodeVal]) {
                                    possibleUcode = nuxtData[ucodeVal];
                                } 
                                // Se por acaso estiver escrito diretamente como string
                                else if (typeof ucodeVal === 'string') {
                                    possibleUcode = ucodeVal;
                                }

                                // Valida se é de facto um ID de produto (UUID)
                                if (possibleUcode && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(possibleUcode)) {
                                    ucodeExtraido = possibleUcode;
                                    console.log('ID encontrado com sucesso de forma nativa no __NUXT_DATA__!');
                                    break;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('Aviso: Falha ao descodificar o __NUXT_DATA__:', e.message);
                }
            }

            // REGRA 2 (Fallback): Caso a estrutura mude, tenta a busca literal pedida anteriormente
            if (!ucodeExtraido) {
                console.log('A tentar fallback literal exato...');
                const regexPay1 = /"EMAIL_CONFIRMATION","PHONE","EMAIL","NAME","([a-f0-9\-]{36})"/i;
                const regexPay2 = /"EMAIL_CONFIRMATION","PHONE","DOCUMENT","EMAIL","NAME","([a-f0-9\-]{36})"/i;
                
                let match = regexPay1.exec(html) || regexPay2.exec(html);
                if (match && match[1]) {
                    ucodeExtraido = match[1];
                    console.log('ID encontrado com sucesso através do Fallback Literal.');
                }
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
            return res.status(404).json({ erro: 'Não foi possível localizar o código do produto oculto nesta página.' });
        }

    } catch (error) {
        console.error('Erro durante a extração:', error.message);
        return res.status(500).json({ erro: 'Ocorreu um erro interno ao processar a página.', detalhes: error.message });
    }
});

// A inicializar o servidor com '0.0.0.0' para evitar bloqueios de porta no Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor de Extração a rodar na porta ${PORT}`);
});