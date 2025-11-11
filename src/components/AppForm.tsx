import React, { useState, useEffect } from 'react';
import { AnalysisResult, UserProfile } from '../../types';
import { analyzeCompanyPresence } from '../../services/geminiService';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface AppFormProps {
    onBack: () => void;
    onResult: (result: AnalysisResult, companyName: string) => void;
    onQueueAnalysis: (formData: Record<string, string>) => void;
    userProfile: UserProfile | null;
}

const AppForm = ({ onBack, onResult, onQueueAnalysis, userProfile }: AppFormProps) => {
    const [companyName, setCompanyName] = useState('');
    const [cep, setCep] = useState('');
    const [city, setCity] = useState(userProfile?.companyCity || '');
    const [state, setState] = useState(userProfile?.companyState || '');
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [complement, setComplement] = useState('');
    const [keywords, setKeywords] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const isOnline = useOnlineStatus();

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
            setError("Por favor, preencha os campos obrigatórios.");
            return;
        }

        if (!isOnline) {
            const formData = { companyName, city, state, street, number, neighborhood, complement, keywords };
            onQueueAnalysis(formData);
            alert('Você está offline. Sua solicitação de análise foi salva e será processada assim que a conexão for restabelecida.');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
            const { analysisResult, groundingChunks } = await analyzeCompanyPresence(companyName, street, number, complement, neighborhood, city, state, keywordsArray);

            onResult({
                ...analysisResult,
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
        const cepValue = e.target.value.replace(/\D/g, '');
        setCep(cepValue);
        if (cepValue.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cepValue}/json/`);
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
            <div className="loading-overlay">
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
            <div className="form-section">
                <h3>Informações da Empresa</h3>
                <div className="form-group">
                    <label htmlFor="companyName">Nome da empresa para analisar *</label>
                    <div className="input-wrapper">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10z"></path><path d="M16 11h-2v2h2v-2zm-2-4h2v2h-2z"></path></svg>
                        <input
                            id="companyName"
                            type="text"
                            placeholder="Ex: Pizzaria do Bairro"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            required
                        />
                    </div>
                </div>
            </div>

            <div className="form-section">
                <h3>Endereço para Análise</h3>
                <div className="form-grid">
                    <div className="form-group full-width">
                         <label htmlFor="cep">CEP (Preenche o endereço automaticamente)</label>
                         <div className="input-wrapper">
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"></path></svg>
                             <input
                                id="cep"
                                type="text"
                                placeholder="00000-000"
                                value={cep}
                                onChange={(e) => setCep(e.target.value)}
                                onBlur={handleCepBlur}
                                maxLength={9}
                             />
                        </div>
                    </div>
                    <div className="form-group full-width">
                        <label htmlFor="street">Rua / Avenida</label>
                        <input id="street" type="text" placeholder="Rua das Flores" value={street} onChange={(e) => setStreet(e.target.value)} />
                    </div>
                     <div className="form-group">
                        <label htmlFor="number">Número</label>
                        <input id="number" type="text" placeholder="123" value={number} onChange={(e) => setNumber(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="neighborhood">Bairro</label>
                        <input id="neighborhood" type="text" placeholder="Centro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                    </div>
                    <div className="form-group full-width">
                        <label htmlFor="complement">Complemento</label>
                        <input id="complement" type="text" placeholder="Sala 1, Bloco A, etc." value={complement} onChange={(e) => setComplement(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="city">Cidade *</label>
                        <input id="city" type="text" placeholder="São Paulo" value={city} onChange={(e) => setCity(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label htmlFor="state">Estado (UF) *</label>
                        <input id="state" type="text" placeholder="SP" value={state} onChange={(e) => setState(e.target.value)} required maxLength={2} />
                    </div>
                </div>
            </div>

            <div className="form-section">
                <h3>Termos da Pesquisa</h3>
                <div className="form-group">
                    <label htmlFor="keywords">Palavras-chave do Negócio *</label>
                    <div className="input-wrapper">
                       <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.22-1.05-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z"></path></svg>
                        <input
                            id="keywords"
                            type="text"
                            placeholder="restaurante italiano, barbearia, dentista"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                            required
                        />
                    </div>
                    <p className="form-helper-text">Separe por vírgulas para melhores resultados.</p>
                </div>
            </div>

            {error && <p className="error-box">{error}</p>}
            <button type="submit" className="submit-btn" disabled={loading}>
                 {loading ? <span className="button-spinner"></span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>}
                {loading ? 'Gerando Análise...' : (isOnline ? 'Gerar Análise com IA' : 'Salvar para Gerar Online')}
            </button>
        </form>
    </div>
    );
};

export default AppForm;