import React from 'react';
import { Proposal, ProposalStatus, AnalysisHistoryItem } from '../../types';

interface ProposalsListPageProps {
    onBack: () => void;
    proposals: Proposal[];
    onUpdateProposal: (proposal: Proposal) => void;
    onDeleteProposal: (id: string) => void;
    onNavigateToBuilder: (proposal: Proposal) => void;
}

const ProposalsListPage = ({ onBack, proposals, onUpdateProposal, onDeleteProposal, onNavigateToBuilder }: ProposalsListPageProps) => {
    
    const handleStatusChange = (proposalId: string, newStatus: ProposalStatus) => {
        const proposalToUpdate = proposals.find(p => p.id === proposalId);
        if (proposalToUpdate) {
            onUpdateProposal({ ...proposalToUpdate, status: newStatus });
        }
    };
    
    const sortedProposals = [...proposals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return (
        <>
        <header className="dashboard-header">
            <h1>Meus Orçamentos</h1>
            <button className="back-button" onClick={onBack} style={{marginBottom: 0}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                Voltar ao Dashboard
            </button>
        </header>
        <main>
            <div className="card">
                <div className="proposals-list-header">
                    <h2>Histórico de Orçamentos</h2>
                </div>
                {sortedProposals.length > 0 ? (
                    <div className="proposals-list">
                        {sortedProposals.map(p => {
                            return (
                                <div key={p.id} className="proposal-item">
                                    <div className="proposal-item-info">
                                        <h3 className="proposal-item-client">{p.clientName}</h3>
                                        <p className="proposal-item-services">
                                            {p.services.length} serviço(s): <em>{p.services.map(s => s.description).join(', ').substring(0, 50)}...</em>
                                        </p>
                                        <div className="proposal-item-meta">
                                            <span>Criado em: {new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>
                                            <span>Total: {(p.totalOneTimeValue + p.totalRecurringValue).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                        </div>
                                    </div>
                                    <div className="proposal-item-status-actions">
                                        <select
                                            value={p.status}
                                            onChange={(e) => handleStatusChange(p.id, e.target.value as ProposalStatus)}
                                            className={`status-select status-${p.status}`}
                                        >
                                            <option value="Draft">Rascunho</option>
                                            <option value="Sent">Enviado</option>
                                            <option value="Accepted">Aceito</option>
                                            <option value="Declined">Recusado</option>
                                        </select>
                                        <div className="proposal-actions-group">
                                            <button className="btn-icon btn-edit" title="Editar Orçamento" onClick={() => onNavigateToBuilder(p)}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                            <button className="btn-icon btn-delete" title="Excluir Orçamento" onClick={() => { if(window.confirm(`Tem certeza que deseja excluir o orçamento para "${p.clientName}"?`)) onDeleteProposal(p.id); }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
                        <h3>Nenhum orçamento gerado</h3>
                        <p>Crie orçamentos a partir das análises para enviá-los aos seus clientes.</p>
                    </div>
                )}
            </div>
        </main>
        </>
    );
};

export default ProposalsListPage;