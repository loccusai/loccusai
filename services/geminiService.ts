import { GoogleGenAI, Type } from "@google/genai";
import { parseMarkdownTable } from '../src/utils/parsers';
import { AnalysisResult, CompanyData, GroundingChunk, SummaryPoint } from "../types";

const SYSTEM_INSTRUCTION = `
Você é um assistente de análise de negócios local com acesso ao Google Maps e à web. Sua tarefa é realizar uma pesquisa DETALhada e GEOGRAFICamente RESTRITA sobre a presença digital e competitiva de uma empresa e retornar os resultados em seções bem definidas.

**Instrução de Clareza**: Em TODOS os textos gerados (tabelas, análise e recomendações), sempre que usar uma sigla técnica ou de marketing (como GMB, SEO), explique seu significado entre parênteses na primeira vez que a sigla aparecer. Exemplo: "GMB (Google Meu Negócio)".

Siga estas instruções estritamente para TODAS as solicitações:

1.  **Pesquisa Focada**: CONCENTRE SUA PESQUISA EXCLUSIVAMENTE na localização fornecida.
2.  **Formato de Saída**: Sua resposta DEVE conter as seguintes seções, EXATAMENTE com os marcadores de início e fim:

[START_MARKET_TABLE]
Crie uma ÚNICA tabela markdown com TODOS os dados coletados (empresa alvo primeiro, seguida pelos concorrentes). Use os seguintes cabeçalhos EXATOS:
| Nome | Categoria | Cidade | Aparece nas buscas | Nota | Avaliações | Observações |
[END_MARKET_TABLE]

[START_SUMMARY_TABLE]
Crie uma TABELA DE RESUMO VISUAL em formato markdown, comparando a empresa alvo com a média da concorrência. Use os seguintes cabeçalhos EXATOS:
| Ponto de Análise | Empresa Alvo | Concorrência Local | Recomendações Chave |
[END_SUMMARY_TABLE]

[START_ANALYSIS]
### Análise Detalhada
Escreva uma análise detalhada elaborando os pontos da tabela de resumo.
[END_ANALYSIS]

[START_RECOMMENDATIONS]
### Recomendações Estratégicas
Apresente recomendações claras e práticas para melhoria.
[END_RECOMMENDATIONS]

[START_HASHTAGS]
### Hashtags Estratégicas para Visibilidade
Gere uma lista de 10 a 15 hashtags separadas por espaços, começando na linha seguinte ao título. NÃO inclua o título na lista.
[END_HASHTAGS]

O tom deve ser profissional, direto e baseado nos dados fornecidos. NÃO retorne um objeto JSON. Retorne apenas o texto com as seções demarcadas.
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

    Realize a análise agora e retorne o resultado no formato de seções demarcadas, conforme especificado.
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
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }, { googleMaps: {} }],
    },
  });

  const responseText = response.text;
  
  const extractSection = (startTag: string, endTag: string): string => {
      const regex = new RegExp(`${startTag}([\\s\\S]*?)${endTag}`);
      const match = responseText.match(regex);
      return match ? match[1].trim() : '';
  };

  const marketComparisonTable = extractSection('\\[START_MARKET_TABLE\\]', '\\[END_MARKET_TABLE\\]');
  const summaryTableStr = extractSection('\\[START_SUMMARY_TABLE\\]', '\\[END_SUMMARY_TABLE\\]');
  const analysis = extractSection('\\[START_ANALYSIS\\]', '\\[END_ANALYSIS\\]');
  const recommendations = extractSection('\\[START_RECOMMENDATIONS\\]', '\\[END_RECOMMENDATIONS\\]');
  const hashtags = extractSection('\\[START_HASHTAGS\\]', '\\[END_HASHTAGS\\]').replace(/### Hashtags Estratégicas para Visibilidade/i, '').trim();

  if (!marketComparisonTable || !summaryTableStr || !analysis || !recommendations) {
      console.error("Resposta da IA incompleta ou mal formatada:", responseText);
      throw new Error("A resposta da IA não contém todas as seções necessárias. Tente novamente.");
  }
  
  const tableData = parseMarkdownTable<CompanyData>(marketComparisonTable);
  const summaryTableData = parseMarkdownTable<SummaryPoint>(summaryTableStr);
  
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