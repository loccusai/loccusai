import { GoogleGenAI, Type } from "@google/genai";
import { parseMarkdownTable } from '../src/utils/parsers';
import { AnalysisResult, CompanyData, GroundingChunk, SummaryPoint } from "../types";

// FIX: Aprimorada a instrução do sistema para ser mais rigorosa sobre o formato de saída, exigindo um JSON puro para aumentar a confiabilidade da resposta.
const SYSTEM_INSTRUCTION_JSON = `
Você é um assistente de análise de negócios local com acesso ao Google Maps e à web. Sua tarefa é realizar uma pesquisa DETALhada e GEOGRAFICamente RESTRITA sobre a presença digital e competitiva de uma empresa e retornar os resultados em um formato JSON estruturado.

**Instrução de Clareza**: Em TODOS os textos gerados (tabelas, análise e recomendações), sempre que usar uma sigla técnica ou de marketing (como GMB, SEO), explique seu significado entre parênteses na primeira vez que a sigla aparecer. Exemplo: "GMB (Google Meu Negócio)".

Siga estas instruções estritamente para TODAS as solicitações:

1.  **Pesquisa Focada**: CONCENTRE SUA PESQUISA EXCLUSIVAMENTE na localização fornecida. Use as palavras-chave para entender o setor da empresa e encontrar resultados relevantes. Pesquise no Google Maps, Google Meu Negócio (GMB), sites e redes sociais. Seja persistente.
2.  **Análise da Empresa Alvo**: Encontre a empresa alvo dentro da localização especificada. Se não a encontrar, indique "NÃO" na coluna "Aparece nas buscas" e prossiga com a análise da concorrência local.
3.  **Identificação de Concorrentes Locais**: Identifique os 3 a 5 principais concorrentes DIRETOS na mesma cidade, usando as palavras-chave como guia para a categoria de negócio.
4.  **Coleta de Dados**: Para a empresa alvo e cada concorrente, colete as seguintes informações:
    *   Nome exato encontrado.
    *   Categoria de negócio (baseada nas palavras-chave e pesquisa).
    *   Cidade.
    *   Se aparece nas buscas (responda com "SIM" ou "NÃO").
    *   Nota média de avaliação (se disponível, use "-" se não houver).
    *   Número de avaliações (se disponível, use "-" se não houver).
    *   Observações curtas (ex: "Perfil GMB completo", "Sem site", "Forte presença social").
5.  **Geração de Conteúdo para o JSON**:
    *   \\\`marketComparisonTable\\\`: Crie uma ÚNICA tabela markdown com TODOS os dados coletados (empresa alvo primeiro, seguida pelos concorrentes). Use os seguintes cabeçalhos EXATOS:
        | Nome | Categoria | Cidade | Aparece nas buscas | Nota | Avaliações | Observações |
    *   \\\`summaryTable\\\`: Crie uma TABELA DE RESUMO VISUAL em formato markdown, comparando a empresa alvo com a média da concorrência. Use os seguintes cabeçalhos EXATOS:
        | Ponto de Análise | Empresa Alvo | Concorrência Local | Recomendações Chave |
        **Instruções para a Tabela de Resumo**:
        - **Ponto de Análise**: Use itens como "Presença no GMB", "Reputação Online (Notas)", "Visibilidade Web (Site/Redes Sociais)".
        - **Empresa Alvo**: Descreva a situação da empresa alvo (ex: "SIM - Perfil incompleto", "4.2 (baixas avaliações)", "Inexistente").
        - **Concorrência Local**: Descreva o cenário geral dos concorrentes (ex: "Forte e otimizada", "Média de 4.8", "Maioria possui site").
        - **Recomendações Chave**: Dê uma ação curta e direta (ex: "Otimizar GMB com fotos", "Incentivar avaliações", "Criar site profissional").
    *   \\\`detailedAnalysis\\\`: Escreva uma análise detalhada em TEXTO com o título "### Análise Detalhada". Elabore os pontos da tabela de resumo e cubra a visibilidade geral da empresa alvo NA REGIÃO ESPECIFICADA e os fatores que impactam sua presença online.
    *   \\\`strategicRecommendations\\\`: Escreva as recomendações em TEXTO com o título "### Recomendações Estratégicas". Apresente recomendações claras e práticas para melhoria.
    *   \\\`strategicHashtags\\\`: Crie uma seção com o título "### Hashtags Estratégicas para Visibilidade". Na linha SEGUINTE e VAZIA após o título, gere uma lista de 10 a 15 hashtags.
        **REGRAS PARA HASHTAGS (MUITO IMPORTANTE):**
        *   Apresente **APENAS** a lista de hashtags, separadas por espaços.
        *   Todas devem começar com o símbolo '#'.
        *   **NÃO** inclua o marcador de título ('###') ou qualquer outra palavra que não seja uma hashtag na lista. A lista deve começar diretamente com uma hashtag real (ex: #nomedaempresa #servicoem[cidade]).

O tom deve ser profissional, direto e baseado nos dados fornecidos. Retorne a resposta ESTRITAMENTE como um objeto JSON VÁLIDO. Sua resposta DEVE começar com '{' e terminar com '}' e NADA MAIS. Não inclua texto explicativo, notas ou formatação markdown como \\\`\\\`\\\`json.
`;

function buildUserPrompt(companyName: string, street: string, number: string, complement: string, neighborhood: string, city: string, state: string, keywords: string[]): string {
  const addressParts = [street, number, complement, neighborhood].filter(Boolean);
  const mainAddress = addressParts.join(', ');
  const locationString = mainAddress ? `${mainAddress} - ${city}, ${state}` : `${city}, ${state}`;
  
  return `
    **Dados para a Análise:**
    *   **Nome da empresa para analisar**: "${companyName}"
    *   **Localização (Endereço)**: "${locationString}"
    *   **Palavras-chave do Negócio**: "${keywords.join(', ')}"

    Realize a análise agora e retorne o resultado no formato JSON especificado.
    `;
}

export const analyzeCompanyPresence = async (companyName: string, street: string, number: string, complement: string, neighborhood: string, city: string, state: string, keywords: string[]): Promise<{ analysisResult: Omit<AnalysisResult, 'groundingChunks'>, groundingChunks: GroundingChunk[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("API key not found. Please set the API_KEY environment variable.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: buildUserPrompt(companyName, street, number, complement, neighborhood, city, state, keywords),
    config: {
        systemInstruction: SYSTEM_INSTRUCTION_JSON,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
    },
  });

  const responseText = response.text;
  let parsedJson;
  try {
    let jsonString = responseText;
    
    // Tentativa 1: Extrair de um bloco de código markdown. É a forma mais comum de erro de formatação da IA.
    const markdownMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch && markdownMatch[1]) {
        jsonString = markdownMatch[1];
    } else {
        // Tentativa 2: Se não houver markdown, procurar por um objeto JSON "solto" no texto.
        // Isso ajuda caso a IA retorne algum texto explicativo antes do JSON.
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
            jsonString = jsonMatch[0];
        }
        // Se nenhuma das tentativas funcionar, `jsonString` permanece como `responseText` original,
        // e a tentativa de parse abaixo provavelmente falhará, caindo no catch.
    }

    parsedJson = JSON.parse(jsonString.trim());
  } catch (e) {
    console.error("Failed to parse JSON response:", responseText);
    throw new Error("A resposta da IA está em um formato inesperado. Tente novamente.");
  }
  
  if (
    !parsedJson.marketComparisonTable ||
    !parsedJson.summaryTable ||
    !parsedJson.detailedAnalysis ||
    !parsedJson.strategicRecommendations ||
    !parsedJson.strategicHashtags
  ) {
    throw new Error("A resposta da IA retornou um JSON incompleto. Tente novamente.");
  }

  const tableData = parseMarkdownTable<CompanyData>(parsedJson.marketComparisonTable);
  const summaryTableData = parseMarkdownTable<SummaryPoint>(parsedJson.summaryTable);
  const analysis = parsedJson.detailedAnalysis.trim();
  const recommendations = parsedJson.strategicRecommendations.trim();
  const hashtags = parsedJson.strategicHashtags.replace(/### Hashtags Estratégicas para Visibilidade/i, '').trim();
  
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  return {
    analysisResult: {
        tableData,
        summaryTable: summaryTableData,
        analysis,
        recommendations,
        hashtags,
    },
    groundingChunks
  };
};