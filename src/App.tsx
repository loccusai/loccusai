import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { AnalysisHistoryItem, AnalysisResult, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem, UserProfile } from '../types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { analyzeCompanyPresence } from '../services/geminiService';
import { parseMarkdownTable } from './utils/parsers';
import supabase from './supabaseClient'; // Importa a instância centralizada

import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import DashboardPage from './components/DashboardPage';
import AppForm from './components/AppForm';
import AnalysisResultDisplay from './components/AnalysisResultDisplay';
import SettingsPage from './components/SettingsPage';
import ProposalBuilderPage from './components/ProposalBuilderPage';
import ProposalsListPage from './components/ProposalsListPage';
import ServiceLibraryPage from './components/ServiceLibraryPage';
import Sidebar from './components/Sidebar';

interface SyncAction {
  type: 'CREATE_ANALYSIS' | 'UPDATE_ANALYSIS' | 'DELETE_ANALYSIS' | 'UPSERT_PROPOSAL' | 'DELETE_PROPOSAL';
  payload: any;
  timestamp: number;
}


// --- Funções de Mapeamento ---
function proposalToSnakeCase(proposal: Proposal): any {
  const {
    analysisId,
    clientName,
    createdAt,
    expiresAt,
    totalOneTimeValue,
    totalRecurringValue,
    analysisResult,
    clientEmail,
    contactName,
    contactPhone,
    termsAndConditions,
    ...rest
  } = proposal;

  const { tableData, summaryTable, analysis, recommendations, hashtags, groundingChunks } = analysisResult;
  const cleanAnalysisResult = {
    tableData, summaryTable, analysis, recommendations, hashtags,
    groundingChunks: groundingChunks || null,
  };

  return {
    ...rest,
    analysis_id: analysisId,
    client_name: clientName,
    created_at: createdAt,
    expires_at: expiresAt,
    total_one_time_value: totalOneTimeValue,
    total_recurring_value: totalRecurringValue,
    analysis_result: cleanAnalysisResult,
    client_email: clientEmail,
    contact_name: contactName,
    contact_phone: contactPhone,
    terms_and_conditions: termsAndConditions,
  };
}

function proposalFromSnakeCase(item: any): Proposal {
  const {
    analysis_id,
    client_name,
    created_at,
    expires_at,
    total_one_time_value,
    total_recurring_value,
    analysis_result,
    client_email,
    contact_name,
    contact_phone,
    terms_and_conditions,
    ...rest
  } = item;
  
  return {
    ...rest,
    analysisId: analysis_id,
    clientName: client_name,
    createdAt: new Date(created_at),
    expiresAt: expires_at ? new Date(expires_at) : undefined,
    totalOneTimeValue: total_one_time_value,
    totalRecurringValue: total_recurring_value,
    analysisResult: analysis_result,
    clientEmail: client_email,
    contactName: contact_name,
    contactPhone: contact_phone,
    termsAndConditions: terms_and_conditions,
  } as Proposal;
}


interface MobileHeaderProps {
    pageTitle: string;
    onToggleSidebar: () => void;
}

const MobileHeader = ({ pageTitle, onToggleSidebar }: MobileHeaderProps) => {
    return (
        <header className="mobile-header">
            <button className="sidebar-toggle-btn" onClick={onToggleSidebar} aria-label="Abrir menu">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>
            <h1 className="mobile-header-title">{pageTitle}</h1>
        </header>
    );
};

// --- Componente de Modal de Confirmação ---
interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'OK',
    cancelText = 'Cancelar'
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={e => e.stopPropagation()}>
                <h2 id="modal-title" className="modal-title">{title}</h2>
                <p className="modal-message">{message}</p>
                <div className="modal-actions">
                    <button className="btn-secondary" onClick={onCancel}>{cancelText}</button>
                    <button className="btn-danger" onClick={onConfirm}>{confirmText}</button>
                </div>
            </div>
        </div>
    );
};


// --- Componente Principal ---
export default function App() {
    type Page = 'landing' | 'auth' | 'history' | 'app' | 'result' | 'settings' | 'proposalBuilder' | 'proposalsList' | 'serviceLibrary';
    const [page, setPage] = useState<Page>('landing');
    const [currentResult, setCurrentResult] = useState<AnalysisHistoryItem | null>(null);
    const [history, setHistory] = useLocalStorage<AnalysisHistoryItem[]>('analysisHistory', []);
    const [proposals, setProposals] = useLocalStorage<Proposal[]>('proposals', []);
    const [syncQueue, setSyncQueue] = useLocalStorage<SyncAction[]>('syncQueue', []);
    const [theme, setTheme] = useLocalStorage<string>('theme', 'light');
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
    const [analysisForProposal, setAnalysisForProposal] = useState<AnalysisHistoryItem | null>(null);
    const [proposalToEdit, setProposalToEdit] = useState<Proposal | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [confirmation, setConfirmation] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    } | null>(null);
    const isOnline = useOnlineStatus();
    
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        document.body.classList.toggle('page-visible', page !== 'landing');
    }, [theme, page]);

    const processSyncQueue = useCallback(async () => {
        if (!isOnline || syncQueue.length === 0 || !supabase || !session?.user) return;

        console.log("Processando fila de sincronização...", syncQueue);
        const queue = [...syncQueue];
        let processedTimestamps = new Set<number>();

        for (const action of queue) {
            try {
                switch (action.type) {
                    case 'CREATE_ANALYSIS': {
                        const { formData, tempId } = action.payload;
                        const { analysisResult, groundingChunks } = await analyzeCompanyPresence(
                            formData.companyName, formData.street, formData.number, formData.complement,
                            formData.neighborhood, formData.city, formData.state, formData.keywords.split(',').map((k:string) => k.trim())
                        );
                        
                        const newHistoryItem: Omit<AnalysisHistoryItem, 'id'> = {
                            ...analysisResult,
                            companyName: formData.companyName,
                            date: new Date(),
                            groundingChunks: JSON.parse(JSON.stringify(groundingChunks || [])),
                            status: 'synced',
                        };
                        
                        const { tableData, summaryTable, groundingChunks: gc, status, ...rest } = newHistoryItem;
                        const payload = { 
                            ...rest, 
                            table_data: tableData,
                            summary_table: summaryTable,
                            grounding_chunks: gc,
                            user_id: session.user.id 
                        };

                        const { data, error } = await supabase.from('analyses').insert(payload).select().single();
                        if (error) throw error;
                        
                        setHistory(prev => prev.map(item => {
                            if (item.id === tempId) {
                                const { table_data, summary_table, grounding_chunks, ...restOfData } = data;
                                return {
                                    ...restOfData,
                                    date: new Date(data.date),
                                    tableData: table_data || [],
                                    summaryTable: summary_table || [],
                                    groundingChunks: grounding_chunks || [],
                                } as AnalysisHistoryItem;
                            }
                            return item;
                        }));
                        break;
                    }
                    case 'UPDATE_ANALYSIS': {
                        const { id, companyName } = action.payload;
                        const { error } = await supabase.from('analyses').update({ companyName }).eq('id', id);
                        if (error) throw error;
                        break;
                    }
                    case 'DELETE_ANALYSIS': {
                        const { error } = await supabase.from('analyses').delete().eq('id', action.payload.id);
                        if (error) throw error;
                        break;
                    }
                    case 'UPSERT_PROPOSAL': {
                         const payload = {
                            ...proposalToSnakeCase(action.payload),
                            user_id: session.user.id,
                        };
                        const { error } = await supabase.from('proposals').upsert(payload);
                        if (error) throw error;
                        break;
                    }
                    case 'DELETE_PROPOSAL': {
                        const { error } = await supabase.from('proposals').delete().eq('id', action.payload.id);
                        if (error) throw error;
                        break;
                    }
                }
                processedTimestamps.add(action.timestamp);
            } catch (error) {
                console.error('Falha ao processar ação da fila. Tentará novamente mais tarde:', action, error);
                break; 
            }
        }

        if (processedTimestamps.size > 0) {
            setSyncQueue(currentQueue => currentQueue.filter(a => !processedTimestamps.has(a.timestamp)));
        }
    }, [isOnline, session, syncQueue, setSyncQueue, setHistory]);

    const syncRemoteData = useCallback(async () => {
        if (!supabase || !session?.user || !isOnline) return;

        console.log("Buscando dados remotos...");

        const { data: remoteHistory, error: historyError } = await supabase
            .from('analyses')
            .select('*')
            .eq('user_id', session.user.id);
        if (historyError) {
            console.error("Erro ao buscar histórico do Supabase:", historyError);
        } else if (remoteHistory) {
            const parsedHistory = remoteHistory.map(item => {
                const { table_data, summary_table, grounding_chunks, ...rest } = item;
                return {
                    ...rest,
                    tableData: table_data || [],
                    summaryTable: summary_table || [],
                    groundingChunks: grounding_chunks || [],
                    date: new Date(item.date),
                };
            });
            setHistory(parsedHistory as AnalysisHistoryItem[]);
        }

        const { data: remoteProposals, error: proposalsError } = await supabase
            .from('proposals')
            .select('*')
            .eq('user_id', session.user.id);
        if (proposalsError) {
            console.error("Erro ao buscar propostas do Supabase:", proposalsError);
        } else if (remoteProposals) {
            const parsedProposals = remoteProposals.map(proposalFromSnakeCase);
            setProposals(parsedProposals);
        }
    }, [session, isOnline, setHistory, setProposals]);

    useEffect(() => {
        const runSync = async () => {
            if (isOnline && session?.user) {
                await processSyncQueue();
                await syncRemoteData();
            }
        };
        runSync();
    }, [session, isOnline, processSyncQueue, syncRemoteData]);
    
    useEffect(() => {
        if (!supabase) {
            const hasSeenLanding = sessionStorage.getItem('hasSeenLanding');
             if (hasSeenLanding) {
                setPage('history');
             } else {
                 setPage('landing');
             }
            return;
        }

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            setSession(session);
            if (session?.user) {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (error && error.code === 'PGRST116') {
                    const newUserProfile: Partial<UserProfile> = {
                        id: session.user.id,
                        email: session.user.email,
                        name: session.user.user_metadata.full_name,
                        picture: session.user.user_metadata.picture,
                    };
                    const { data: newProfileData, error: insertError } = await supabase
                        .from('profiles')
                        .insert(newUserProfile)
                        .select()
                        .single();
                    if (insertError) console.error("Erro ao criar perfil:", insertError);
                    else setUserProfile(newProfileData as UserProfile);
                } else if (data) {
                    setUserProfile(data as UserProfile);
                }
                setPage(currentPage => {
                    if (currentPage === 'landing' || currentPage === 'auth') {
                        return 'history';
                    }
                    return currentPage;
                });
            } else {
                 const hasSeenLanding = sessionStorage.getItem('hasSeenLanding');
                 if (hasSeenLanding) {
                    setPage('auth');
                 } else {
                     setPage('landing');
                 }
            }
        });

        return () => subscription.unsubscribe();
    }, [setUserProfile]);

    const handleStart = () => {
        sessionStorage.setItem('hasSeenLanding', 'true');
        if (supabase && !session) {
             setPage('auth');
        } else {
            setPage('history');
        }
    };

    const handleResult = async (result: AnalysisResult, companyName: string) => {
        const tempId = `analysis_${Date.now()}`;
        const newHistoryItem: AnalysisHistoryItem = {
            ...result,
            id: tempId,
            companyName,
            date: new Date(),
            groundingChunks: result.groundingChunks ? JSON.parse(JSON.stringify(result.groundingChunks)) : undefined
        };
        
        setHistory(prev => [newHistoryItem, ...prev]);

        if (supabase && session?.user) {
            const { id, tableData, summaryTable, groundingChunks, status, ...rest } = newHistoryItem;
            const payload = {
                ...rest,
                table_data: tableData,
                summary_table: summaryTable,
                grounding_chunks: groundingChunks,
                user_id: session.user.id
            };

            const { data, error } = await supabase.from('analyses').insert(payload).select().single();
            if (error) {
                console.error("Erro ao salvar análise no Supabase:", error.message, error);
                setCurrentResult(newHistoryItem);
            } else if (data) {
                const { table_data, summary_table, grounding_chunks, ...restOfData } = data;
                const savedItem: AnalysisHistoryItem = {
                    ...restOfData,
                    tableData: table_data || [],
                    summaryTable: summary_table || [],
                    groundingChunks: grounding_chunks || [],
                    date: new Date(data.date),
                };
                setHistory(prev => prev.map(item => item.id === tempId ? savedItem : item));
                setCurrentResult(savedItem);
            }
        } else {
            setCurrentResult(newHistoryItem);
        }
        
        setPage('result');
    };

    const handleLogout = async () => {
        setUserProfile(null);
        if (supabase) {
            const { error } = await supabase.auth.signOut();
            if (error) console.error("Erro ao fazer logout:", error);
        }
        setPage('auth');
    };

    const handleUpdateProfile = async (profileUpdate: Partial<UserProfile>) => {
        if (!userProfile) return;
        const updatedProfile = { ...userProfile, ...profileUpdate };
        setUserProfile(updatedProfile);
        if (supabase && session?.user) {
             const { error } = await supabase
                .from('profiles')
                .update(profileUpdate)
                .eq('id', session.user.id);
            if(error) console.error("Erro ao atualizar perfil no Supabase:", error);
        }
    };
    
    const handleSaveProposal = async (proposal: Proposal) => {
        const existingIndex = proposals.findIndex(p => p.id === proposal.id);
        let updatedProposals;
        if (existingIndex > -1) {
            updatedProposals = proposals.map(p => p.id === proposal.id ? proposal : p);
        } else {
            updatedProposals = [proposal, ...proposals];
        }
        setProposals(updatedProposals);

        if (!isOnline) {
            setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposal.id)), { type: 'UPSERT_PROPOSAL', payload: proposal, timestamp: Date.now() }]);
            return;
        }

        if (supabase && session?.user) {
            const payload = { ...proposalToSnakeCase(proposal), user_id: session.user.id };
            const { error } = await supabase.from('proposals').upsert(payload);
            if (error) {
                console.error("Erro ao salvar proposta no Supabase:", error.message, error);
                setSyncQueue(prev => [...prev, { type: 'UPSERT_PROPOSAL', payload: proposal, timestamp: Date.now() }]);
            }
        }
    };

    const handleDeleteProposal = async (id: string) => {
        setProposals(prev => prev.filter(p => p.id !== id));

        if (!isOnline) {
             setSyncQueue(prev => [...prev, { type: 'DELETE_PROPOSAL', payload: { id }, timestamp: Date.now() }]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('proposals').delete().eq('id', id);
            if(error) {
                console.error("Erro ao deletar proposta do Supabase:", error);
                setSyncQueue(prev => [...prev, { type: 'DELETE_PROPOSAL', payload: { id }, timestamp: Date.now() }]);
                alert("Ocorreu um erro ao excluir o orçamento. A exclusão foi agendada.");
            }
        }
    };
    
    const handleUpdateProposalStatus = async (proposalId: string, status: ProposalStatus) => {
        const updatedProposal = proposals.find(p => p.id === proposalId);
        if (!updatedProposal) return;
        
        const newProposalState = { ...updatedProposal, status };
        setProposals(prevProposals => prevProposals.map(p => p.id === proposalId ? newProposalState : p));

        if (!isOnline) {
            setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposalId)), { type: 'UPSERT_PROPOSAL', payload: newProposalState, timestamp: Date.now() }]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('proposals').update({ status }).eq('id', proposalId);
            if (error) {
                console.error("Erro ao atualizar status do orçamento no Supabase:", error);
                setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposalId)), { type: 'UPSERT_PROPOSAL', payload: newProposalState, timestamp: Date.now() }]);
                alert('Não foi possível atualizar o status no banco de dados. A alteração foi salva localmente.');
            }
        }
    };
    
    const handleUpdateHistoryItem = async (itemToUpdate: AnalysisHistoryItem) => {
        const updatedHistory = history.map(item => item.id === itemToUpdate.id ? itemToUpdate : item);
        setHistory(updatedHistory);

        if (!isOnline) {
             setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPDATE_ANALYSIS' && a.payload.id === itemToUpdate.id)), { type: 'UPDATE_ANALYSIS', payload: { id: itemToUpdate.id, companyName: itemToUpdate.companyName }, timestamp: Date.now() }]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').update({ companyName: itemToUpdate.companyName }).eq('id', itemToUpdate.id);
            if (error) console.error("Erro ao atualizar item do histórico no Supabase:", error);
        }
    };
    
    const handleDeleteHistoryItem = async (id: string) => {
        setHistory(prev => prev.filter(item => item.id !== id));

        if (id.startsWith('pending_')) {
            setSyncQueue(prev => prev.filter(action => 
                !(action.type === 'CREATE_ANALYSIS' && action.payload.tempId === id)
            ));
            return;
        }

        if (!isOnline) {
            setSyncQueue(prev => [...prev, { type: 'DELETE_ANALYSIS', payload: { id }, timestamp: Date.now() }]);
            return;
        }
        
        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').delete().eq('id', id);
            
            if (error) {
                console.error("Erro ao deletar item do histórico do Supabase:", error);
                setSyncQueue(prev => [...prev, { type: 'DELETE_ANALYSIS', payload: { id }, timestamp: Date.now() }]);
                alert("Ocorreu um erro ao excluir a análise. A exclusão foi agendada.");
            }
        }
    };
    
    const handleQueueAnalysis = (formData: Record<string, string>) => {
        const tempId = `pending_${Date.now()}`;
        const placeholderItem: AnalysisHistoryItem = {
            id: tempId,
            companyName: formData.companyName,
            date: new Date(),
            tableData: [],
            summaryTable: [],
            analysis: 'Análise pendente de sincronização.',
            recommendations: 'Aguardando conexão com a internet para gerar.',
            hashtags: '',
            status: 'pending'
        };
        setHistory(prev => [placeholderItem, ...prev]);
        setSyncQueue(prev => [...prev, {
            type: 'CREATE_ANALYSIS',
            payload: { formData, tempId },
            timestamp: Date.now()
        }]);
        setPage('history');
    };
    
    const handleUpdateServiceLibrary = async (services: ServiceLibraryItem[]) => {
        if(userProfile) {
            await handleUpdateProfile({ serviceLibrary: services });
        }
    };
    
    const requestConfirmation = (title: string, message: string, onConfirm: () => void) => {
        setConfirmation({
            isOpen: true,
            title,
            message,
            onConfirm,
        });
    };

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

    const isDashboardView = (p: Page): p is 'history' | 'app' | 'proposalsList' | 'serviceLibrary' | 'settings' | 'proposalBuilder' | 'result' => {
        return ['history', 'app', 'proposalsList', 'serviceLibrary', 'settings', 'proposalBuilder', 'result'].includes(p);
    };

    const getPageTitle = (page: Page): string => {
        switch(page) {
            case 'history': return 'Histórico';
            case 'app': return 'Nova Análise';
            case 'result': return currentResult?.companyName || 'Análise';
            case 'settings': return 'Configurações';
            case 'proposalBuilder': return proposalToEdit ? 'Editar Orçamento' : 'Criar Orçamento';
            case 'proposalsList': return 'Orçamentos';
            case 'serviceLibrary': return 'Serviços';
            default: return 'Loccus AI';
        }
    };

    const renderDashboardContent = () => {
        switch(page) {
            case 'history':
                return <DashboardPage
                    onNavigateToApp={() => setPage('app')}
                    history={history}
                    userProfile={userProfile}
                    onNavigateToProposalBuilder={(analysis) => { setProposalToEdit(null); setAnalysisForProposal(analysis); setPage('proposalBuilder'); }}
                    onUpdateHistoryItem={handleUpdateHistoryItem}
                    onDeleteHistoryItem={handleDeleteHistoryItem}
                    requestConfirmation={requestConfirmation}
                />;
            case 'app':
                return <AppForm 
                            onBack={() => setPage('history')}
                            onResult={handleResult} 
                            onQueueAnalysis={handleQueueAnalysis}
                            userProfile={userProfile}
                       />;
            case 'result':
                return currentResult && (
                    <AnalysisResultDisplay 
                        result={currentResult} 
                        onGenerateProposal={(analysis) => { setProposalToEdit(null); setAnalysisForProposal(analysis as AnalysisHistoryItem); setPage('proposalBuilder'); }}
                        onBackToHistory={() => { setCurrentResult(null); setPage('history'); }}
                    />
                );
             case 'settings':
                return <SettingsPage onBack={() => setPage('history')} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} />;
             case 'proposalBuilder':
                return (analysisForProposal || proposalToEdit) && <ProposalBuilderPage onBack={() => { setPage('proposalsList'); setProposalToEdit(null); setAnalysisForProposal(null); }} analysis={analysisForProposal || proposalToEdit!.analysisResult as any} userProfile={userProfile} onSaveProposal={handleSaveProposal} proposalToEdit={proposalToEdit} />;
             case 'proposalsList':
                return <ProposalsListPage 
                    onBack={() => setPage('history')} 
                    proposals={proposals} 
                    onUpdateStatus={handleUpdateProposalStatus} 
                    onDeleteProposal={handleDeleteProposal} 
                    onNavigateToBuilder={(proposal) => { 
                        setProposalToEdit(proposal);
                        const analysis: AnalysisHistoryItem = {
                            ...proposal.analysisResult,
                            id: proposal.analysisId,
                            companyName: proposal.clientName,
                            date: proposal.createdAt,
                            status: 'synced',
                        };
                        setAnalysisForProposal(analysis); 
                        setPage('proposalBuilder'); 
                    }}
                    requestConfirmation={requestConfirmation}
                />;
             case 'serviceLibrary':
                return <ServiceLibraryPage onBack={() => setPage('history')} services={userProfile?.serviceLibrary || []} onUpdateServices={handleUpdateServiceLibrary} />;
            default:
                return null;
        }
    };
    
    const dashboardActiveView = isDashboardView(page) ? (page === 'result' || page === 'proposalBuilder' ? 'history' : page) : 'history';

    return (
        <div className={`app-container ${page === 'landing' || page === 'auth' ? 'is-fullpage' : 'is-dashboard-layout'}`}>
           {isDashboardView(page) ? (
                <div className="dashboard-layout">
                    <MobileHeader 
                        pageTitle={getPageTitle(page)}
                        onToggleSidebar={() => setIsSidebarOpen(true)}
                    />
                    <Sidebar 
                        activeView={dashboardActiveView}
                        onNavigate={(view) => setPage(view)}
                        userProfile={userProfile}
                        onLogout={handleLogout}
                        theme={theme}
                        toggleTheme={toggleTheme}
                        isOpen={isSidebarOpen}
                        onClose={() => setIsSidebarOpen(false)}
                    />
                    {isSidebarOpen && <div className="mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}
                    <div className="main-content">
                        {renderDashboardContent()}
                    </div>
                </div>
            ) : page === 'landing' ? (
                <LandingPage onStart={handleStart} />
            ) : (
                <AuthPage />
            )}
            {confirmation?.isOpen && (
                <ConfirmationModal
                    isOpen={confirmation.isOpen}
                    title={confirmation.title}
                    message={confirmation.message}
                    onConfirm={() => {
                        confirmation.onConfirm();
                        setConfirmation(null);
                    }}
                    onCancel={() => setConfirmation(null)}
                    confirmText="OK"
                    cancelText="Cancelar"
                />
            )}
        </div>
    );
}