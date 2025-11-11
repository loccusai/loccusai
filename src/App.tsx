import React, { useState, useEffect, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { AnalysisHistoryItem, AnalysisResult, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem, UserProfile } from '../types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { analyzeCompanyPresence } from '../services/geminiService';
import { deepConvertToCamelCase, deepConvertToSnakeCase } from './utils/dataTransforms';
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
                        
                        const payload = {
                           ...(deepConvertToSnakeCase(newHistoryItem) as any),
                           user_id: session.user.id
                        };

                        const { data, error } = await supabase.from('analyses').insert(payload).select().single();
                        if (error) throw error;
                        
                        setHistory(prev => prev.map(item => {
                            if (item.id === tempId) {
                                return deepConvertToCamelCase(data) as AnalysisHistoryItem;
                            }
                            return item;
                        }));
                        break;
                    }
                    case 'UPDATE_ANALYSIS': {
                        const { id, companyName } = action.payload;
                        const { error } = await supabase.from('analyses').update({ company_name: companyName }).eq('id', id);
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
                            ...(deepConvertToSnakeCase(action.payload) as any),
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
                console.error(`Falha ao processar a ação da fila: ${action.type}. O erro foi:`, error);
                // Continue to the next action instead of breaking the loop
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
            console.error("Erro ao buscar histórico do Supabase:", JSON.stringify(historyError, null, 2));
        } else if (remoteHistory) {
            const parsedHistory = remoteHistory.map(item => deepConvertToCamelCase(item) as AnalysisHistoryItem);
            setHistory(parsedHistory);
        }

        const { data: remoteProposals, error: proposalsError } = await supabase
            .from('proposals')
            .select('*')
            .eq('user_id', session.user.id);
        if (proposalsError) {
            console.error("Erro ao buscar propostas do Supabase:", JSON.stringify(proposalsError, null, 2));
        } else if (remoteProposals) {
            const parsedProposals = remoteProposals.map(item => deepConvertToCamelCase(item) as Proposal);
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
                setPage('auth');
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
                        email: session.user.email ?? '',
                        name: session.user.user_metadata.full_name,
                        picture: session.user.user_metadata.picture,
                    };
                    const { data: newProfileData, error: insertError } = await supabase
                        .from('profiles')
                        .insert(newUserProfile)
                        .select()
                        .single();
                    if (insertError) console.error("Erro ao criar perfil:", insertError);
                    else setUserProfile(deepConvertToCamelCase(newProfileData) as UserProfile);
                } else if (data) {
                    setUserProfile(deepConvertToCamelCase(data) as UserProfile);
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
            const payload: any = {
                ...(deepConvertToSnakeCase(newHistoryItem)),
                user_id: session.user.id
            };
            delete payload.id;

            const { data, error } = await supabase.from('analyses').insert(payload).select().single();
            if (error) {
                console.error("Erro ao salvar análise no Supabase:", error);
                setCurrentResult(newHistoryItem);
            } else if (data) {
                const savedItem: AnalysisHistoryItem = deepConvertToCamelCase(data) as AnalysisHistoryItem;
                setHistory(prev => prev.map(item => item.id === tempId ? savedItem : item));
                setCurrentResult(savedItem);
            }
        } else {
            setCurrentResult(newHistoryItem);
        }
        
        setPage('result');
    };

    const handleLogout = async () => {
        // Clear all user-specific data from local storage and state first.
        setUserProfile(null);
        setHistory([]);
        setProposals([]);
        setSyncQueue([]);
    
        // Then, sign out from Supabase. The onAuthStateChange listener will automatically
        // handle navigating the user to the authentication page.
        if (supabase) {
            const { error } = await supabase.auth.signOut();
            if (error) {
                console.error("Erro ao fazer logout:", error);
                // Even if sign-out fails, force navigation to the auth page for a consistent state.
                setPage('auth');
            }
        } else {
            // If Supabase isn't available, manually navigate.
            setPage('auth');
        }
    };

    const handleUpdateProfile = async (profileUpdate: Partial<UserProfile>) => {
        if (!userProfile) return;
        const previousProfile = { ...userProfile };
        const updatedProfile = { ...userProfile, ...profileUpdate };
        setUserProfile(updatedProfile); // Optimistic update
    
        if (supabase && session?.user) {
            const snakeCaseUpdate = deepConvertToSnakeCase(profileUpdate);
            const { error } = await supabase
                .from('profiles')
                .update(snakeCaseUpdate)
                .eq('id', session.user.id);
    
            if (error) {
                console.error("Erro ao atualizar perfil no Supabase:", error);
                setUserProfile(previousProfile); // Rollback on error
                throw new Error(`Falha ao salvar: ${error.message}`);
            }
        }
    };
    
    const handleSaveProposal = async (proposal: Proposal) => {
        const originalProposals = [...proposals];
        const existingIndex = proposals.findIndex(p => p.id === proposal.id);
        let updatedProposals;
        if (existingIndex > -1) {
            updatedProposals = proposals.map(p => p.id === proposal.id ? proposal : p);
        } else {
            updatedProposals = [proposal, ...proposals];
        }
        setProposals(updatedProposals);

        const action: SyncAction = { type: 'UPSERT_PROPOSAL', payload: proposal, timestamp: Date.now() };

        if (!isOnline) {
            setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposal.id)), action]);
            return;
        }

        if (supabase && session?.user) {
            const payload = { ...(deepConvertToSnakeCase(proposal) as any), user_id: session.user.id };
            const { error } = await supabase.from('proposals').upsert(payload);
            if (error) {
                console.error("Erro ao salvar proposta no Supabase:", error);
                setProposals(originalProposals); // Rollback
                setSyncQueue(prev => [...prev, action]);
                throw error; // Propagate error to UI
            }
        }
    };

    const handleDeleteProposal = async (id: string) => {
        const originalProposals = [...proposals];
        setProposals(prev => prev.filter(p => p.id !== id));

        const action: SyncAction = { type: 'DELETE_PROPOSAL', payload: { id }, timestamp: Date.now() };

        if (!isOnline) {
             setSyncQueue(prev => [...prev, action]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('proposals').delete().eq('id', id);
            if(error) {
                console.error("Erro ao deletar proposta do Supabase:", error);
                setProposals(originalProposals); // Rollback
                setSyncQueue(prev => [...prev, action]);
                alert("Ocorreu um erro ao excluir o orçamento. A exclusão foi agendada.");
            }
        }
    };
    
    const handleUpdateProposalStatus = async (proposalId: string, status: ProposalStatus) => {
        const originalProposals = [...proposals];
        const updatedProposal = proposals.find(p => p.id === proposalId);
        if (!updatedProposal) return;
        
        const newProposalState = { ...updatedProposal, status };
        setProposals(prevProposals => prevProposals.map(p => p.id === proposalId ? newProposalState : p));

        const action: SyncAction = { type: 'UPSERT_PROPOSAL', payload: newProposalState, timestamp: Date.now() };

        if (!isOnline) {
            setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposalId)), action]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('proposals').update({ status }).eq('id', proposalId);
            if (error) {
                console.error("Erro ao atualizar status do orçamento no Supabase:", error);
                setProposals(originalProposals); // Rollback
                setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPSERT_PROPOSAL' && a.payload.id === proposalId)), action]);
                alert('Não foi possível atualizar o status. A alteração foi salva localmente para sincronização posterior.');
            }
        }
    };
    
    const handleUpdateHistoryItem = async (itemToUpdate: AnalysisHistoryItem) => {
        const originalHistory = [...history];
        const updatedHistory = history.map(item => item.id === itemToUpdate.id ? itemToUpdate : item);
        setHistory(updatedHistory);

        const action: SyncAction = { type: 'UPDATE_ANALYSIS', payload: { id: itemToUpdate.id, companyName: itemToUpdate.companyName }, timestamp: Date.now() };

        if (!isOnline) {
             setSyncQueue(prev => [...prev.filter(a => !(a.type === 'UPDATE_ANALYSIS' && a.payload.id === itemToUpdate.id)), action]);
            return;
        }

        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').update({ company_name: itemToUpdate.companyName }).eq('id', itemToUpdate.id);
            if (error) {
                console.error("Erro ao atualizar item do histórico no Supabase:", error);
                setHistory(originalHistory); // Rollback
            }
        }
    };
    
    const handleDeleteHistoryItem = async (id: string) => {
        const originalHistory = [...history];
        setHistory(prev => prev.filter(item => item.id !== id));

        if (id.startsWith('pending_')) {
            setSyncQueue(prev => prev.filter(action => 
                !(action.type === 'CREATE_ANALYSIS' && action.payload.tempId === id)
            ));
            return;
        }

        const action: SyncAction = { type: 'DELETE_ANALYSIS', payload: { id }, timestamp: Date.now() };

        if (!isOnline) {
            setSyncQueue(prev => [...prev, action]);
            return;
        }
        
        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').delete().eq('id', id);
            
            if (error) {
                console.error("Erro ao deletar item do histórico do Supabase:", error);
                setHistory(originalHistory); // Rollback
                setSyncQueue(prev => [...prev, action]);
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