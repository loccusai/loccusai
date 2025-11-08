import React, { useState, useEffect } from 'react';
import { AnalysisResult, UserProfile } from '../../types';
import { analyzeCompanyPresence } from '../../services/geminiService';
import { parseMarkdownTable } from '../utils/parsers';
import { CompanyData, SummaryPoint } from '../../types';

interface AppFormProps {
    onBack: () => void;
    onResult: (result: AnalysisResult, companyName: string) => void;
    userProfile: UserProfile | null;
}

const SEPARATOR_MAIN = "---ANALYSIS_BREAK---";
const SEPARATOR_SUMMARY = "---SUMMARY_BREAK---";
const SEPARATOR_RECOMMENDATION = "---RECOMMENDATION_BREAK---";
const SEPARATOR_HASHTAG = "---HASHTAG_BREAK---";

const AppForm = ({ onBack, onResult, userProfile }: AppFormProps) => {
    const [companyName, setCompanyName] = useState('');
    const [city, setCity] = useState(userProfile?.companyCity || '');
    const [state, setState] = useState(userProfile?.companyState || '');
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [complement, setComplement] = useState('');
    const [keywords, setKeywords] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (userProfile?.companyCity && !city) {
            setCity(userProfile.companyCity);
        }
        if (userProfile?.companyState && !state) {
            setState(userProfile.companyState);
        }
    }, [userProfile, city, state]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!companyName || !city || !state || !keywords) {
            setError("Por favor, preencha todos os campos.");
            return;
        }
        setLoading(true);
        setError('');

        try {
            const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
            const { responseText, groundingChunks } = await analyzeCompanyPresence(companyName, street, number, complement, neighborhood, city, state, keywordsArray);

            const [tablePart, rest] = responseText.split(SEPARATOR_MAIN);
            const [summaryTablePart, restAfterSummary] = rest.split(SEPARATOR_SUMMARY);
            const [analysisPart, restAfterAnalysis] = restAfterSummary.split(SEPARATOR_RECOMMENDATION);
            const [recommendationsPart, hashtagsPart] = restAfterAnalysis.split(SEPARATOR_HASHTAG);

            const tableData = parseMarkdownTable<CompanyData>(tablePart);
            const summaryTableData = parseMarkdownTable<SummaryPoint>(summaryTablePart);

            const analysis = analysisPart.trim();
            const recommendations = recommendationsPart.trim();
            const hashtags = hashtagsPart.replace(/### Hashtags Estratégicas para Visibilidade/i, '').trim();

            onResult({
                tableData,
                summaryTable: summaryTableData,
                analysis,
                recommendations,
                hashtags,
                groundingChunks
            }, companyName);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Ocorreu um erro ao gerar a análise. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };
    
    const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.ok) throw new Error('CEP não encontrado');
                const data = await response.json();
                if (data.erro) throw new Error('CEP inválido');
                setCity(data.localidade);
                setState(data.uf);
                setStreet(data.logradouro);
                setNeighborhood(data.bairro);
                setComplement(data.complemento || '');
            } catch (err) {
                console.warn("Não foi possível buscar o CEP:", err);
            }
        }
    };

    return (
    <div className="card form-card">
         {loading && (
            <div className="loading-overlay" style={{ '--card-bg-color-rgb': '255, 255, 255' } as React.CSSProperties}>
                <div className="loading-spinner"></div>
                <p className="loading-text">Analisando... Isso pode levar até 1 minuto.</p>
            </div>
        )}
        <button className="back-button" onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            Voltar ao Dashboard
        </button>
        <h2 className="form-headline">Gerar Análise de Presença Digital</h2>
        <p className="form-description">Preencha os dados abaixo para que a IA possa realizar uma análise competitiva completa.</p>
        <form onSubmit={handleSubmit}>
            <div className="input-group">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"></path></svg>
                <input
                    type="text"
                    placeholder="Nome da empresa para analisar"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                />
            </div>

            <div className="input-group">
                 <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>
                 <input
                    type="text"
                    placeholder="CEP (para preencher endereço)"
                    onBlur={handleCepBlur}
                    maxLength={9}
                 />
            </div>
            
             <div className="address-fields-grid">
                <div className="input-group address-street">
                    <input
                        type="text"
                        placeholder="Rua / Avenida"
                        value={street}
                        onChange={(e) => setStreet(e.target.value)}
                        style={{ paddingLeft: '12px' }}
                    />
                </div>
                 <div className="input-group address-number">
                    <input
                        type="text"
                        placeholder="Nº"
                        value={number}
                        onChange={(e) => setNumber(e.target.value)}
                        style={{ paddingLeft: '12px' }}
                    />
                </div>
                <div className="input-group address-neighborhood">
                    <input
                        type="text"
                        placeholder="Bairro"
                        value={neighborhood}
                        onChange={(e) => setNeighborhood(e.target.value)}
                        style={{ paddingLeft: '12px' }}
                    />
                </div>
                <div className="input-group address-complement">
                    <input
                        type="text"
                        placeholder="Complemento (sala, andar, etc.)"
                        value={complement}
                        onChange={(e) => setComplement(e.target.value)}
                        style={{ paddingLeft: '12px' }}
                    />
                </div>
                <div className="input-group address-city">
                    <input
                        type="text"
                        placeholder="Cidade"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        required
                        style={{ paddingLeft: '12px' }}
                    />
                </div>
                <div className="input-group address-state">
                    <input
                        type="text"
                        placeholder="UF"
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        required
                        maxLength={2}
                         style={{ paddingLeft: '12px' }}
                    />
                </div>
            </div>

            <div className="input-group">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"></path></svg>
                <input
                    type="text"
                    placeholder="Palavras-chave (ex: restaurante italiano, barbearia, dentista)"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    required
                />
            </div>

            {error && <p className="error-box">{error}</p>}
            <button type="submit" disabled={loading}>
                 {loading ? <span className="button-spinner"></span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 16.17l7.59-7.59L19 10l-9 9z"></path></svg>}
                {loading ? 'Gerando Análise...' : 'Gerar Análise'}
            </button>
        </form>
    </div>
    );
};

export default AppForm;