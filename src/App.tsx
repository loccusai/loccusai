import React, { useState, useEffect } from 'react';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';
import { AnalysisHistoryItem, AnalysisResult, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem, UserProfile } from '../types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { analyzeCompanyPresence } from '../../services/geminiService';
import { parseMarkdownTable } from './utils/parsers';

import LandingPage from './components/LandingPage';
import AuthPage from './components/AuthPage';
import DashboardPage from './components/DashboardPage';
import AppForm from './components/AppForm';
import AnalysisResultDisplay from './components/AnalysisResultDisplay';
import SettingsPage from './components/SettingsPage';
import ProposalBuilderPage from './components/ProposalBuilderPage';
import ProposalsListPage from './components/ProposalsListPage';
import ServiceLibraryPage from './components/ServiceLibraryPage';

// --- SUPABASE CLIENT SETUP (COM FALLBACK) ---
let supabase: SupabaseClient | null = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (supabaseUrl && !supabaseUrl.includes('SEU_SUPABASE_URL_AQUI') && supabaseAnonKey && !supabaseAnonKey.includes('SEU_SUPABASE_ANON_KEY_AQUI')) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    } catch (error) {
        console.error("Erro de inicialização do Supabase:", error instanceof Error ? error.message : "Erro desconhecido.");
    }
} else {
    console.warn("Supabase não configurado. A aplicação usará o Local Storage como fallback.");
}

// --- Componente Principal ---
export default function App() {
    type Page = 'landing' | 'auth' | 'dashboard' | 'app' | 'result' | 'profile' | 'settings' | 'proposalBuilder' | 'proposalsList' | 'serviceLibrary';
    const [page, setPage] = useState<Page>('landing');
    const [currentResult, setCurrentResult] = useState<AnalysisHistoryItem | null>(null);
    const [history, setHistory] = useLocalStorage<AnalysisHistoryItem[]>('analysisHistory', []);
    const [proposals, setProposals] = useLocalStorage<Proposal[]>('proposals', []);
    const [theme, setTheme] = useLocalStorage<string>('theme', 'light');
    const [session, setSession] = useState<Session | null>(null);
    const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('userProfile', null);
    const [analysisForProposal, setAnalysisForProposal] = useState<AnalysisHistoryItem | null>(null);
    
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
    
    useEffect(() => {
        if (supabase && session?.user && userProfile) {
            const syncData = async () => {
                const { data: remoteHistory, error: historyError } = await supabase
                    .from('analyses')
                    .select('*')
                    .eq('user_id', session.user.id);
                if (historyError) {
                    console.error("Erro ao buscar histórico do Supabase:", historyError);
                } else if (remoteHistory) {
                    const parsedHistory = remoteHistory.map(item => ({
                        ...item,
                        date: new Date(item.date),
                    }));
                    setHistory(parsedHistory as AnalysisHistoryItem[]);
                }


                const { data: remoteProposals, error: proposalsError } = await supabase
                    .from('proposals')
                    .select('*')
                    .eq('user_id', session.user.id);
                if (proposalsError) {
                    console.error("Erro ao buscar propostas do Supabase:", proposalsError);
                } else if (remoteProposals) {
                    const parsedProposals = remoteProposals.map(item => ({
                        ...item,
                        createdAt: new Date(item.createdAt),
                        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
                    }));
                    setProposals(parsedProposals as Proposal[]);
                }
            };
            syncData();
        }
    }, [session, userProfile]);

    const handleStart = () => {
        sessionStorage.setItem('hasSeenLanding', 'true');
        if (supabase && !session) {
             setPage('auth');
        } else {
            setPage('dashboard');
        }
    };

    const handleResult = async (result: AnalysisResult, companyName: string) => {
        const newHistoryItem: AnalysisHistoryItem = {
            ...result,
            id: `analysis_${Date.now()}`,
            companyName,
            date: new Date(),
            // Sanitize groundingChunks to ensure it is a plain JSON-serializable object
            groundingChunks: result.groundingChunks ? JSON.parse(JSON.stringify(result.groundingChunks)) : undefined
        };
        
        const updatedHistory = [newHistoryItem, ...history];
        setHistory(updatedHistory);

        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').insert({ ...newHistoryItem, user_id: session.user.id });
            if(error) {
                console.error("Erro ao salvar análise no Supabase:", error.message, error);
            }
        }
        
        setCurrentResult(newHistoryItem);
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
            const { error } = await supabase.from('proposals').upsert({ ...proposal, user_id: session.user.id });
            if (error) console.error("Erro ao salvar proposta no Supabase:", error);
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
        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').update(itemToUpdate).eq('id', itemToUpdate.id);
            if (error) console.error("Erro ao atualizar item do histórico no Supabase:", error);
        }
    };
    
    const handleDeleteHistoryItem = async (id: string) => {
        setHistory(history.filter(item => item.id !== id));
        if (supabase && session?.user) {
            const { error } = await supabase.from('analyses').delete().eq('id', id);
            if (error) console.error("Erro ao deletar item do histórico do Supabase:", error);
        }
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