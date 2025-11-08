import { GoogleGenAI } from "@google/genai";

const SEPARATOR_MAIN = "---ANALYSIS_BREAK---";
const SEPARATOR_SUMMARY = "---SUMMARY_BREAK---";
const SEPARATOR_RECOMMENDATION = "---RECOMMENDATION_BREAK---";
const SEPARATOR_HASHTAG = "---HASHTAG_BREAK---";

function buildPrompt(companyName: string, street: string, number: string, complement: string, neighborhood: string, city: string, state: string, keywords: string[]): string {
  const addressParts = [street, number, complement, neighborhood].filter(Boolean);
  const mainAddress = addressParts.join(', ');
  const locationString = mainAddress ? `${mainAddress} - ${city}, ${state}` : `${city}, ${state}`;
  
  return `
    Você é um assistente de análise de negócios local com acesso ao Google Maps e à web. Sua tarefa é realizar uma pesquisa DETALhada e GEOGRAFICAMENTE RESTRITA sobre a presença digital e competitiva de uma empresa.

    **Dados para a Análise:**
    *   **Nome da empresa para analisar**: "${companyName}"
    *   **Localização (Endereço)**: "${locationString}"
    *   **Palavras-chave do Negócio**: "${keywords.join(', ')}"

    **Instrução de Clareza**: Em TODAS as seções de texto geradas (tabelas, análise e recomendações), sempre que usar uma sigla técnica ou de marketing (como GMB, SEO), explique seu significado entre parênteses na primeira vez que a sigla aparecer. Exemplo: "GMB (Google Meu Negócio)".

    Siga estas instruções estritamente:

    1.  **Pesquisa Focada**: CONCENTRE SUA PESQUISA EXCLUSIVAMENTE na localização fornecida (${locationString}). Use as palavras-chave para entender o setor da empresa e encontrar resultados relevantes. Pesquise no Google Maps, Google Meu Negócio (GMB), sites e redes sociais. Seja persistente.
    2.  **Análise da Empresa Alvo**: Encontre a empresa "${companyName}" dentro da localização especificada. Se não a encontrar, indique "NÃO" na coluna "Aparece nas buscas" e prossiga com a análise da concorrência local.
    3.  **Identificação de Concorrentes Locais**: Identifique os 3 a 5 principais concorrentes DIRETOS na mesma cidade (${city}) e estado (${state}), usando as palavras-chave como guia para a categoria de negócio.
    4.  **Coleta de Dados**: Para a empresa alvo e cada concorrente, colete as seguintes informações:
        *   Nome exato encontrado.
        *   Categoria de negócio (baseada nas palavras-chave e pesquisa).
        *   Cidade.
        *   Se aparece nas buscas (responda com "SIM" ou "NÃO").
        *   Nota média de avaliação (se disponível, use "-" se não houver).
        *   Número de avaliações (se disponível, use "-" se não houver).
        *   Observações curtas (ex: "Perfil GMB completo", "Sem site", "Forte presença social").
    5.  **Formato de Saída OBRIGATÓRIO**:
        *   **Primeiro**: Apresente TODOS os dados coletados (empresa alvo primeiro, seguida pelos concorrentes) em uma ÚNICA tabela markdown com os seguintes cabeçalhos EXATOS:
            | Nome | Categoria | Cidade | Aparece nas buscas | Nota | Avaliações | Observações |
        *   **Segundo**: Insira um separador único e exato na linha seguinte:
            ${SEPARATOR_MAIN}
        *   **Terceiro**: Crie uma TABELA DE RESUMO VISUAL em formato markdown. Esta tabela deve comparar a empresa alvo com a média da concorrência local. Use os seguintes cabeçalhos EXATOS:
            | Ponto de Análise | Empresa Alvo | Concorrência Local | Recomendações Chave |
            **Instruções para a Tabela de Resumo**:
            - **Ponto de Análise**: Use itens como "Presença no GMB", "Reputação Online (Notas)", "Visibilidade Web (Site/Redes Sociais)".
            - **Empresa Alvo**: Descreva a situação da empresa alvo (ex: "SIM - Perfil incompleto", "4.2 (baixas avaliações)", "Inexistente").
            - **Concorrência Local**: Descreva o cenário geral dos concorrentes (ex: "Forte e otimizada", "Média de 4.8", "Maioria possui site").
            - **Recomendações Chave**: Dê uma ação curta e direta (ex: "Otimizar GMB com fotos", "Incentivar avaliações", "Criar site profissional").
        *   **Quarto**: Insira um segundo separador único e exato na linha seguinte:
            ${SEPARATOR_SUMMARY}
        *   **Quinto**: Escreva uma análise detalhada em TEXTO com o título "### Análise Detalhada". Esta análise deve elaborar os pontos da tabela de resumo e cobrir:
            *   A visibilidade geral da empresa alvo NA REGIÃO ESPECIFICADA.
            *   Fatores que impactam sua presença online (positivos e negativos).
        *   **Sexto**: Insira o seguinte separador na linha seguinte:
            ${SEPARATOR_RECOMMENDATION}
        *   **Sétimo**: Escreva as recomendações em TEXTO com o título "### Recomendações Estratégicas". Esta seção deve apresentar recomendações claras e práticas para melhoria (ex: criar/otimizar GMB, obter mais avaliações, etc.).
        *   **Oitavo**: Insira o seguinte separador na linha seguinte:
            ${SEPARATOR_HASHTAG}
        *   **Nono**: Crie uma seção com o título "### Hashtags Estratégicas para Visibilidade". Na linha SEGUINTE e VAZIA após o título, gere uma lista de 10 a 15 hashtags.
            **REGRAS PARA HASHTAGS (MUITO IMPORTANTE):**
            *   Apresente **APENAS** a lista de hashtags, separadas por espaços.
            *   Todas devem começar com o símbolo '#', seguido de letras ou números.
            *   **NÃO** inclua o marcador de título ('###') ou qualquer outra palavra que não seja uma hashtag na lista. A lista deve começar diretamente com uma hashtag real (ex: #nomedaempresa #servicoem[cidade]).

    O tom deve ser profissional, direto e baseado nos dados fornecidos. Não inclua nenhuma outra conversa ou texto fora deste formato.
    `;
}

export const analyzeCompanyPresence = async (companyName: string, street: string, number: string, complement: string, neighborhood: string, city: string, state: string, keywords: string[]) => {
  if (!process.env.API_KEY) {
    throw new Error("API key not found. Please set the API_KEY environment variable.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const config: any = {
    tools: [{ googleSearch: {} }, { googleMaps: {} }],
  };
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: buildPrompt(companyName, street, number, complement, neighborhood, city, state, keywords),
    config: config,
  });

  const responseText = response.text;
  if (!responseText || !responseText.includes(SEPARATOR_MAIN) || !responseText.includes(SEPARATOR_SUMMARY) || !responseText.includes(SEPARATOR_RECOMMENDATION) || !responseText.includes(SEPARATOR_HASHTAG)) {
    throw new Error("A resposta da IA está em um formato inesperado. Tente novamente.");
  }
  
  // FIX: Return grounding chunks along with the response text to display sources.
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  return { responseText, groundingChunks };
};