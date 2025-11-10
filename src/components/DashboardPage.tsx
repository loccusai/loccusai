import React, { useState, useMemo } from 'react';
import { AnalysisHistoryItem, UserProfile } from '../../types';
import ThemeSwitch from './ThemeSwitch';
import ProfileDropdown from './ProfileDropdown';
import AnalysisResultDisplay from './AnalysisResultDisplay';

interface DashboardPageProps {
    onNavigateToApp: () => void;
    onLogout: () => void;
    history: AnalysisHistoryItem[];
    theme: string;
    toggleTheme: () => void;
    userProfile: UserProfile | null;
    onNavigateToProfile: () => void;
    onNavigateToSettings: () => void;
    onNavigateToProposalsList: () => void;
    onNavigateToProposalBuilder: (analysis: AnalysisHistoryItem) => void;
    onUpdateHistoryItem: (item: AnalysisHistoryItem) => void;
    onDeleteHistoryItem: (id: string) => void;
    onNavigateToServiceLibrary: () => void;
}

const DashboardPage = ({ 
    onNavigateToApp, 
    onLogout, 
    history, 
    theme, 
    toggleTheme, 
    userProfile, 
    onNavigateToProfile, 
    onNavigateToSettings, 
    onNavigateToProposalsList,
    onNavigateToProposalBuilder,
    onUpdateHistoryItem,
    onDeleteHistoryItem,
    onNavigateToServiceLibrary
}: DashboardPageProps) => {
    const [filter, setFilter] = useState('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [viewingAnalysis, setViewingAnalysis] = useState<AnalysisHistoryItem | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingItem, setEditingItem] = useState<AnalysisHistoryItem | null>(null);

    const handleClearCache = () => {
        if (window.confirm("Tem certeza de que deseja limpar o cache do aplicativo? Isso removerá as configurações salvas (como o tema) e recarregará a página.")) {
            localStorage.clear();
            sessionStorage.clear();
            window.location.reload();
        }
    };

    const filteredHistory = useMemo(() => {
        let results = history;
        const now = new Date();
        
        if (filter === 'week') {
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            results = history.filter(item => new Date(item.date) >= lastWeek);
        } else if (filter === 'month') {
            const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            results = history.filter(item => new Date(item.date) >= lastMonth);
        } else if (filter === 'custom' && customStartDate && customEndDate) {
            const start = new Date(customStartDate);
            start.setDate(start.getDate() + 1);
            start.setHours(0, 0, 0, 0);

            const end = new Date(customEndDate);
            end.setDate(end.getDate() + 1);
            end.setHours(23, 59, 59, 999);
            
            results = history.filter(item => {
                const itemDate = new Date(item.date);
                return itemDate >= start && itemDate <= end;
            });
        }
        
        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            results = results.filter(item => 
                item.companyName.toLowerCase().includes(lowercasedSearchTerm) ||
                item.analysis.toLowerCase().includes(lowercasedSearchTerm) ||
                item.recommendations.toLowerCase().includes(lowercasedSearchTerm)
            );
        }

        return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [history, filter, customStartDate, customEndDate, searchTerm]);

    const generateHistoryItemSummary = (item: AnalysisHistoryItem) => {
        const { recommendations, analysis } = item;

        if (recommendations) {
            const recs = recommendations
                .replace(/^###\s*Recomendações Estratégicas\s*/i, '')
                .trim()
                .split(/\n\s*(?=\d+\.\s*)/)
                .slice(0, 2)
                .map(r => r.replace(/^\d+\.\s*/, '').replace(/\*\*|:/g, '').trim())
                .filter(Boolean);
            
            if (recs.length > 0) {
                return recs.join(' • ');
            }
        }

        if (analysis) {
            return analysis.substring(0, 120) + '...';
        }

        return "Nenhum resumo disponível.";
    };

    const handleSaveEdit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingItem) {
            onUpdateHistoryItem(editingItem);
            setEditingItem(null);
        }
    };
    
    const handleExportCSV = () => {
        if (filteredHistory.length === 0) {
            alert("Não há dados para exportar.");
            return;
        }

        const headers = ["ID", "Nome da Empresa", "Data", "Análise", "Recomendações"];

        const escapeCSV = (str: string) => {
            if (str.includes(',') || str.includes('\n') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvRows = [headers.join(',')];

        filteredHistory.forEach(item => {
            const row = [
                item.id,
                item.companyName,
                new Date(item.date).toLocaleString('pt-BR'),
                item.analysis.replace(/^###\s*Análise Detalhada\s*/i, '').replace(/\s+/g, ' ').trim(),
                item.recommendations.replace(/^###\s*Recomendações Estratégicas\s*/i, '').replace(/\s+/g, ' ').trim()
            ];
            csvRows.push(row.map(field => escapeCSV(String(field))).join(','));
        });

        const csvString = csvRows.join('\n');
        const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'historico_analises_loccus_ai.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (viewingAnalysis) {
        return (
            <>
                <main>
                    <button className="back-button" onClick={() => setViewingAnalysis(null)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        Voltar ao Histórico
                    </button>
                    <AnalysisResultDisplay result={viewingAnalysis} onGenerateProposal={onNavigateToProposalBuilder} />
                </main>
            </>
        )
    }

    return (
    <>
        <header className="dashboard-header">
            <h1>Dashboard</h1>
            <div className="dashboard-header-actions">
                <button className="clear-cache-button" onClick={handleClearCache}>
                    Limpar Cache
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
                </button>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
                {userProfile && <ProfileDropdown user={userProfile} onLogout={onLogout} onNavigateToProfile={onNavigateToProfile} onNavigateToSettings={onNavigateToSettings} />}
            </div>
        </header>
        <main>
            <div className="dashboard-grid">
                <div className="card cta-card" onClick={onNavigateToApp}>
                    <h2>+ Nova Análise</h2>
                    <p>Gerar um novo relatório competitivo.</p>
                </div>
                <div className="card cta-card" onClick={onNavigateToProposalsList}>
                    <h2>Meus Orçamentos</h2>
                    <p>Gerenciar e enviar propostas.</p>
                </div>
                 <div className="card cta-card" onClick={onNavigateToServiceLibrary}>
                    <h2>Biblioteca de Serviços</h2>
                    <p>Gerenciar seus serviços pré-salvos.</p>
                </div>
                <div className="card stat-card">
                    <h3>Plano</h3>
                    <p className="value">PRO</p>
                </div>
                <div className="card stat-card">
                    <h3>Status</h3>
                    <p className="value value-success">Ativo</p>
                </div>
            </div>
            <div className="card history-card">
                <div className="proposals-list-header">
                    <h2>Histórico de Análises</h2>
                    {filteredHistory.length > 0 && (
                        <button className="copy-button" onClick={handleExportCSV}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Exportar CSV
                        </button>
                    )}
                </div>
                <div className="history-search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"></path></svg>
                    <input 
                        type="text" 
                        placeholder="Pesquisar por nome, análise ou recomendação..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="history-filters">
                    <button onClick={() => setFilter('all')} className={filter === 'all' ? 'active' : ''}>Todos</button>
                    <button onClick={() => setFilter('week')} className={filter === 'week' ? 'active' : ''}>Última Semana</button>
                    <button onClick={() => setFilter('month')} className={filter === 'month' ? 'active' : ''}>Último Mês</button>
                    <button onClick={() => setFilter('custom')} className={filter === 'custom' ? 'active' : ''}>Personalizado</button>
                    {filter === 'custom' && (
                        <div className="custom-date-range">
                        <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} />
                        <span>até</span>
                        <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} />
                        </div>
                    )}
                </div>
                {filteredHistory.length > 0 ? (
                    <div className="history-list">
                        {filteredHistory.map((item) => (
                            <div key={item.id} className="history-card-item">
                                {item.status === 'pending' ? (
                                    <>
                                        <div className="history-card-header">
                                            <div>
                                                <h3 className="history-card-company">{item.companyName}</h3>
                                                <p className="history-card-date">Criado em {new Date(item.date).toLocaleDateString('pt-BR')}</p>
                                            </div>
                                            <span className="status-badge status-Draft">Pendente</span>
                                        </div>
                                        <p className="history-card-summary">{item.analysis}</p>
                                        <div className="history-card-actions">
                                             <button className="history-card-button btn-secondary" disabled>Gerar Orçamento</button>
                                            <button className="history-card-button" disabled>Ver Análise</button>
                                            <button className="btn-icon btn-delete" title="Excluir Análise" onClick={() => { if(window.confirm(`Tem certeza que deseja excluir esta solicitação pendente?`)) { onDeleteHistoryItem(item.id); }}}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </>
                                ) : editingItem?.id === item.id ? (
                                    <form className="history-item-edit-form" onSubmit={handleSaveEdit}>
                                        <div className="input-group">
                                            <input
                                                type="text"
                                                value={editingItem.companyName}
                                                onChange={(e) => setEditingItem(prev => prev ? { ...prev, companyName: e.target.value } : null)}
                                                required
                                            />
                                        </div>
                                        <div className="history-card-actions">
                                            <button type="button" className="history-card-button btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                                            <button type="submit" className="history-card-button">Salvar</button>
                                        </div>
                                    </form>
                                ) : (
                                    <>
                                        <div className="history-card-header">
                                            <div>
                                                <h3 className="history-card-company">{item.companyName}</h3>
                                                <p className="history-card-date">Análise de {new Date(item.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                                            </div>
                                            <div className="proposal-actions-group">
                                                <button className="btn-icon btn-edit" title="Editar Nome" onClick={() => setEditingItem(item)}>
                                                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                </button>
                                                <button className="btn-icon btn-delete" title="Excluir Análise" onClick={() => { if(window.confirm(`Tem certeza que deseja excluir a análise de "${item.companyName}"?`)) { onDeleteHistoryItem(item.id); }}}>
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="history-card-summary">{generateHistoryItemSummary(item)}</p>
                                        <div className="history-card-actions">
                                             <button className="history-card-button btn-secondary" onClick={() => onNavigateToProposalBuilder(item)}>Gerar Orçamento</button>
                                            <button className="history-card-button" onClick={() => setViewingAnalysis(item)}>Ver Análise</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></div>
                        <h3>Nenhum histórico encontrado</h3>
                        <p>Suas análises aparecerão aqui assim que forem geradas. Que tal começar agora?</p>
                        <button className="btn-primary" onClick={onNavigateToApp}>Criar minha primeira análise</button>
                    </div>
                )}
            </div>
        </main>
    </>
    );
};

export default DashboardPage;