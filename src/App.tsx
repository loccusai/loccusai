import React, { useState, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import { AnalysisHistoryItem, AnalysisResult, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem, UserProfile } from '../types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { analyzeCompanyPresence } from '../../services/geminiService';
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

interface SyncAction {
  type: 'CREATE_ANALYSIS' | 'UPDATE_ANALYSIS' | 'DELETE_ANALYSIS';
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


// --- Componente Principal ---
export default function App() {
    type Page = 'landing' | 'auth' | 'dashboard' | 'app' | 'result' | 'profile' | 'settings' | 'proposalBuilder' | 'proposalsList' | 'serviceLibrary';
    const [page, setPage] = useState<Page>('landing');
    const [currentResult, setCurrentResult] = useState<AnalysisHistoryItem | null>(null);
    const [history, setHistory] = useLocalStorage<AnalysisHistoryItem[]>('analysisHistory', []);
    const [proposals, setProposals] = useLocalStorage<Proposal[]>('proposals', []);
    const [syncQueue, setSyncQueue] = useLocalStorage<SyncAction[]>('syncQueue', []);
    const [theme, setTheme] = useLocalStorage<string>('theme', 'light');
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
    const [analysisForProposal, setAnalysisForProposal] = useState<AnalysisHistoryItem | null>(null);
    const isOnline = useOnlineStatus();
    
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        document.body.classList.toggle('page-visible', page !== 'landing');
    }, [theme, page]);

    useEffect(() => {
        if (!supabase) {
            const hasSeenLanding = sessionStorage.getItem('hasSeenLanding');
             if (hasSeenLanding) {
                setPage('dashboard');
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
                setPage('dashboard');
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
    }, []);
    
    const processSyncQueue = async () => {
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
    };
    
    useEffect(() => {
        if (isOnline) {
            processSyncQueue();
        }
    }, [isOnline, session]);

    useEffect(() => {
        if (supabase && session?.user && isOnline) {
            const syncData = async () => {
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
            };
            syncData();
        }
    }, [session, isOnline]);

    const handleStart = () => {
        sessionStorage.setItem('hasSeenLanding', 'true');
        if (supabase && !session) {
             setPage('auth');
        } else {
            setPage('dashboard');
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

        if (supabase && session?.user) {
            const payload = {
                ...proposalToSnakeCase(proposal),
                user_id: session.user.id,
            };
            
            const { error } = await supabase.from('proposals').upsert(payload);
            if (error) {
                console.error("Erro ao salvar proposta no Supabase:", error.message, error);
            }
        }
    };

    const handleDeleteProposal = async (id: string) => {
        setProposals(proposals.filter(p => p.id !== id));
        if (supabase && session?.user) {
            const { error } = await supabase.from('proposals').delete().eq('id', id);
            if(error) console.error("Erro ao deletar proposta do Supabase:", error);
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
        if (id.startsWith('pending_')) {
            setSyncQueue(prev => prev.filter(action => 
                !(action.type === 'CREATE_ANALYSIS' && action.payload.tempId === id)
            ));
        } else if (!isOnline) {
            setSyncQueue(prev => [...prev, { type: 'DELETE_ANALYSIS', payload: { id }, timestamp: Date.now() }]);
        } else if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').delete().eq('id', id);
            if (error) console.error("Erro ao deletar item do histórico do Supabase:", error);
        }

        setHistory(history.filter(item => item.id !== id));
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
        setPage('dashboard');
    };
    
    const handleUpdateServiceLibrary = async (services: ServiceLibraryItem[]) => {
        if(userProfile) {
            await handleUpdateProfile({ serviceLibrary: services });
        }
    };

    const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');
    
    const renderPage = () => {
        switch(page) {
            case 'landing':
                return <LandingPage onStart={handleStart} />;
            case 'auth':
                return <AuthPage />;
            case 'dashboard':
                return <DashboardPage
                    onNavigateToApp={() => setPage('app')}
                    onLogout={handleLogout}
                    history={history}
                    theme={theme}
                    toggleTheme={toggleTheme}
                    userProfile={userProfile}
                    onNavigateToProfile={() => setPage('profile')}
                    onNavigateToSettings={() => setPage('settings')}
                    onNavigateToProposalsList={() => setPage('proposalsList')}
                    onNavigateToProposalBuilder={(analysis) => { setAnalysisForProposal(analysis); setPage('proposalBuilder'); }}
                    onNavigateToServiceLibrary={() => setPage('serviceLibrary')}
                    onUpdateHistoryItem={handleUpdateHistoryItem}
                    onDeleteHistoryItem={handleDeleteHistoryItem}
                />;
            case 'app':
                return <AppForm 
                            onBack={() => setPage('dashboard')} 
                            onResult={handleResult} 
                            onQueueAnalysis={handleQueueAnalysis}
                            userProfile={userProfile}
                       />;
            case 'result':
                return currentResult && (
                    <>
                    <main>
                        <button className="back-button" onClick={() => { setCurrentResult(null); setPage('dashboard'); }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            Voltar ao Dashboard
                        </button>
                        <AnalysisResultDisplay result={currentResult} onGenerateProposal={(analysis) => { setAnalysisForProposal(analysis as AnalysisHistoryItem); setPage('proposalBuilder'); }}/>
                    </main>
                    </>
                );
             case 'profile':
             case 'settings':
                return <SettingsPage onBack={() => setPage('dashboard')} userProfile={userProfile} onUpdateProfile={handleUpdateProfile} />;
             case 'proposalBuilder':
                return analysisForProposal && <ProposalBuilderPage onBack={() => setPage('dashboard')} analysis={analysisForProposal} userProfile={userProfile} onSaveProposal={handleSaveProposal} />;
             case 'proposalsList':
                return <ProposalsListPage onBack={() => setPage('dashboard')} proposals={proposals} onUpdateProposal={handleSaveProposal} onDeleteProposal={handleDeleteProposal} onNavigateToBuilder={(analysis) => { setAnalysisForProposal(analysis); setPage('proposalBuilder'); }} />;
             case 'serviceLibrary':
                return <ServiceLibraryPage onBack={() => setPage('dashboard')} services={userProfile?.serviceLibrary || []} onUpdateServices={handleUpdateServiceLibrary} />;
            default:
                return <LandingPage onStart={handleStart} />;
        }
    };

    return (
        <div className={`app-container ${page === 'landing' || page === 'auth' ? 'is-fullpage' : ''}`}>
           {renderPage()}
        </div>
    );
}