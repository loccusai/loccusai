

export interface CompanyData {
  [key: string]: string;
  Nome: string;
  Categoria: string;
  Cidade: string;
  'Aparece nas buscas': string;
  Nota: string;
  Avaliações: string;
  Observações: string;
}

export interface SummaryPoint {
  [key:string]: string;
  'Ponto de Análise': string;
  'Empresa Alvo': string;
  'Concorrência Local': string;
  'Recomendações Chave': string;
}

// FIX: Add types for grounding chunks to display search sources.
export interface WebGroundingSource {
    // Fix: Made properties optional to align with @google/genai's GroundingChunkWeb type.
    uri?: string;
    title?: string;
}

export interface MapsReviewSnippet {
    // Fix: Made properties optional to align with @google/genai's types and prevent runtime errors.
    uri?: string;
    title?: string;
    snippet?: string;
}

export interface MapsPlaceAnswerSource {
    // FIX: Made `reviewSnippets` optional to align with the type from `@google/genai` and fix the assignment error.
    reviewSnippets?: MapsReviewSnippet[];
}

export interface MapsGroundingSource {
    // Fix: Made properties optional to align with @google/genai's types.
    uri?: string;
    title?: string;
    placeAnswerSources?: MapsPlaceAnswerSource;
}

export interface GroundingChunk {
    web?: WebGroundingSource;
    maps?: MapsGroundingSource;
}


export interface AnalysisResult {
  tableData: CompanyData[];
  summaryTable: SummaryPoint[];
  analysis: string;
  recommendations: string;
  hashtags: string;
  groundingChunks?: GroundingChunk[];
}

export interface AnalysisHistoryItem extends AnalysisResult {
    id: string;
    companyName: string;
    date: Date;
    status?: 'pending' | 'synced';
}

export interface ProposalServiceItem {
  id: string;
  description: string;
  price: number;
  type: 'one-time' | 'recurring';
}

export type ProposalStatus = 'Draft' | 'Sent' | 'Accepted' | 'Declined';

export interface Proposal {
  id: string;
  analysisId: string;
  clientName: string;
  status: ProposalStatus;
  createdAt: Date;
  expiresAt?: Date;
  services: ProposalServiceItem[];
  totalOneTimeValue: number;
  totalRecurringValue: number;
  analysisResult: AnalysisResult;
  clientEmail?: string;
  contactName?: string;
  contactPhone?: string;
  termsAndConditions?: string;
}


export interface ServiceLibraryItem {
  id: string;
  description: string;
  price: number;
  type: 'one-time' | 'recurring';
}

export interface UserProfile {
  // FIX: Added 'id' property to align with the Supabase profiles table schema and resolve a type error in App.tsx.
  id: string;
  name: string;
  email: string;
  picture: string;
  phone?: string;
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  
  // Company details
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  companyCnpj?: string;
  companyCep?: string;
  companyStreet?: string;
  companyNumber?: string;
  companyNeighborhood?: string;
  companyComplement?: string;
  companyCity?: string;
  companyState?: string;

  // Proposal templates
  proposalOneTimeTemplate?: string;
  proposalRecurringTemplate?: string;

  // Service Library
  serviceLibrary?: ServiceLibraryItem[];
}