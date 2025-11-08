import React, { useState, useEffect, useMemo } from 'react';
import { analyzeCompanyPresence } from './services/geminiService';
import { CompanyData, SummaryPoint, AnalysisResult, LatLng, GroundingChunk, AnalysisHistoryItem, UserProfile, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

// --- SUPABASE CLIENT SETUP (COM FALLBACK) ---
// Login desabilitado temporariamente. A aplicação usará o Local Storage.
let supabase: SupabaseClient | null = null;
/*
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Tenta inicializar o Supabase apenas se as chaves não forem placeholders
if (supabaseUrl && !supabaseUrl.includes('SEU_SUPABASE_URL_AQUI') && supabaseAnonKey && !supabaseAnonKey.includes('SEU_SUPABASE_ANON_KEY_AQUI')) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
    } catch (error) {
        console.error("Erro de inicialização do Supabase:", error instanceof Error ? error.message : "Erro desconhecido.");
    }
} else {
    console.warn("Supabase não configurado. A aplicação usará o Local Storage como fallback. Funcionalidades de sincronização e multi-usuário estarão desativadas.");
}
*/

// --- HOOK PARA LOCAL STORAGE ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
       if (item) {
        // Adiciona um "reviver" para converter strings de data de volta para objetos Date
        return JSON.parse(item, (k, v) => {
          if (typeof v === 'string' && /^\d{4}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v)) {
            return new Date(v);
          }
          return v;
        });
      }
      return initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(error);
    }
  };

  return [storedValue, setValue];
}


// Constants for parsing the API response
const SEPARATOR_MAIN = "---ANALYSIS_BREAK---";
const SEPARATOR_SUMMARY = "---SUMMARY_BREAK---";
const SEPARATOR_RECOMMENDATION = "---RECOMMENDATION_BREAK---";
const SEPARATOR_HASHTAG = "---HASHTAG_BREAK---";

/**
 * A simple parser for markdown tables.
 */
function parseMarkdownTable<T extends Record<string, string>>(markdown: string): T[] {
    const lines = markdown.trim().split('\n').filter(line => line.includes('|'));
    if (lines.length < 2) return [];

    const headers = lines[0].split('|').map(h => h.trim()).filter(h => h);
    const dataLines = lines.slice(1).filter(line => !line.match(/^[-|:\s]+$/));

    return dataLines.map(line => {
        const values = line.split('|').map(v => v.trim());
        if (values[0] === '') values.shift();
        if (values[values.length - 1] === '') values.pop();
        const entry: Record<string, string> = {};
        headers.forEach((header, index) => {
            entry[header] = values[index] || '';
        });
        return entry as T;
    });
}

const LoadingSkeleton = () => (
    <div className="results-container">
        <div className="card"><div className="skeleton skeleton-h3" style={{ width: '40%' }}></div><div className="skeleton skeleton-text"></div><div className="skeleton skeleton-text" style={{ width: '80%' }}></div></div>
        <div className="card"><div className="skeleton skeleton-h3" style={{ width: '50%' }}></div><div className="skeleton skeleton-text"></div><div className="skeleton skeleton-text" style={{ width: '90%' }}></div></div>
        <div className="card"><div className="skeleton skeleton-h3" style={{ width: '45%' }}></div><div className="skeleton skeleton-text"></div><div className="skeleton skeleton-text" style={{ width: '70%' }}></div></div>
    </div>
);

// Componente de troca de tema
const ThemeSwitch = ({ theme, toggleTheme }: { theme: string; toggleTheme: () => void; }) => (
    <div 
      className={`theme-switch ${theme}`} 
      onClick={toggleTheme}
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label={`Mudar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
      title={`Mudar para modo ${theme === 'dark' ? 'claro' : 'escuro'}`}
    >
        <div className="theme-switch-thumb"></div>
        <span className="theme-switch-icon sun-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
        </span>
        <span className="theme-switch-icon moon-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        </span>
    </div>
);

// Dados para o carrossel de depoimentos
const testimonials = [
    {
        quote: "Eu passava horas montando relatórios de concorrentes. Com o Loccus AI, faço em minutos o que antes levava um dia inteiro. Meus clientes ficam impressionados e eu ganho mais tempo para focar em estratégia.",
        author: "João P.",
        title: "Gestor de Tráfego",
        avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wAARCAA8ADwDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAgMAAQQFBgf/xAAqEAACAgEDAwQCAAcAAAAAAAAAAQIRAwQhEjFBUQUTImFxFIGRoUKxwf/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAHREBAQEAAgMBAQEAAAAAAAAAAAERAiESMUFREv/aAAwDAQACEQMRAD8A9NjjGMYxjYRiMYwYxjGDAA5s5sAxnNisBqG0hsgbQ2kCSA2kCSA2kNJDSAkDYGyBtIbQEgLQ2gJAbQEgJjGxjAxjZGNhGMYxgxhYxjAYsYxggc2c2MYDnNiMYwYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGAf/Z"
    },
    {
        quote: "Levar um relatório da Loccus AI para la reunião de prospecção muda o jogo. O cliente vê na hora os pontos fracos e onde podemos atuar. Fechei 3 novos contratos no último mês usando essa tática.",
        author: "Maria F.",
        title: "Freelancer de SEO Local",
        avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAA8ADwDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAgMBBAUABgf/xAAuEAACAQMDAgQFAwUAAAAAAAAAAQIDBBEhMQUSQVFhInGBkRMyobFCUnLB0eH/xAAZAQADAQEBAAAAAAAAAAAAAAAAAQIDBAX/xAAeEQEBAQEAAgIDAQAAAAAAAAAAAQIREiEDMUEiE//aAAwDAQACEQMRAD8A9+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAABG5uKVpSlOb1yZlK7q1s5bSXZFb8/JzV1bQ81rVJVZNuTbfVmPqZ6Iym28t5ZzrqbA1YAAigAAAAAAAAAAAAAAAAAI16saNNzk9EV3a2hb0nKT1exxr1Z1pycm22+pnLll4jVvOa1epOrNykyPUzQRgJGAJGAJAAAAAAAAAAAAAAAACVlQlWqxiory/RGrZ0o0acYxWiRVs6KoUoxS6ZZO3HHuX2Z88/uABybgAAAAAAAAAAAAA//9k="
    },
    {
        quote: "Antes era difícil mostrar o 'antes e depois' de um trabalho de SEO local. Agora, os relatórios visuais fazem isso por mim. A ferramenta se paga sozinha só com a clareza que ela traz para o cliente.",
        author: "Carlos S.",
        title: "Sócio de Agência",
        avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAA8ADwDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAgMAAQQFBgf/xAAoEAACAgEEAgEEAgMBAAAAAAABAgMRBAASITEFECJBURMYYXGBI0L/xAAZAQADAQEBAAAAAAAAAAAAAAAAAQIDBAX/xAdEQEBAAICAwEAAAAAAAAAAAAAAQIRITESQVEDMv/aAAwDAQACEQMRAD8A9WwMDAwMAYGBgYAwMDAwMAYGBgYAwYGBgDFx9L3LLyOXLxI8aF+2t1C2sWTXXe+rG9d6tW9+g7iY0x2y5a0z4+T5cTJyYsfHyYkdKyKrqDYNgjcEEA9fW6d6P5k8R4uL5C8bIyHWR8aI1FPsLMoYqNN1Wz0P2+t+vI3f8AB+A8bC8dyPDYfDxL2XlcjLk9mMIzxYccqtc5AHf0jUdtg0AbPz1gYGBgYAwMDAwMAYGBgYAwMDAwP/9k="
    }
];


// Componente da Landing Page
const LandingPage = ({ onStart }: { onStart: () => void; }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    
    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIndex(current => (current + 1) % testimonials.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
    <div className="landing-page">
        <header className="landing-header">
            <div className="landing-logo"><svg className="logo-image" viewBox="0 0 24 24" fill="var(--primary-color)"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><span className="landing-logo-text">Loccus AI</span></div>
        </header>
        <section className="hero">
            <div className="hero-badge">PARA AGÊNCIAS E FREELANCERS</div>
            <h1 className="hero-title">A Ferramenta Definitiva para Gestores de Tráfego Local.</h1>
            <p className="hero-subtitle">Poupe horas em análises manuais. Entregue relatórios de presença digital impressionantes e conquiste mais clientes para o seu negócio.</p>
            <button className="hero-cta" onClick={onStart}>Começar Agora</button>
            <div className="hero-social-proof"><span className="stars">★★★★★</span><span>Usado por mais de 200 agências de marketing</span></div>
        </section>
        <section className="features-section">
            <h2 className="section-title">Análises inteligentes para agências eficientes.</h2>
            <div className="features-grid">
                <div className="feature-item"><div className="feature-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" y2="9"></line></svg></div><h3 className="feature-title">Relatórios em Minutos</h3><p className="feature-description">Gere análises competitivas completas com um clique. Deixe a IA fazer o trabalho pesado e foque na estratégia para seu cliente.</p></div>
                <div className="feature-item"><div className="feature-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"></path><path d="M15 7h6v6"></path></svg></div><h3 className="feature-title">Dados para Decisão</h3><p className="feature-description">Compare seus clientes com concorrentes locais em métricas essenciais: GMB, avaliações, visibilidade e mais.</p></div>
                <div className="feature-item"><div className="feature-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div><h3 className="feature-title">Justifique seu Valor</h3><p className="feature-description">Apresente dados claros e recomendações práticas que demonstram o impacto do seu trabalho e impressionam seus clientes.</p></div>
            </div>
        </section>
        <section className="pricing-section">
            <h2 className="section-title">Um preço, potencial ilimitado.</h2>
            <p className="section-subtitle">Escolha o plano que escala com sua agência.</p>
            <div className="pricing-card">
                <div className="pricing-card-header"><div className="plan-info"><span className="plan-name">PRO</span><span className="plan-badge">RECOMENDADO</span></div><p className="plan-description">Acesso total para análises ilimitadas.</p></div>
                <div className="pricing-card-body"><div className="price-container"><span className="main-price">R$49</span><span className="price-period">/ mês</span></div>
                    <ul className="features-list">
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Análises de empresas ilimitadas</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Relatórios de concorrentes</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Dados do Google Maps & Search</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Suporte prioritário</span></li>
                    </ul>
                </div>
                 <button className="hero-cta pricing-cta" onClick={onStart}>Começar Agora</button>
            </div>
        </section>
        <section className="quote-section">
             <h2 className="section-title">Feito por quem entende do seu dia a dia.</h2>
             <div className="carousel-container">
                <div className="carousel-slider" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
                    {testimonials.map((item, index) => (
                        <div className="carousel-slide" key={index}>
                            <img src={item.avatar} alt={`Foto de ${item.author}`} className="quote-avatar" />
                            <blockquote>"{item.quote}"</blockquote>
                            <cite>{item.author}</cite>
                            <cite className="cite-title">{item.title}</cite>
                        </div>
                    ))}
                </div>
             </div>
             <div className="carousel-dots">
                {testimonials.map((_, index) => (
                    <span 
                        key={index}
                        className={`carousel-dot ${index === activeIndex ? 'active' : ''}`}
                        onClick={() => setActiveIndex(index)}
                    ></span>
                ))}
             </div>
        </section>
        <section className="cta-section"><h2 className="section-title">Pronto para dominar o mercado local para seus clientes?</h2><button className="hero-cta" onClick={onStart}>Começar Agora</button></section>
        <footer className="landing-footer"><p>© 2024 Loccus AI. Todos os direitos reservados.</p></footer>
    </div>
    );
};

// Componente da Página de Autenticação, agora com Supabase
const AuthPage = () => {
    const [isLoginView, setIsLoginView] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const authDisabledMessage = "A autenticação está desabilitada. Para ativar, o desenvolvedor precisa configurar as credenciais do Supabase no arquivo index.html.";

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) {
            setError(authDisabledMessage);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const { error } = isLoginView
                ? await supabase.auth.signInWithPassword({ email, password })
                : await supabase.auth.signUp({ email, password });
            if (error) throw error;
            // O listener onAuthStateChange no App.tsx cuidará da navegação.
        } catch (err: any) {
            setError(err.error_description || err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        if (!supabase) {
            setError(authDisabledMessage);
            return;
        }
        const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
        if (error) {
            setError(error.message);
        }
    };

    return (
        <section className="auth-section">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="landing-logo"><svg className="logo-image" viewBox="0 0 24 24" fill="var(--primary-color)"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><span className="landing-logo-text">Loccus AI</span></div>
                    <h1 className="auth-heading">{isLoginView ? 'Acesse sua Conta' : 'Crie sua Conta'}</h1>
                </div>
                 {error && <p className="auth-error">{error}</p>}
                <form className="auth-form" onSubmit={handleAuthAction}>
                    <input type="email" placeholder="E-mail" required value={email} onChange={e => setEmail(e.target.value)} />
                    <input type="password" placeholder="Senha" required value={password} onChange={e => setPassword(e.target.value)} />
                    <button type="submit" className="auth-submit-btn" disabled={loading}>
                        {loading ? (isLoginView ? 'ENTRANDO...' : 'CRIANDO...') : (isLoginView ? 'Entrar' : 'Criar uma conta')}
                    </button>
                    <button type="button" className="auth-google-btn" onClick={handleGoogleLogin}>
                        <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.222,0-9.618-3.317-11.28-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.574l6.19,5.238C39.902,36.63,44,30.85,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>
                        {isLoginView ? 'Entrar com Google' : 'Cadastrar com Google'}
                    </button>
                </form>
                <div className="auth-footer-link">
                    <p>{isLoginView ? 'Não possui uma conta?' : 'Já possui uma conta?'}</p>
                    <a href="#" onClick={(e) => { e.preventDefault(); setIsLoginView(!isLoginView); setError(null); }}>
                        {isLoginView ? 'Criar conta' : 'Entrar'}
                    </a>
                </div>
            </div>
        </section>
    );
};

// Componente de Perfil
const ProfileDropdown = ({ user, onLogout, onNavigateToProfile, onNavigateToSettings }: { user: UserProfile; onLogout: () => void; onNavigateToProfile: () => void; onNavigateToSettings: () => void; }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);
    
    const defaultAvatar = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#a0aec0"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>')}`;
    const displayName = user?.name?.split(' ')[0] || 'Usuário';
    const fullName = user?.name || 'Usuário Loccus';
    const userEmail = user?.email || '';
    const avatarUrl = user?.picture || defaultAvatar;

    return (
        <div className="profile-dropdown" ref={dropdownRef}>
            <button className="profile-toggle" onClick={() => setIsOpen(!isOpen)} aria-haspopup="true" aria-expanded={isOpen}>
                <img src={avatarUrl} alt={`Foto de ${fullName}`} className="profile-avatar" />
                <div className="profile-user-info">
                    <span className="profile-name">{displayName}</span>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="profile-chevron-icon"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            {isOpen && (
                <div className="dropdown-menu">
                    <div className="dropdown-header">
                        <strong>{fullName}</strong>
                        <span>{userEmail}</span>
                    </div>
                    <button className="dropdown-item" onClick={() => { onNavigateToProfile(); setIsOpen(false); }}>
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                        Meu Perfil
                    </button>
                    <button className="dropdown-item" onClick={() => { onNavigateToSettings(); setIsOpen(false); }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2l.15-.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                        Configurações
                    </button>
                    <button className="dropdown-item" onClick={onLogout}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                        Sair
                    </button>
                </div>
            )}
        </div>
    );
};


// Componente do Dashboard
const DashboardPage = ({ onNavigateToApp, onLogout, history, theme, toggleTheme, userProfile, onNavigateToProfile, onNavigateToSettings, onNavigateToProposalsList, onNavigateToProposalBuilder, onUpdateHistoryItem, onDeleteHistoryItem, onNavigateToServiceLibrary }: { onNavigateToApp: () => void; onLogout: () => void; history: AnalysisHistoryItem[], theme: string, toggleTheme: () => void, userProfile: UserProfile | null, onNavigateToProfile: () => void; onNavigateToSettings: () => void; onNavigateToProposalsList: () => void; onNavigateToProposalBuilder: (analysis: AnalysisHistoryItem) => void; onUpdateHistoryItem: (item: AnalysisHistoryItem) => void; onDeleteHistoryItem: (id: string) => void; onNavigateToServiceLibrary: () => void; }) => {
    const [filter, setFilter] = useState('all'); // 'all', 'week', 'month', 'custom'
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
            results = results.filter(item => 
                item.companyName.toLowerCase().includes(searchTerm.toLowerCase())
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
    
    const dateToYyyyMmDd = (date: Date) => {
        const d = new Date(date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    const handleSaveEdit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingItem) {
            onUpdateHistoryItem(editingItem);
            setEditingItem(null);
        }
    };
    
    if (viewingAnalysis) {
        return (
            <>
                <header className="dashboard-header">
                    <h1>Análise: {viewingAnalysis.companyName}</h1>
                </header>
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
                <h2>Histórico de Análises</h2>
                <div className="history-search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"></path></svg>
                    <input 
                        type="text" 
                        placeholder="Pesquisar por nome da empresa..." 
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
                                {editingItem?.id === item.id ? (
                                    <form className="history-item-edit-form" onSubmit={handleSaveEdit}>
                                        <div className="input-group">
                                            <input
                                                type="text"
                                                value={editingItem.companyName}
                                                onChange={(e) => setEditingItem(prev => prev ? { ...prev, companyName: e.target.value } : null)}
                                                required
                                            />
                                        </div>
                                        <div className="input-group">
                                            <input
                                                type="date"
                                                value={dateToYyyyMmDd(editingItem.date)}
                                                onChange={(e) => setEditingItem(prev => prev ? { ...prev, date: new Date(e.target.value + 'T00:00:00') } : null)}
                                                required
                                            />
                                        </div>
                                        <div className="history-card-actions">
                                            <button type="submit" className="history-card-button">Salvar</button>
                                            <button type="button" className="history-card-button btn-secondary" onClick={() => setEditingItem(null)}>Cancelar</button>
                                        </div>
                                    </form>
                                ) : (
                                    <>
                                        <div className="history-card-header">
                                            <h3 className="history-card-company">{item.companyName}</h3>
                                            <span className="history-card-date">{item.date.toLocaleDateString('pt-BR')}</span>
                                        </div>
                                        <p className="history-card-summary">
                                            {generateHistoryItemSummary(item)}
                                        </p>
                                        <div className="history-card-actions">
                                            <button className="btn-icon btn-edit" title="Editar Análise" onClick={() => setEditingItem({ ...item })}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                            <button className="btn-icon btn-delete" title="Excluir Análise" onClick={() => {
                                                if (window.confirm(`Tem certeza que deseja excluir a análise de "${item.companyName}"?`)) {
                                                    onDeleteHistoryItem(item.id);
                                                }
                                            }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                            <button className="history-card-button" onClick={() => setViewingAnalysis(item)}>
                                                Ver Detalhes
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state">
                        <div className="empty-state-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        </div>
                        <h3>Nenhuma análise encontrada</h3>
                        <p>
                           {searchTerm 
                                ? `Nenhum resultado para "${searchTerm}". Tente uma pesquisa diferente.`
                                : 'Parece que você ainda não fez nenhuma análise. Comece agora para ver seu histórico aqui.'
                            }
                        </p>
                        <button className="btn-primary" onClick={onNavigateToApp}>
                            Fazer minha primeira análise
                        </button>
                    </div>
                )}
            </div>
        </main>
    </>
    );
};

const BarChart = ({ data, title, highlightLabel }: { data: { label: string, value: number }[], title: string, highlightLabel: string }) => {
    if (!data || data.length === 0) return null;

    const maxLabelLength = Math.max(...data.map(d => d.label.length));
    const leftPadding = maxLabelLength * 7; // Dynamically set padding based on the longest label
    const barAreaWidth = 300; // Fixed width for the bars area
    const rightPadding = 40; // Space for value text
    const width = leftPadding + barAreaWidth + rightPadding; // Calculate total width dynamically

    const topPadding = 20;
    const bottomPadding = 20;
    const barHeight = 25;
    const barSpacing = 20;
    const height = data.length * (barHeight + barSpacing) + topPadding + bottomPadding;
    
    const maxValue = Math.max(...data.map(d => d.value), 0);
    // Scale function is now based on the consistent bar area width
    const xScale = (value: number) => (value / maxValue) * barAreaWidth;

    return (
        <div className="chart-container">
            <h4>{title}</h4>
            <div className="bar-chart">
                <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                    <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={height - bottomPadding} className="axis-line" />
                    {data.map((d, i) => {
                        const y = i * (barHeight + barSpacing) + topPadding;
                        const barWidth = d.value >= 0 ? xScale(d.value) : 0;
                        const isHighlight = d.label === highlightLabel;

                        return (
                            <g key={d.label}>
                                <text x={leftPadding - 8} y={y + barHeight / 2} dy=".35em" className="bar-label">
                                    <title>{d.label}</title>
                                    {d.label}
                                </text>
                                <rect 
                                    x={leftPadding} 
                                    y={y} 
                                    width={barWidth} 
                                    height={barHeight} 
                                    className={`bar ${isHighlight ? 'highlight' : ''}`} 
                                    rx="4" 
                                    ry="4"
                                />
                                <text x={leftPadding + barWidth + 5} y={y + barHeight / 2} dy=".35em" className="bar-value">
                                    {d.value.toLocaleString('pt-BR')}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};


// Componente reutilizável para exibir os resultados da análise
const AnalysisResultDisplay = ({ result, onGenerateProposal }: { result: AnalysisHistoryItem; onGenerateProposal?: (result: AnalysisHistoryItem) => void; }) => {
    const [copyButtonText, setCopyButtonText] = useState('Copiar');
    
    const sanitizeHashtags = (rawText: string): string[] => {
        if (!rawText) return [];
        const potentialTags = rawText.match(/#\S+/g) || [];
        const sanitized = potentialTags
            .map(tag => {
                const cleanedTagName = tag.substring(1).replace(/[^a-zA-Z0-9À-ú]/g, '');
                return cleanedTagName ? `#${cleanedTagName.toLowerCase()}` : null;
            })
            .filter((tag): tag is string => tag !== null && tag.length > 1);
        return [...new Set(sanitized)];
    };
    
    const handleCopyHashtags = (tags: string) => {
        const cleanedHashtags = sanitizeHashtags(tags);
        if (cleanedHashtags.length === 0) {
            setCopyButtonText('Nada a copiar');
            setTimeout(() => setCopyButtonText('Copiar'), 2000);
            return;
        }
        const hashtagsToCopy = cleanedHashtags.join(' ');
            
        navigator.clipboard.writeText(hashtagsToCopy).then(() => {
            setCopyButtonText('Copiado!');
            setTimeout(() => setCopyButtonText('Copiar'), 2000);
        }).catch(err => {
            console.error('Falha ao copiar hashtags: ', err);
            setCopyButtonText('Erro!');
            setTimeout(() => setCopyButtonText('Copiar'), 2000);
        });
    };

    const renderTable = (headers: string[], data: Record<string, string>[]) => (
        <div className="table-responsive"><table><thead><tr>{headers.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{data.map((row, i) => (<tr key={i}>{headers.map(h => <td key={h}>{row[h]}</td>)}</tr>))}</tbody></table></div>
    );

    const renderSources = (chunks: GroundingChunk[]) => {
        const sources: { uri: string; title: string }[] = [];
        chunks.forEach(chunk => {
            if (chunk.web?.uri) sources.push({ uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri });
            if (chunk.maps?.uri) {
                sources.push({ uri: chunk.maps.uri, title: chunk.maps.title || chunk.maps.uri });
                chunk.maps.placeAnswerSources?.reviewSnippets?.forEach(review => {
                    if (review.uri) sources.push({ uri: review.uri, title: review.title || `Review: ${(review.snippet || '').substring(0, 50)}...` });
                });
            }
        });
        const uniqueSources = Array.from(new Map(sources.map(item => [item['uri'], item])).values());
        if (uniqueSources.length === 0) return null;
        return (<div className="card"><h3>Fontes da Pesquisa</h3><ul className="sources-list">{uniqueSources.map((s, i) => (<li key={`${s.uri}-${i}`}><a href={s.uri} target="_blank" rel="noopener noreferrer">{s.title}</a></li>))}</ul></div>);
    };
    
    const chartData = useMemo(() => {
        if (!result.tableData || result.tableData.length === 0) return { ratings: [], reviews: [] };
        const ratings = result.tableData.map(item => ({
            label: item.Nome || 'N/A',
            value: parseFloat(item.Nota?.replace(',', '.')) || 0,
        })).filter(item => item.label !== 'N/A');

        const reviews = result.tableData.map(item => ({
            label: item.Nome || 'N/A',
            value: parseInt(item.Avaliações?.replace(/\./g, '')) || 0,
        })).filter(item => item.label !== 'N/A');

        return { ratings, reviews };
    }, [result.tableData]);

    const targetCompanyName = result.tableData?.[0]?.Nome || '';


    return (
        <div className="results-container">
            <h2 className="form-headline" style={{ marginBottom: '1.5rem' }}>Análise de Presença Digital: {result.companyName}</h2>
            {onGenerateProposal && (
                 <div className="card" style={{ backgroundColor: 'var(--secondary-bg-color)' }}>
                    <div className="card-header-with-action" style={{ marginBottom: 0, alignItems: 'center' }}>
                        <div>
                            <h3 style={{ marginBottom: '0.25rem' }}>Análise Concluída!</h3>
                            <p style={{ margin: 0, color: 'var(--icon-color)' }}>Transforme estes dados em uma proposta comercial.</p>
                        </div>
                        <button className="hero-cta" style={{ padding: '0.8rem 1.5rem', flexShrink: 0 }} onClick={() => onGenerateProposal(result)}>
                           Gerar Orçamento
                        </button>
                    </div>
                </div>
            )}
            <div className="card summary-table-card"><h3>Resumo e Recomendações</h3>{renderTable(['Ponto de Análise', 'Empresa Alvo', 'Concorrência Local', 'Recomendações Chave'], result.summaryTable)}</div>
            <div className="card market-comparison-card"><h3>Comparativo de Mercado</h3>{renderTable(['Nome', 'Categoria', 'Cidade', 'Aparece nas buscas', 'Nota', 'Avaliações', 'Observações'], result.tableData)}</div>
            
            {(chartData.ratings.length > 0 || chartData.reviews.length > 0) && (
                <div className="card">
                    <h3>Visualização Gráfica</h3>
                    <div className="charts-grid">
                        {chartData.ratings.length > 0 && <BarChart data={chartData.ratings} title="Nota Média" highlightLabel={targetCompanyName} />}
                        {chartData.reviews.length > 0 && <BarChart data={chartData.reviews} title="Volume de Avaliações" highlightLabel={targetCompanyName} />}
                    </div>
                </div>
            )}

            {renderSources(result.groundingChunks || [])}
            <div className="card">
                <div className="card-title-with-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <h3>Análise Detalhada</h3>
                </div>
                {(() => {
                    const rawText = result.analysis;
                    const items = rawText.replace(/^###\s*Análise Detalhada\s*/i, '').trim().split(/\n\s*\n+/).map(item => item.trim()).filter(Boolean);

                    if (items.length === 0) return <p className="summary-text">{rawText}</p>;
                    
                    const targetCompany = result.tableData?.[0];

                    return (
                        <ul className="analysis-list">
                            {items.map((item, index) => {
                                let itemHtml = item;
                                if (targetCompany?.Nome) {
                                    const escaped = targetCompany.Nome.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                                    const regex = new RegExp(`("${escaped}")|(${escaped})`, 'gi');
                                    itemHtml = itemHtml.replace(regex, (match) => `<strong>${match}</strong>`);
                                }
                                return <li key={index}><div className="analysis-content" dangerouslySetInnerHTML={{ __html: itemHtml }} /></li>;
                            })}
                        </ul>
                    );
                })()}
            </div>
            <div className="card">
                <div className="card-title-with-icon">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.8 3.2L20.8 5.2"></path><path d="M14.6 11.2L12.8 9.4"></path><path d="M11.2 14.6L9.4 12.8"></path><path d="M3.2 18.8L5.2 20.8"></path><path d="M14.8 3.2L4.6 13.4c-.9.9-1.4 2.1-1.4 3.4v1.8c0 1.1.9 2 2 2h1.8c1.3 0 2.5-.5 3.4-1.4L20.8 9.2c-1.2-1.2-2.8-1.2-4 0z"></path><path d="M6 16l-2 2"></path><path d="M18 6l2-2"></path></svg>
                    <h3>Recomendações Estratégicas</h3>
                </div>
                {(() => {
                    const rawText = result.recommendations;
                    const items = rawText.replace(/^###\s*Recomendações Estratégicas\s*/i, '').trim().split(/\n\s*(?=\d+\.\s*)/).map(item => item.trim()).filter(Boolean).map(itemStr => {
                        const cleanedItem = itemStr.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '');
                        const parts = cleanedItem.split(/:\s*/, 2);
                        let title = null;
                        let description = cleanedItem;

                        if (parts.length > 1 && parts[0].length < 150) {
                            title = parts[0] + ':';
                            description = parts[1];
                        }
                        const targetCompany = result.tableData?.[0];
                        if (targetCompany?.Nome) {
                            const escaped = targetCompany.Nome.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                            const regex = new RegExp(`("${escaped}")|(${escaped})`, 'gi');
                            description = description.replace(regex, (match) => `<strong>${match}</strong>`);
                        }
                        return { title, description };
                    });
                    if (items.length === 0) return <p className="summary-text">{rawText}</p>;
                    return (
                        <ol className="recommendations-list">
                            {items.map((item, index) => (
                                <li key={index}><div className="recommendation-content">{item.title && <strong className="recommendation-title">{item.title}</strong>}<span dangerouslySetInnerHTML={{ __html: item.description }} /></div></li>
                            ))}
                        </ol>
                    );
                })()}
            </div>
            {result.hashtags && (
                <div className="card">
                    <div className="card-header-with-action">
                        <h3>Hashtags Estratégicas para Visibilidade</h3>
                        <button className="copy-button" type="button" onClick={() => handleCopyHashtags(result.hashtags)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            <span>{copyButtonText}</span>
                        </button>
                    </div>
                    <div className="hashtags-container">{sanitizeHashtags(result.hashtags).map((tag, index) => (<span key={index} className="hashtag-pill">{tag}</span>))}</div>
                </div>
            )}
        </div>
    );
};


// Componente da Ferramenta de Análise
const AnalysisToolPage = ({ onBack, onAnalysisComplete, theme, toggleTheme, onNavigateToProposalBuilder }: { onBack: () => void; onAnalysisComplete: (result: AnalysisResult, companyName: string) => void; theme: string, toggleTheme: () => void; onNavigateToProposalBuilder: (analysis: AnalysisHistoryItem) => void; }) => {
    const [companyName, setCompanyName] = useState('');
    const [cep, setCep] = useState('');
    const [street, setStreet] = useState('');
    const [number, setNumber] = useState('');
    const [neighborhood, setNeighborhood] = useState('');
    const [city, setCity] = useState('');
    const [state, setState] = useState('');
    const [keywords, setKeywords] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isCepLocked, setIsCepLocked] = useState(false);
    const [isCepLoading, setIsCepLoading] = useState(false);

    const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newCep = e.target.value.replace(/\D/g, '');
        setCep(newCep);
        setError(null); // Limpa erros ao digitar
    };

    const handleCepBlur = () => {
        if (cep.length > 0 && cep.length < 8) {
            setError('Formato de CEP inválido. O CEP deve conter 8 dígitos.');
        }
    };

    useEffect(() => {
        const fetchAddress = async () => {
            setIsCepLoading(true);
            setError(null); // Limpa erros anteriores antes de uma nova busca
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.ok) {
                    throw new Error('Falha na busca do CEP. Verifique sua conexão com a internet.');
                }
                const data = await response.json();
                if (data.erro) {
                    throw new Error('CEP não encontrado. Por favor, verifique o número digitado.');
                }
                setCity(data.localidade || '');
                setState(data.uf || '');
                setStreet(data.logouro || '');
                setNeighborhood(data.bairro || '');
                setIsCepLocked(true);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Não foi possível buscar o CEP. Tente novamente.');
                // Limpa campos em caso de erro
                setCity(''); setState(''); setStreet(''); setNeighborhood('');
                setIsCepLocked(false);
            } finally {
                setIsCepLoading(false);
            }
        };

        if (cep.length === 8) {
            fetchAddress();
        } else if (isCepLocked) {
            // Limpa os campos se o CEP for alterado e não tiver mais 8 dígitos
            setCity('');
            setState('');
            setStreet('');
            setNeighborhood('');
            setIsCepLocked(false);
        }
    }, [cep, isCepLocked]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        
        const keywordsArray = keywords.split(',').map(k => k.trim()).filter(Boolean);
        if (keywordsArray.length < 3) {
            setError('Por favor, insira pelo menos 3 palavras-chave.');
            return;
        }
        if (!companyName || !city || !state) { 
            setError('Por favor, preencha todos os campos de empresa e localização.'); 
            return; 
        }

        setIsLoading(true);
        setAnalysisResult(null);

        try {
            const { responseText: rawResponse, groundingChunks } = await analyzeCompanyPresence(companyName, city, state, keywordsArray, null);
            
            const mainParts = rawResponse.split(SEPARATOR_MAIN);
            if (mainParts.length < 2) throw new Error("Formato de resposta inválido: falta o separador principal.");
            const [tableDataMd, restAfterMain] = mainParts;

            const summaryParts = restAfterMain.split(SEPARATOR_SUMMARY);
            if (summaryParts.length < 2) throw new Error("Formato de resposta inválido: falta o separador de resumo.");
            const [summaryTableMd, restAfterSummary] = summaryParts;

            const recommendationParts = restAfterSummary.split(SEPARATOR_RECOMMENDATION);
            if (recommendationParts.length < 2) throw new Error("Formato de resposta inválido: falta o separador de recomendação.");
            const [analysisTextRaw, restAfterRecommendation] = recommendationParts;

            const hashtagParts = restAfterRecommendation.split(SEPARATOR_HASHTAG);
            const recommendationsTextRaw = hashtagParts[0];
            const hashtagsTextRaw = hashtagParts.length > 1 ? hashtagParts[1] : '';

            const tableData = parseMarkdownTable<CompanyData>(tableDataMd.trim());
            const summaryTable = parseMarkdownTable<SummaryPoint>(summaryTableMd.trim());
            
            const analysis = analysisTextRaw.replace(/^###\s*Análise Detalhada\s*/i, '').trim();
            const recommendations = recommendationsTextRaw.trim();
            const hashtags = hashtagsTextRaw.replace(/^###\s*Hashtags Estratégicas para Visibilidade\s*/i, '').trim();


            if (tableData.length === 0) throw new Error("Não foi possível extrair os dados da tabela.");

            const result: AnalysisResult = { 
                tableData, 
                summaryTable, 
                analysis, 
                recommendations, 
                hashtags, 
                groundingChunks 
            };
            setAnalysisResult(result);
            onAnalysisComplete(result, companyName);
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ocorreu um erro desconhecido.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <header className="app-header">
                <div className="header-title"><svg className="logo-image" viewBox="0 0 24 24" fill="var(--primary-color)"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><h1>Loccus AI</h1></div>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main>
                <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar ao Dashboard</button>
                <div className="card form-card">
                    <h2 className="form-headline">Gere uma análise local para seu cliente.</h2><p className="form-description">Preencha os dados do cliente para iniciar a análise competitiva e gerar o relatório.</p>
                    <form onSubmit={handleSubmit}>
                        <fieldset disabled={isLoading} style={{border: 0, margin: 0, padding: 0}}>
                            <div className="input-group"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2V21H22V7H12M6 19H4V17H6V19M6 15H4V13H6V15M6 11H4V9H6V11M10 19H8V17H10V19M10 15H8V13H10V15M10 11H8V9H10V11M10 7H8V5H10V7M14 19H12V17H14V19M14 15H12V13H14V15M14 11H12V9H14V11M14 7H12V5H14V7M18 19H16V17H18V19M18 15H16V13H18V15M18 11H16V9H18V11M18 7H16V5H18V7Z"></path></svg><input id="companyName" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Nome da Empresa do Cliente" required /></div>
                            <div className="input-group"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8H4V6H20V8M18 10H6V12H18V10M18 14H6V16H18V14M12 2C15.31 2 18 4.69 18 8V18H15V22H9V18H6V8C6 4.69 8.69 2 12 2Z"></path></svg><input id="cep" type="text" value={cep} onChange={handleCepChange} onBlur={handleCepBlur} placeholder="CEP (somente números)" maxLength={8} required />{isCepLoading && <div className="spinner"></div>}</div>
                            
                            <div className="address-fields-grid">
                                <div className="input-group address-street"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.65,2.85L19.26,3.46L16.41,6.31L15.8,5.7L18.65,2.85M9.78,4.22L13.22,7.66L12.5,8.38L9.06,4.94L9.78,4.22M15.53,8.31L17.65,10.43L11.83,16.25L9.7,14.12L15.53,8.31M4.93,10.59L8.37,14.03L7.66,14.75L4.22,11.31L4.93,10.59M9,15.25L11.12,17.38L8.27,20.23L7.66,19.62L9,15.25M4,22H2V20H4A2,2 0 0,0 6,18V14.5L9.5,11L11.5,13L8,16.5V18A4,4 0 0,1 4,22Z"></path></svg><input id="street" type="text" value={street} onChange={e => setStreet(e.target.value)} placeholder="Rua / Avenida" /></div>
                                <div className="input-group address-number"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15H7.5V12.5H10V15M10 10H7.5V7.5H10V10M12.5 15H15V12.5H12.5V15M12.5 10H15V7.5H12.5V10M17.5 10H20V7.5H17.5V10M17.5 15H20V12.5H17.5V15M5 20H2V3H5V5H16.5V3H19.5V20H16.5V18H5V20M5 15H2V12.5H5V15M5 10H2V7.5H5V10Z"></path></svg><input id="number" type="text" value={number} onChange={e => setNumber(e.target.value)} placeholder="Número" /></div>
                                <div className="input-group address-neighborhood"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12,3L2,12H5V20H19V12H22L12,3M12,7.7L14.7,10H9.3L12,7.7Z"></path></svg><input id="neighborhood" type="text" value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" /></div>
                                <div className="input-group address-city"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14.94 15.5L12 17.07L9.06 15.5L5 17V5L9.06 3.5L12 5.07L14.94 3.5L19 5V17L14.94 15.5M14.25 5.59L12 6.5L9.75 5.59L7 6.5V15L9.75 13.59L12 14.5L14.25 13.59L17 15V6.5L14.25 5.59Z"></path></svg><input id="city" type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" required readOnly={isCepLocked}/></div>
                                <div className="input-group address-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><input id="state" type="text" value={state} onChange={e => setState(e.target.value)} placeholder="UF" maxLength={2} required readOnly={isCepLocked} /></div>
                            </div>

                            <div className="input-group"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2C7 5 5 7 5 9.5S7 14 9.5 14 14 12 14 9.5 12 5 9.5 5Z"></path></svg><input id="keywords" type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Mínimo 3 palavras-chave (ex: pizzaria, delivery, forno a lenha)" required /></div>
                            <button type="submit" className={isLoading ? 'is-loading' : ''}>{isLoading ? 'ANALISANDO...' : 'GERAR ANÁLISE'}</button>
                        </fieldset>
                    </form>
                </div>
                {error && <div className="card error-box">{error}</div>}
                {isLoading && !analysisResult && <LoadingSkeleton />}
                {!isLoading && analysisResult && <AnalysisResultDisplay result={{id: '', date: new Date(), companyName, ...analysisResult}} onGenerateProposal={onNavigateToProposalBuilder} />}
            </main>
        </>
    );
};

// Nova Página de Perfil
const ProfilePage = ({ userProfile, onUpdateProfile, onBack, theme, toggleTheme }: { userProfile: UserProfile; onUpdateProfile: (profile: UserProfile) => void; onBack: () => void; theme: string, toggleTheme: () => void; }) => {
    const [formData, setFormData] = useState(userProfile);
    const [isCepLoading, setIsCepLoading] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        setFormData(userProfile);
    }, [userProfile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        
        // Apply masks
        if (id === 'cep') {
            const onlyNums = value.replace(/\D/g, '');
            setFormData(prev => ({ ...prev, [id]: onlyNums }));
            if (onlyNums.length !== 8) setCepError(null);
        } else if (id === 'phone') {
            const onlyNums = value.replace(/\D/g, '');
            let masked = onlyNums;

            // Apply mask as user types
            if (onlyNums.length > 0) {
                masked = '(' + onlyNums.substring(0, 2);
            }
            if (onlyNums.length > 2) {
                const splitPoint = onlyNums.length > 10 ? 7 : 6; 
                masked += ') ' + onlyNums.substring(2, splitPoint);
                if (onlyNums.length > splitPoint) {
                    masked += '-' + onlyNums.substring(splitPoint, 11);
                }
            }
            
            setFormData(prev => ({ ...prev, [id]: masked }));
        } else {
            setFormData(prev => ({ ...prev, [id]: value }));
        }
    };

    useEffect(() => {
        const fetchAddress = async () => {
            if (!formData.cep || formData.cep.length !== 8) return;
            setIsCepLoading(true);
            setCepError(null);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${formData.cep}/json/`);
                if (!response.ok) throw new Error('Falha na busca do CEP.');
                const data = await response.json();
                if (data.erro) throw new Error('CEP não encontrado.');
                setFormData(prev => ({
                    ...prev,
                    city: data.localidade || '',
                    state: data.uf || '',
                    street: data.logouro || '',
                    neighborhood: data.bairro || '',
                }));
            } catch (err) {
                setCepError(err instanceof Error ? err.message : 'Não foi possível buscar o CEP.');
            } finally {
                setIsCepLoading(false);
            }
        };
        fetchAddress();
    }, [formData.cep]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        onUpdateProfile(formData);
        setTimeout(() => setSaveStatus('saved'), 500);
        setTimeout(() => setSaveStatus('idle'), 2500);
    };

    return (
        <>
            <header className="app-header">
                <div className="header-title"><h1>Meu Perfil</h1></div>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main>
                <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar ao Dashboard</button>
                <div className="card form-card">
                    <h2 className="form-headline">Informações do Perfil</h2>
                    <p className="form-description">Mantenha seus dados atualizados. Eles poderão ser usados futuramente para personalizar relatórios.</p>
                    <form onSubmit={handleSubmit}>
                        <div className="input-group">
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z"></path></svg>
                            <input id="name" type="text" value={formData.name || ''} onChange={handleInputChange} placeholder="Insira aqui o seu nome ou o nome da sua empresa" />
                        </div>
                        <div className="input-group">
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6M20 6L12 11L4 6H20M20 18H4V8L12 13L20 8V18Z"></path></svg>
                            <input id="email" type="email" value={formData.email || ''} readOnly disabled style={{cursor: 'not-allowed'}}/>
                        </div>
                        <div className="input-group">
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z"></path></svg>
                           <input id="phone" type="tel" value={formData.phone || ''} onChange={handleInputChange} placeholder="Telefone (ex: (11) 98765-4321)" maxLength={15} />
                        </div>
                         <div className="input-group">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8H4V6H20V8M18 10H6V12H18V10M18 14H6V16H18V14M12 2C15.31 2 18 4.69 18 8V18H15V22H9V18H6V8C6 4.69 8.69 2 12 2Z"></path></svg>
                            <input id="cep" type="text" value={formData.cep || ''} onChange={handleInputChange} placeholder="CEP (somente números)" maxLength={8} />
                            {isCepLoading && <div className="spinner"></div>}
                        </div>
                        {cepError && <p style={{ color: 'red', fontSize: '0.8rem', marginTop: '-1rem', marginBottom: '1rem' }}>{cepError}</p>}
                        <div className="address-fields-grid">
                            <div className="input-group address-street"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.65,2.85L19.26,3.46L16.41,6.31L15.8,5.7L18.65,2.85M9.78,4.22L13.22,7.66L12.5,8.38L9.06,4.94L9.78,4.22M15.53,8.31L17.65,10.43L11.83,16.25L9.7,14.12L15.53,8.31M4.93,10.59L8.37,14.03L7.66,14.75L4.22,11.31L4.93,10.59M9,15.25L11.12,17.38L8.27,20.23L7.66,19.62L9,15.25M4,22H2V20H4A2,2 0 0,0 6,18V14.5L9.5,11L11.5,13L8,16.5V18A4,4 0 0,1 4,22Z"></path></svg><input id="street" type="text" value={formData.street || ''} onChange={handleInputChange} placeholder="Rua / Avenida" /></div>
                            <div className="input-group address-number"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15H7.5V12.5H10V15M10 10H7.5V7.5H10V10M12.5 15H15V12.5H12.5V15M12.5 10H15V7.5H12.5V10M17.5 10H20V7.5H17.5V10M17.5 15H20V12.5H17.5V15M5 20H2V3H5V5H16.5V3H19.5V20H16.5V18H5V20M5 15H2V12.5H5V15M5 10H2V7.5H5V10Z"></path></svg><input id="number" type="text" value={formData.number || ''} onChange={handleInputChange} placeholder="Número" /></div>
                            <div className="input-group address-neighborhood"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12,3L2,12H5V20H19V12H22L12,3M12,7.7L14.7,10H9.3L12,7.7Z"></path></svg><input id="neighborhood" type="text" value={formData.neighborhood || ''} onChange={handleInputChange} placeholder="Bairro" /></div>
                            <div className="input-group address-city"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14.94 15.5L12 17.07L9.06 15.5L5 17V5L9.06 3.5L12 5.07L14.94 3.5L19 5V17L14.94 15.5M14.25 5.59L12 6.5L9.75 5.59L7 6.5V15L9.75 13.59L12 14.5L14.25 13.59L17 15V6.5L14.25 5.59Z"></path></svg><input id="city" type="text" value={formData.city || ''} onChange={handleInputChange} placeholder="Cidade" readOnly /></div>
                            <div className="input-group address-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><input id="state" type="text" value={formData.state || ''} onChange={handleInputChange} placeholder="UF" maxLength={2} readOnly /></div>
                        </div>
                        <button type="submit" disabled={saveStatus === 'saving'}>
                            {saveStatus === 'saving' ? 'SALVANDO...' : saveStatus === 'saved' ? 'SALVO COM SUCESSO!' : 'SALVAR ALTERAÇÕES'}
                        </button>
                    </form>
                </div>
            </main>
        </>
    );
};

// Nova Página de Configurações
const SettingsPage = ({ userProfile, onUpdateProfile, onBack, theme, toggleTheme, onNavigateToServiceLibrary }: { userProfile: UserProfile; onUpdateProfile: (profile: UserProfile) => void; onBack: () => void; theme: string, toggleTheme: () => void; onNavigateToServiceLibrary: () => void; }) => {
    const [formData, setFormData] = useState(userProfile);
    const [isCompanyCepLoading, setIsCompanyCepLoading] = useState(false);
    const [companyCepError, setCompanyCepError] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        setFormData(userProfile);
    }, [userProfile]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { id, value } = e.target;
        const onlyNums = value.replace(/\D/g, '');

        if (id === 'companyCnpj') {
            let masked = onlyNums.substring(0, 14);
            if (masked.length > 12) {
                masked = `${masked.slice(0, 2)}.${masked.slice(2, 5)}.${masked.slice(5, 8)}/${masked.slice(8, 12)}-${masked.slice(12)}`;
            } else if (masked.length > 8) {
                masked = `${masked.slice(0, 2)}.${masked.slice(2, 5)}.${masked.slice(5, 8)}/${masked.slice(8)}`;
            } else if (masked.length > 5) {
                masked = `${masked.slice(0, 2)}.${masked.slice(2, 5)}.${masked.slice(5)}`;
            } else if (masked.length > 2) {
                masked = `${masked.slice(0, 2)}.${masked.slice(2)}`;
            }
            setFormData(prev => ({ ...prev!, [id]: masked }));
        } else if (id === 'companyPhone') {
            let masked = onlyNums.substring(0, 11);
            if (masked.length > 10) {
                 masked = `(${masked.slice(0, 2)}) ${masked.slice(2, 7)}-${masked.slice(7)}`;
            } else if (masked.length > 6) {
                masked = `(${masked.slice(0, 2)}) ${masked.slice(2, 6)}-${masked.slice(6)}`;
            } else if (masked.length > 2) {
                masked = `(${masked.slice(0, 2)}) ${masked.slice(2)}`;
            } else if (masked.length > 0) {
                 masked = `(${masked}`;
            }
            setFormData(prev => ({ ...prev!, [id]: masked }));
        } else if (id === 'companyCep') {
            setFormData(prev => ({ ...prev!, [id]: onlyNums }));
        } else {
            setFormData(prev => ({ ...prev!, [id]: value }));
        }
    };

    useEffect(() => {
        const fetchAddress = async () => {
            const cep = formData.companyCep?.replace(/\D/g, '');
            if (!cep || cep.length !== 8) return;
            setIsCompanyCepLoading(true);
            setCompanyCepError(null);
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.ok) throw new Error('Falha na busca do CEP.');
                const data = await response.json();
                if (data.erro) throw new Error('CEP não encontrado.');
                setFormData(prev => ({
                    ...prev!,
                    companyCity: data.localidade || '',
                    companyState: data.uf || '',
                    companyStreet: data.logouro || '',
                    companyNeighborhood: data.bairro || '',
                }));
            } catch (err) {
                setCompanyCepError(err instanceof Error ? err.message : 'Não foi possível buscar o CEP.');
            } finally {
                setIsCompanyCepLoading(false);
            }
        };
        fetchAddress();
    }, [formData.companyCep]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaveStatus('saving');
        onUpdateProfile(formData);
        setTimeout(() => setSaveStatus('saved'), 500);
        setTimeout(() => setSaveStatus('idle'), 2500);
    };

    return (
        <>
            <header className="app-header">
                <div className="header-title"><h1>Configurações</h1></div>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main>
                <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar ao Dashboard</button>
                <div className="card form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="settings-section">
                            <h3>Dados da Sua Empresa</h3>
                            <p className="form-description" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
                                Preencha os dados da sua agência ou empresa. Eles serão usados para personalizar seus orçamentos.
                            </p>
                            <div className="input-group">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7V3H2V21H22V7H12M6 19H4V17H6V19M6 15H4V13H6V15M6 11H4V9H6V11M10 19H8V17H10V19M10 15H8V13H10V15M10 11H8V9H10V11M10 7H8V5H10V7M14 19H12V17H14V19M14 15H12V13H14V15M14 11H12V9H14V11M14 7H12V5H14V7M18 19H16V17H18V19M18 15H16V13H18V15M18 11H16V9H18V11M18 7H16V5H18V7Z"></path></svg>
                                <input id="companyName" type="text" value={formData.companyName || ''} onChange={handleInputChange} placeholder="Nome da sua empresa" />
                            </div>
                            <div className="input-group">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20,6H4V4H20V6M20,12H4V10H20V12M20,18H4V16H20V18Z" /></svg>
                                <input id="companyCnpj" type="text" value={formData.companyCnpj || ''} onChange={handleInputChange} placeholder="CNPJ (ex: 00.000.000/0000-00)" maxLength={18} />
                            </div>
                            <div className="input-group">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6M20 6L12 11L4 6H20M20 18H4V8L12 13L20 8V18Z"></path></svg>
                                <input id="companyEmail" type="email" value={formData.companyEmail || ''} onChange={handleInputChange} placeholder="E-mail da empresa" />
                            </div>
                            <div className="input-group">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6.62,10.79C8.06,13.62 10.38,15.94 13.21,17.38L15.41,15.18C15.69,14.9 16.08,14.82 16.43,14.93C17.55,15.3 18.75,15.5 20,15.5A1,1 0 0,1 21,16.5V20A1,1 0 0,1 20,21A17,17 0 0,1 3,4A1,1 0 0,1 4,3H7.5A1,1 0 0,1 8.5,4C8.5,5.25 8.7,6.45 9.07,7.57C9.18,7.92 9.1,8.31 8.82,8.59L6.62,10.79Z"></path></svg>
                                <input id="companyPhone" type="tel" value={formData.companyPhone || ''} onChange={handleInputChange} placeholder="Telefone da empresa" maxLength={15} />
                            </div>
                            <div className="input-group">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 8H4V6H20V8M18 10H6V12H18V10M18 14H6V16H18V14M12 2C15.31 2 18 4.69 18 8V18H15V22H9V18H6V8C6 4.69 8.69 2 12 2Z"></path></svg>
                                <input id="companyCep" type="text" value={formData.companyCep || ''} onChange={handleInputChange} placeholder="CEP da empresa (só números)" maxLength={8} />
                                {isCompanyCepLoading && <div className="spinner"></div>}
                            </div>
                            {companyCepError && <p style={{ color: 'var(--danger-color)', fontSize: '0.8rem', marginTop: '-1rem', marginBottom: '1rem' }}>{companyCepError}</p>}
                            <div className="address-fields-grid">
                                <div className="input-group address-street"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.65,2.85L19.26,3.46L16.41,6.31L15.8,5.7L18.65,2.85M9.78,4.22L13.22,7.66L12.5,8.38L9.06,4.94L9.78,4.22M15.53,8.31L17.65,10.43L11.83,16.25L9.7,14.12L15.53,8.31M4.93,10.59L8.37,14.03L7.66,14.75L4.22,11.31L4.93,10.59M9,15.25L11.12,17.38L8.27,20.23L7.66,19.62L9,15.25M4,22H2V20H4A2,2 0 0,0 6,18V14.5L9.5,11L11.5,13L8,16.5V18A4,4 0 0,1 4,22Z"></path></svg><input id="companyStreet" type="text" value={formData.companyStreet || ''} onChange={handleInputChange} placeholder="Rua / Avenida" readOnly /></div>
                                <div className="input-group address-number"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M10 15H7.5V12.5H10V15M10 10H7.5V7.5H10V10M12.5 15H15V12.5H12.5V15M12.5 10H15V7.5H12.5V10M17.5 10H20V7.5H17.5V10M17.5 15H20V12.5H17.5V15M5 20H2V3H5V5H16.5V3H19.5V20H16.5V18H5V20M5 15H2V12.5H5V15M5 10H2V7.5H5V10Z"></path></svg><input id="companyNumber" type="text" value={formData.companyNumber || ''} onChange={handleInputChange} placeholder="Número" /></div>
                                <div className="input-group address-neighborhood"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12,3L2,12H5V20H19V12H22L12,3M12,7.7L14.7,10H9.3L12,7.7Z"></path></svg><input id="companyNeighborhood" type="text" value={formData.companyNeighborhood || ''} onChange={handleInputChange} placeholder="Bairro" readOnly /></div>
                                <div className="input-group address-city"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14.94 15.5L12 17.07L9.06 15.5L5 17V5L9.06 3.5L12 5.07L14.94 3.5L19 5V17L14.94 15.5M14.25 5.59L12 6.5L9.75 5.59L7 6.5V15L9.75 13.59L12 14.5L14.25 13.59L17 15V6.5L14.25 5.59Z"></path></svg><input id="companyCity" type="text" value={formData.companyCity || ''} onChange={handleInputChange} placeholder="Cidade" readOnly /></div>
                                <div className="input-group address-state"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22S19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5A2.5 2.5 0 0 1 9.5 9A2.5 2.5 0 0 1 12 6.5A2.5 2.5 0 0 1 14.5 9A2.5 2.5 0 0 1 12 11.5Z"></path></svg><input id="companyState" type="text" value={formData.companyState || ''} onChange={handleInputChange} placeholder="UF" maxLength={2} readOnly /></div>
                            </div>
                            <button type="submit" disabled={saveStatus === 'saving'}>
                                {saveStatus === 'saving' ? 'SALVANDO...' : saveStatus === 'saved' ? 'DADOS SALVOS!' : 'SALVAR DADOS DA EMPRESA'}
                            </button>
                        </div>
                    </form>
                    <div className="settings-section">
                        <h3>Biblioteca de Serviços</h3>
                        <p className="form-description" style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
                            Gerencie os serviços usados com frequência para adicioná-los rapidamente aos seus orçamentos em uma página dedicada.
                        </p>
                        <div className="add-service-actions" style={{justifyContent: 'flex-start'}}>
                             <button type="button" className="add-service-btn" onClick={onNavigateToServiceLibrary}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                                Gerenciar minha biblioteca
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </>
    );
};

// Nova Página da Biblioteca de Serviços
const ServiceLibraryPage = ({ userProfile, onUpdateProfile, onBack, theme, toggleTheme }: { userProfile: UserProfile; onUpdateProfile: (profile: UserProfile) => void; onBack: () => void; theme: string, toggleTheme: () => void; }) => {
    const [services, setServices] = useState<ServiceLibraryItem[]>(() => {
        return userProfile?.serviceLibrary ? JSON.parse(JSON.stringify(userProfile.serviceLibrary)) : [];
    });
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    const handleServiceChange = (id: string, field: 'description' | 'price', value: string) => {
        setServices(currentServices =>
            currentServices.map(item => {
                if (item.id !== id) return item;

                if (field === 'price') {
                    const digits = value.replace(/\D/g, '');
                    const numericValue = Number(digits) / 100;
                    return { ...item, price: isNaN(numericValue) ? 0 : numericValue };
                }
                
                return { ...item, description: value };
            })
        );
    };

    const addService = (type: 'one-time' | 'recurring') => {
        const newItem: ServiceLibraryItem = {
            id: `lib-service-${Date.now()}`,
            description: '',
            price: 0,
            type,
        };
        setServices(currentServices => [...currentServices, newItem]);
    };

    const removeService = (id: string) => {
        if (window.confirm("Tem certeza que deseja remover este serviço da sua biblioteca?")) {
            setServices(currentServices => currentServices.filter(item => item.id !== id));
        }
    };

    const handleSave = () => {
        setSaveStatus('saving');
        const updatedProfile: UserProfile = {
            ...userProfile!,
            serviceLibrary: services
        };
        onUpdateProfile(updatedProfile);

        setTimeout(() => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
        }, 500);
    };

    return (
        <>
            <header className="app-header">
                <div className="header-title"><h1>Biblioteca de Serviços</h1></div>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main>
                <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar ao Dashboard</button>
                <div className="card form-card">
                    <p className="form-description" style={{marginTop: 0, marginBottom: '2rem'}}>
                        Salve serviços usados com frequência para adicioná-los rapidamente aos seus orçamentos. As alterações são salvas ao clicar no botão no final da página.
                    </p>
                    <div className="services-list" style={{gap: '1rem'}}>
                        {services.map((service) => (
                            <div key={service.id} className="service-item" style={{padding: '0.75rem'}}>
                                <div className="service-item-main">
                                    <div className="input-group">
                                        <textarea
                                            placeholder="Descrição do serviço"
                                            value={service.description}
                                            rows={1}
                                            onChange={(e) => {
                                                e.target.style.height = 'auto';
                                                e.target.style.height = `${e.target.scrollHeight}px`;
                                                handleServiceChange(service.id, 'description', e.target.value);
                                            }}
                                        />
                                    </div>
                                    <span className={`service-type-badge ${service.type}`}>
                                        {service.type === 'one-time' ? 'Pagamento Único' : 'Mensalidade'}
                                    </span>
                                </div>
                                <div className="service-item-side">
                                    <div className="input-group service-price-input">
                                        <input
                                            type="text"
                                            placeholder="R$ 0,00"
                                            value={service.price > 0 ? service.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
                                            onChange={(e) => handleServiceChange(service.id, 'price', e.target.value)}
                                        />
                                    </div>
                                    <button type="button" className="remove-service-btn" onClick={() => removeService(service.id)} aria-label="Remover serviço da biblioteca">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                        {services.length === 0 && <p style={{color: 'var(--icon-color)', fontSize: '0.9rem', textAlign: 'center', padding: '1rem 0'}}>Sua biblioteca está vazia. Adicione seu primeiro serviço abaixo.</p>}
                    </div>
                    <div className="add-service-actions" style={{ marginTop: '2rem' }}>
                        <button type="button" className="add-service-btn" onClick={() => addService('one-time')}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Adicionar Serviço Único
                        </button>
                        <button type="button" className="add-service-btn" onClick={() => addService('recurring')}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            Adicionar Serviço Recorrente
                        </button>
                    </div>
                    <button type="button" onClick={handleSave} disabled={saveStatus === 'saving'} style={{marginTop: '2rem', width: '100%', padding: '14px'}}>
                        {saveStatus === 'saving' ? 'SALVANDO...' : saveStatus === 'saved' ? 'BIBLIOTECA SALVA!' : 'SALVAR ALTERAÇÕES NA BIBLIOTECA'}
                    </button>
                </div>
            </main>
        </>
    );
};

// Novo componente para o Modal de Preview do PDF
const PdfPreviewModal = ({ url, fileName, onClose }: { url: string; fileName: string; onClose: () => void; }) => {
    
    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div className="pdf-preview-overlay" onClick={onClose}>
            <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
                <div className="pdf-preview-header">
                    <h3>Revisão do Orçamento</h3>
                    <div className="pdf-preview-actions">
                         <button className="pdf-download-btn" onClick={handleDownload}>Baixar PDF</button>
                         <button className="pdf-close-btn" onClick={onClose}>Fechar</button>
                    </div>
                </div>
                <div className="pdf-preview-body">
                    <iframe src={url} title="Pré-visualização do PDF" />
                </div>
            </div>
        </div>
    );
};


// Componente Principal da Aplicação
const App: React.FC = () => {
    type View = 'landing' | 'login' | 'dashboard' | 'app' | 'profile' | 'settings' | 'proposalsList' | 'proposalBuilder' | 'serviceLibrary';

    const [theme, setTheme] = useLocalStorage<string>('theme', (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'));
    
    // Define o estado inicial para pular o login e ir direto para o dashboard
    const [session, setSession] = useState<Session | null>({ user: { id: 'local_user', email: 'local@user.com' } } as any);
    const [currentView, setCurrentView] = useState<View>('dashboard');

    // States geridos por Local Storage ou Supabase
    const [userProfile, setUserProfile] = useLocalStorage<UserProfile | null>('loccus_userProfile', null);
    const [analysisHistory, setAnalysisHistory] = useLocalStorage<AnalysisHistoryItem[]>('loccus_analysisHistory', []);
    const [proposalsHistory, setProposalsHistory] = useLocalStorage<Proposal[]>('loccus_proposalsHistory', []);

    const [activeAnalysisForProposal, setActiveAnalysisForProposal] = useState<AnalysisHistoryItem | null>(null);

    // Gerencia a troca de tema e a classe no body
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        document.body.classList.toggle('page-visible', ['landing', 'login'].includes(currentView));
    }, [theme, currentView]);

    const toggleTheme = () => setTheme(p => (p === 'dark' ? 'light' : 'dark'));

    // Lógica de inicialização para o modo Local Storage
    useEffect(() => {
        // Apenas garante que um perfil de usuário exista no modo local, sem alterar a visão
        if (!userProfile) {
            setUserProfile({ id: 'local_user', name: 'Usuário Local', email: 'local@user.com', picture: '' });
        }
    }, []);

    // Busca dados do Supabase (atualmente desabilitado)
    const fetchProfileAndData = async (userId: string, currentSession: Session) => {
        if (!supabase) return;
        try {
            // Perfil
            let { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
            if (!profile) {
                const { data: newProfile } = await supabase.from('profiles').insert({ id: userId, name: currentSession.user.user_metadata?.name || currentSession.user.email, email: currentSession.user.email, picture: currentSession.user.user_metadata?.picture }).select().single();
                profile = newProfile;
            }
            setUserProfile(profile);

            // Análises e Propostas
            const { data: analyses } = await supabase.from('analyses').select('*').eq('user_id', userId).order('date', { ascending: false });
            setAnalysisHistory(analyses || []);
            const { data: proposals } = await supabase.from('proposals').select('*').eq('user_id', userId).order('createdAt', { ascending: false });
            setProposalsHistory(proposals || []);

        } catch (error) { console.error("Erro ao buscar dados:", error); }
    };
    
    // --- FUNÇÕES DE MANIPULAÇÃO DE DADOS (SUPABASE/LOCAL) ---

    const handleLogout = async () => {
        if (supabase) {
            await supabase.auth.signOut();
        } else {
            setSession(null);
            setCurrentView('landing'); // Ao deslogar no modo local, volta para a landing
        }
    };

    const handleUpdateProfile = async (updatedProfile: UserProfile) => {
        if (supabase && session?.user) {
            const { id, ...updateData } = updatedProfile;
            const { data } = await supabase.from('profiles').update(updateData).eq('id', session.user.id).select().single();
            if (data) setUserProfile(data);
        } else {
            setUserProfile(updatedProfile);
        }
    };

    const handleAnalysisComplete = async (result: AnalysisResult, companyName: string) => {
        if (supabase && session?.user) {
            const newAnalysis = { ...result, companyName, date: new Date(), user_id: session.user.id };
            const { data } = await supabase.from('analyses').insert(newAnalysis).select().single();
            if (data) setAnalysisHistory(prev => [data, ...prev]);
        } else {
            const newAnalysis: AnalysisHistoryItem = { ...result, id: `local_${Date.now()}`, companyName, date: new Date() };
            setAnalysisHistory(prev => [newAnalysis, ...prev]);
        }
    };
    
    const handleUpdateHistoryItem = async (updatedItem: AnalysisHistoryItem) => {
        if (supabase) {
            const { id, ...updateData } = updatedItem;
            const { data } = await supabase.from('analyses').update(updateData).eq('id', id).select().single();
            if (data) setAnalysisHistory(prev => prev.map(item => item.id === id ? data : item));
        } else {
            setAnalysisHistory(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
        }
    };

    const handleDeleteHistoryItem = async (itemId: string) => {
        if (supabase) {
            await supabase.from('analyses').delete().eq('id', itemId);
        }
        setAnalysisHistory(prev => prev.filter(item => item.id !== itemId));
    };

    const handleSaveProposal = async (proposalData: Omit<Proposal, 'id' | 'createdAt'> & { id?: string }) => {
        if (supabase && session?.user) {
            const payload = { ...proposalData, user_id: session.user.id };
            const { data } = await supabase.from('proposals').upsert(payload).select().single();
            if (data) setProposalsHistory(prev => [data, ...prev.filter(p => p.id !== data.id)]);
        } else {
            const newOrUpdatedProposal = { ...proposalData, id: proposalData.id || `local_prop_${Date.now()}`, createdAt: proposalData.id ? proposalsHistory.find(p=>p.id === proposalData.id)!.createdAt : new Date() };
            setProposalsHistory(prev => [newOrUpdatedProposal, ...prev.filter(p => p.id !== newOrUpdatedProposal.id)]);
        }
        setCurrentView('proposalsList');
    };

    const handleDeleteProposal = async (proposalId: string) => {
        if (window.confirm("Tem certeza que deseja excluir este orçamento?")) {
            if (supabase) {
                await supabase.from('proposals').delete().eq('id', proposalId);
            }
            setProposalsHistory(prev => prev.filter(p => p.id !== proposalId));
        }
    };

    const handleUpdateProposalStatus = async (proposalId: string, newStatus: ProposalStatus) => {
        if (supabase) {
            await supabase.from('proposals').update({ status: newStatus }).eq('id', proposalId);
        }
        setProposalsHistory(prev => prev.map(p => (p.id === proposalId ? { ...p, status: newStatus } : p)));
    };
    
    const handleDuplicateProposal = (proposalId: string) => {
        const original = proposalsHistory.find(p => p.id === proposalId);
        if (!original) return;

        const { id, createdAt, ...copyData } = original;

        const duplicatedProposal: Omit<Proposal, 'id' | 'createdAt'> = {
            ...copyData,
            clientName: `${original.clientName} (Cópia)`,
            status: 'Draft',
        };

        handleSaveProposal(duplicatedProposal);
    };

    const handleNavigateToProposalBuilder = (analysis: AnalysisHistoryItem) => {
        setActiveAnalysisForProposal(analysis);
        setCurrentView('proposalBuilder');
    };
    
    const handleEditProposal = (analysisId: string) => {
        const analysis = analysisHistory.find(a => a.id === analysisId);
        if (analysis) {
            setActiveAnalysisForProposal(analysis);
            setCurrentView('proposalBuilder');
        } else {
            alert("Análise original não encontrada.");
        }
    };

    // --- RENDERIZAÇÃO ---
    
    // Placeholder Components para manter o código organizado
    const ProposalBuilderPage = ({ analysis, existingProposal, onSave, onBack, userProfile }: { analysis: AnalysisHistoryItem; existingProposal: Proposal | undefined; onSave: (proposal: any) => void; onBack: () => void; userProfile: UserProfile | null }) => {
        const [services, setServices] = useState<ProposalServiceItem[]>(() => {
            if (existingProposal?.services && existingProposal.services.length > 0) {
                return existingProposal.services;
            }
            const defaultOneTimeDescription = userProfile?.proposalOneTimeTemplate || 
                'Configuração e Otimização Completa do Perfil da Empresa no Google (Google Meu Negócio). Inclui: reivindicação do perfil, preenchimento de todas as informações comerciais, seleção de categorias, configuração de área de serviço/endereço, upload inicial de fotos e criação de posts de boas-vindas.';
                
            return [{
                id: `service-${Date.now()}`,
                description: 'Custo de Implantação',
                price: 0,
                type: 'one-time'
            }];
        });
        const [clientEmail, setClientEmail] = useState(existingProposal?.clientEmail || '');
        
        const dateToYyyyMmDd = (date: Date) => {
            const d = new Date(date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            return d.toISOString().split('T')[0];
        };

        const getDefaultExpirationDate = () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 15);
            return dateToYyyyMmDd(futureDate);
        };

        const [expiresAt, setExpiresAt] = useState<string>(() => {
            if (existingProposal?.expiresAt) {
                return dateToYyyyMmDd(new Date(existingProposal.expiresAt));
            }
            return getDefaultExpirationDate();
        });
        
        const [termsAndConditions, setTermsAndConditions] = useState<string>(
            existingProposal?.termsAndConditions || 
            'Pagamento: 50% de entrada e 50% na entrega.\nPrazo de entrega será definido após a confirmação do projeto.'
        );
        const [emailError, setEmailError] = useState('');
        const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
        const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
        const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
        const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
        const { serviceLibrary } = userProfile || { serviceLibrary: [] };

        const targetCompanyName = analysis.tableData?.[0]?.Nome || analysis.companyName;

        const handleServiceChange = (id: string, field: 'description' | 'price', value: string) => {
            setServices(currentServices =>
                currentServices.map(service => {
                    if (service.id === id) {
                        if (field === 'price') {
                            const rawValue = value.replace(/[^0-9]/g, '');
                            const numericValue = Number(rawValue) / 100;
                            return { ...service, price: isNaN(numericValue) ? 0 : numericValue };
                        }
                        return { ...service, [field]: value };
                    }
                    return service;
                })
            );
        };
    
        const addService = (type: 'one-time' | 'recurring') => {
            let defaultDescription = '';
            if (type === 'one-time') {
                defaultDescription = userProfile?.proposalOneTimeTemplate || 
                'Configuração e Otimização Completa do Perfil da Empresa no Google (Google Meu Negócio). Inclui: reivindicação do perfil, preenchimento de todas as informações comerciais, seleção de categorias, configuração de área de serviço/endereço, upload inicial de fotos e criação de posts de boas-vindas.';
            } else { // recurring
                defaultDescription = userProfile?.proposalRecurringTemplate ||
                'Gerenciamento e Manutenção Mensal do Perfil da Empresa no Google. Inclui: monitoramento de performance, postagens semanais de novidades/ofertas, upload de novas fotos, resposta a avaliações de clientes e geração de relatórios de insights (visualizações, cliques, chamadas).';
            }
            setServices(currentServices => [...currentServices, { id: `service-${Date.now()}`, description: defaultDescription, price: 0, type }]);
        };
    
        const removeService = (id: string) => {
            setServices(currentServices => currentServices.filter(service => service.id !== id));
        };
        
        const addServiceFromLibrary = (libraryItem: ServiceLibraryItem) => {
            const newService: ProposalServiceItem = {
                ...libraryItem,
                id: `service-${Date.now()}`
            };
            setServices(current => [...current, newService]);
            setIsLibraryModalOpen(false);
        };

        const { totalOneTime, totalRecurring } = useMemo(() => {
            return services.reduce((totals, service) => {
                if (service.type === 'one-time') {
                    totals.totalOneTime += service.price || 0;
                } else {
                    totals.totalRecurring += service.price || 0;
                }
                return totals;
            }, { totalOneTime: 0, totalRecurring: 0 });
        }, [services]);

        const buildProposalObject = (status: ProposalStatus) => ({
            id: existingProposal?.id,
            analysisId: analysis.id,
            clientName: analysis.companyName,
            status,
            createdAt: existingProposal?.createdAt || new Date(),
            services: services.filter(s => s.description.trim() !== '' || s.price > 0),
            totalOneTimeValue: totalOneTime,
            totalRecurringValue: totalRecurring,
            analysisResult: analysis,
            clientEmail,
            termsAndConditions,
            expiresAt: expiresAt ? new Date(expiresAt + 'T12:00:00Z') : undefined,
        });

        const handleSaveDraft = () => {
            setSaveStatus('saving');
            const proposal = buildProposalObject('Draft');
            onSave(proposal);
        };

        const handleSend = () => {
            setEmailError('');
            if (!clientEmail || !/^\S+@\S+\.\S+$/.test(clientEmail)) {
                setEmailError('Por favor, insira um e-mail válido.');
                return;
            }
            setSendStatus('sending');
            const proposal = buildProposalObject('Sent');
            
            setTimeout(() => {
                onSave(proposal);
            }, 1500);
        };
        
        const handleExportToPDF = () => {
            const doc = new jsPDF();
            const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
            const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

            // Header
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text("Proposta de Serviços", pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Cliente: ${analysis.companyName}`, 20, 35);
            doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, 42);
            doc.text(`Válido até: ${new Date(expiresAt + 'T12:00:00Z').toLocaleDateString('pt-BR')}`, 20, 49);

            // Services Table
            const tableData = services.map(s => ([
                s.description,
                s.type === 'one-time' ? 'Pagamento Único' : 'Mensalidade',
                s.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ]));

            autoTable(doc, {
                startY: 62,
                head: [['Descrição do Serviço', 'Tipo', 'Valor']],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [0, 123, 255] },
            });

            let finalY = (doc as any).lastAutoTable.finalY || 100;
            finalY += 20;
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text("Resumo de Valores", 20, finalY);

            finalY += 10;
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            doc.text("Valor de Implantação (único):", 20, finalY);
            doc.text(totalOneTime.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, finalY, { align: 'right' });

            finalY += 7;
            doc.text("Valor Mensal (recorrente):", 20, finalY);
            doc.text(totalRecurring.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pageWidth - 20, finalY, { align: 'right' });
            
            if (finalY > pageHeight - 60) {
                doc.addPage();
                finalY = 20;
            }

            if (termsAndConditions.trim()) {
                finalY += 15;
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text("Termos e Condições", 20, finalY);
                
                finalY += 8;
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                const termsLines = doc.splitTextToSize(termsAndConditions, pageWidth - 40);
                doc.text(termsLines, 20, finalY);
            }

            if (userProfile?.companyName) {
                const footerY = pageHeight - 25;
                doc.setLineWidth(0.5);
                doc.line(20, footerY, pageWidth - 20, footerY);
                
                let footerText = `${userProfile.companyName}`;
                if (userProfile.companyPhone) footerText += ` | ${userProfile.companyPhone}`;
                if (userProfile.companyCity && userProfile.companyState) footerText += ` | ${userProfile.companyCity}, ${userProfile.companyState}`;
                
                doc.setFontSize(10);
                doc.setTextColor(150);
                doc.text(footerText, pageWidth / 2, footerY + 8, { align: 'center' });
            }
            
            const pdfBlob = doc.output('blob');
            const pdfBlobUrl = URL.createObjectURL(pdfBlob);
            setPdfPreviewUrl(pdfBlobUrl);
        };

        const handleClosePdfPreview = () => {
            if (pdfPreviewUrl) {
                URL.revokeObjectURL(pdfPreviewUrl);
            }
            setPdfPreviewUrl(null);
        };

        const chartData = useMemo(() => {
            if (!analysis.tableData || analysis.tableData.length === 0) return { ratings: [], reviews: [] };
            const ratings = analysis.tableData.map(item => ({ label: item.Nome || 'N/A', value: parseFloat(item.Nota?.replace(',', '.')) || 0, })).filter(item => item.label !== 'N/A');
            const reviews = analysis.tableData.map(item => ({ label: item.Nome || 'N/A', value: parseInt(item.Avaliações?.replace(/\./g, '')) || 0, })).filter(item => item.label !== 'N/A');
            return { ratings, reviews };
        }, [analysis.tableData]);

        return (
            <>
                <header className="app-header"><div className="header-title"><h1>Gerar Orçamento</h1></div><ThemeSwitch theme={theme} toggleTheme={toggleTheme} /></header>
                <main>
                    <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar</button>
                    
                    <div className="card">
                        <h3>Proposta para: <strong>{analysis.companyName}</strong></h3>
                        <div className="input-group" style={{ marginTop: '1.5rem', marginBottom: emailError ? '0.5rem' : '1.5rem' }}>
                           <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6M20 6L12 11L4 6H20M20 18H4V8L12 13L20 8V18Z"></path></svg>
                           <input type="email" value={clientEmail} onChange={e => {setClientEmail(e.target.value); setEmailError('');}} placeholder="E-mail do cliente para contato" />
                        </div>
                        {emailError && <p style={{color: 'var(--danger-color)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>{emailError}</p>}
                        <p className="form-description" style={{marginBottom: '1rem'}}>Utilize os dados da análise abaixo para justificar os serviços propostos.</p>
                        
                        {(chartData.ratings.length > 0 || chartData.reviews.length > 0) && (
                            <div className="card" style={{backgroundColor: 'var(--secondary-bg-color)'}}>
                                <h3>Resumo Visual da Análise</h3>
                                <div className="charts-grid">
                                    {chartData.ratings.length > 0 && <BarChart data={chartData.ratings} title="Nota Média" highlightLabel={targetCompanyName} />}
                                    {chartData.reviews.length > 0 && <BarChart data={chartData.reviews} title="Volume de Avaliações" highlightLabel={targetCompanyName} />}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="card">
                         <h3>Serviços Propostos</h3>
                        <div className="services-list">
                            {services.map((service) => (
                                <div key={service.id} className="service-item">
                                    <div className="service-item-main">
                                        <div className="input-group">
                                            <textarea
                                                placeholder={`Ex: Otimização completa do Perfil GMB (Google Meu Negócio)`}
                                                value={service.description}
                                                rows={1}
                                                onChange={(e) => {
                                                    e.target.style.height = 'auto';
                                                    e.target.style.height = `${e.target.scrollHeight}px`;
                                                    handleServiceChange(service.id, 'description', e.target.value);
                                                }}
                                            />
                                        </div>
                                        <span className={`service-type-badge ${service.type}`}>
                                            {service.type === 'one-time' ? 'Pagamento Único' : 'Mensalidade'}
                                        </span>
                                    </div>
                                    <div className="service-item-side">
                                        <div className="input-group service-price-input">
                                            <input
                                                type="text"
                                                placeholder="Valor (R$)"
                                                value={service.price > 0 ? service.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''}
                                                onChange={(e) => handleServiceChange(service.id, 'price', e.target.value)}
                                            />
                                        </div>
                                        <button className="remove-service-btn" onClick={() => removeService(service.id)} aria-label="Remover serviço">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                         <div className="add-service-actions">
                             <button className="add-service-btn" onClick={() => addService('one-time')}>
                               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                               Adicionar Custo de Implantação
                            </button>
                             <button className="add-service-btn" onClick={() => addService('recurring')}>
                               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                               Adicionar Custo Mensal
                            </button>
                            <button type="button" className="add-service-btn" onClick={() => setIsLibraryModalOpen(true)}>
                               <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                               Adicionar da Biblioteca
                            </button>
                        </div>
                    </div>

                    <div className="card total-value-card">
                         <div className="total-value-group">
                             <h4>Custo de Implantação (único):</h4>
                             <span className="total-price">{totalOneTime.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                         </div>
                         <div className="total-value-group">
                             <h4>Custo Mensal (recorrente):</h4>
                             <span className="total-price">{totalRecurring.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                         </div>
                         <div className="total-value-group" style={{ borderTop: '2px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            <h4 style={{ color: 'var(--primary-color)' }}>Valor Total Inicial:</h4>
                            <span className="total-price" style={{ fontSize: '1.8rem' }}>
                                {(totalOneTime + totalRecurring).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--icon-color)', textAlign: 'right', marginTop: '-0.5rem' }}>
                            (Custo de implantação + 1ª mensalidade)
                        </p>
                    </div>
                     <div className="card">
                        <h3>Termos e Condições</h3>
                        <div className="input-group">
                            <textarea
                                value={termsAndConditions}
                                onChange={(e) => setTermsAndConditions(e.target.value)}
                                rows={4}
                                placeholder="Especifique os termos, validade da proposta, formas de pagamento, etc."
                            />
                        </div>
                    </div>
                    <div className="card email-proposal-card">
                         <h3>Validade e Envio</h3>
                         <p>Defina a data de expiração. Ao clicar em "Enviar Orçamento", um e-mail com a proposta será disparado para o e-mail do cliente informado acima.</p>
                         <div className="input-group">
                             <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H18V1H16V3H8V1H6V3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3M19 19H5V9H19V19M19 7H5V5H19V7M7 11H12V16H7V11Z"></path></svg>
                             <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} style={{ paddingLeft: '40px' }}/>
                         </div>
                    </div>
                    <div className="proposal-actions">
                        <button className="btn-secondary" onClick={handleSaveDraft} disabled={saveStatus === 'saving' || sendStatus === 'sending'}>
                            {saveStatus === 'saving' ? 'SALVANDO...' : 'Salvar como Rascunho'}
                        </button>
                        <button className="btn-secondary" onClick={handleExportToPDF} disabled={saveStatus === 'saving' || sendStatus === 'sending'}>Revisar PDF</button>
                        <button className="hero-cta" onClick={handleSend} style={{padding: '1rem 2rem'}} disabled={saveStatus === 'saving' || sendStatus === 'sending'}>
                            {sendStatus === 'sending' ? 'ENVIANDO...' : 'Enviar Orçamento'}
                        </button>
                    </div>
                </main>
                {pdfPreviewUrl && (
                    <PdfPreviewModal
                        url={pdfPreviewUrl}
                        fileName={`proposta-${analysis.companyName.replace(/\s/g, '_')}.pdf`}
                        onClose={handleClosePdfPreview}
                    />
                )}
                {isLibraryModalOpen && (
                    <div className="pdf-preview-overlay" onClick={() => setIsLibraryModalOpen(false)}>
                        <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: '700px', maxHeight: '70vh'}}>
                            <div className="pdf-preview-header">
                                <h3>Selecionar Serviço da Biblioteca</h3>
                                <button className="pdf-close-btn" onClick={() => setIsLibraryModalOpen(false)}>Fechar</button>
                            </div>
                            <div className="pdf-preview-body" style={{overflowY: 'auto', padding: '1.5rem'}}>
                                {(!serviceLibrary || serviceLibrary.length === 0) ? (
                                    <p style={{textAlign: 'center', color: 'var(--icon-color)'}}>Sua biblioteca de serviços está vazia. Adicione serviços na página de Configurações para usá-los aqui.</p>
                                ) : (
                                    <div className="proposals-list">
                                        {serviceLibrary.map(item => (
                                            <div key={item.id} className="proposal-item" style={{cursor: 'pointer'}} onClick={() => addServiceFromLibrary(item)}>
                                                <div className="proposal-item-info">
                                                    <h3 className="proposal-item-client">{item.description || 'Serviço sem descrição'}</h3>
                                                    <div className="proposal-item-meta" style={{marginTop: '0.5rem'}}>
                                                        <span>{item.type === 'one-time' ? 'Pagamento Único' : 'Mensalidade'}</span>
                                                        <span>|</span>
                                                        <span>{item.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                                                    </div>
                                                </div>
                                                <button className="hero-cta" style={{padding: '0.5rem 1rem'}} onClick={(e) => { e.stopPropagation(); addServiceFromLibrary(item); }}>Adicionar</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    };

    const ProposalsListPage = ({ proposals, onBack, onNewProposal, onEditProposal, onDeleteProposal, onUpdateProposalStatus, onDuplicateProposal, theme, toggleTheme }: { proposals: Proposal[], onBack: () => void, onNewProposal: () => void, onEditProposal: (analysisId: string) => void, onDeleteProposal: (proposalId: string) => void, onUpdateProposalStatus: (id: string, status: ProposalStatus) => void, onDuplicateProposal: (id: string) => void, theme: string, toggleTheme: () => void }) => {
        const [statusFilter, setStatusFilter] = useState<ProposalStatus | 'all'>('all');
        const [dateFilterType, setDateFilterType] = useState<'createdAt' | 'expiresAt'>('createdAt');
        const [startDate, setStartDate] = useState('');
        const [endDate, setEndDate] = useState('');

        const getServiceSummary = (services: ProposalServiceItem[]) => {
            if (!services || services.length === 0) {
                return <em>Nenhum serviço adicionado.</em>;
            }
            const descriptions = services.map(s => s.description).filter(Boolean);
            if(descriptions.length === 0) return <em>Serviços sem descrição.</em>;
            if (descriptions.length <= 2) {
                return descriptions.join(', ');
            }
            return `${descriptions.slice(0, 2).join(', ')}...`;
        };
        
        const filteredAndSortedProposals = useMemo(() => {
            let filtered = [...proposals];

            if (statusFilter !== 'all') {
                filtered = filtered.filter(p => p.status === statusFilter);
            }

            if (startDate && endDate) {
                const start = new Date(startDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);

                filtered = filtered.filter(p => {
                    const dateToCompare = dateFilterType === 'createdAt' ? p.createdAt : p.expiresAt;
                    if (!dateToCompare) return false;
                    const itemDate = new Date(dateToCompare);
                    return itemDate >= start && itemDate <= end;
                });
            }
            
            return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }, [proposals, statusFilter, dateFilterType, startDate, endDate]);

        const statuses: (ProposalStatus | 'all')[] = ['all', 'Draft', 'Sent', 'Accepted', 'Declined'];
        const statusLabels: Record<ProposalStatus | 'all', string> = {
            all: 'Todos',
            Draft: 'Rascunho',
            Sent: 'Enviado',
            Accepted: 'Aceito',
            Declined: 'Recusado'
        };

        return (
            <>
            <header className="app-header">
                <div className="header-title"><h1>Meus Orçamentos</h1></div>
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main>
                <button className="back-button" onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Voltar ao Dashboard</button>
                <div className="card">
                     <div className="proposals-list-header">
                        <h2>Histórico de Orçamentos</h2>
                        <button className="hero-cta" onClick={onNewProposal} style={{padding: '0.7rem 1.2rem'}}>+ Novo Orçamento</button>
                    </div>
                    <div className="history-filters" style={{marginTop: '1.5rem'}}>
                        {statuses.map(status => (
                            <button key={status} onClick={() => setStatusFilter(status)} className={statusFilter === status ? 'active' : ''}>
                                {statusLabels[status]}
                            </button>
                        ))}
                    </div>
                    <div className="history-filters" style={{paddingTop: 0, borderTop: 'none'}}>
                        <select 
                          value={dateFilterType} 
                          onChange={e => setDateFilterType(e.target.value as any)} 
                          style={{padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--secondary-bg-color)', color: 'var(--text-color)', fontFamily: "'Inter', sans-serif", fontSize: '0.85rem', fontWeight: 600}}>
                            <option value="createdAt">Data de Criação</option>
                            <option value="expiresAt">Data de Expiração</option>
                        </select>
                        <div className="custom-date-range">
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                            <span>até</span>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </div>
                        <button onClick={() => { setStatusFilter('all'); setStartDate(''); setEndDate(''); }}>Limpar Filtros</button>
                    </div>
                     {filteredAndSortedProposals.length > 0 ? (
                        <div className="proposals-list">
                            {filteredAndSortedProposals.map(proposal => (
                                <div key={proposal.id} className="proposal-item">
                                    <div className="proposal-item-info">
                                        <h3 className="proposal-item-client">{proposal.clientName}</h3>
                                        <p className="proposal-item-services">{getServiceSummary(proposal.services)}</p>
                                        <div className="proposal-item-meta">
                                            <span>Criado em: {new Date(proposal.createdAt).toLocaleDateString('pt-BR')}</span>
                                            {proposal.expiresAt && (
                                                <>
                                                    <span>|</span>
                                                    <span>Expira em: {new Date(proposal.expiresAt).toLocaleDateString('pt-BR')}</span>
                                                </>
                                            )}
                                            <span>|</span>
                                            <span>
                                                {proposal.totalOneTimeValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} + {proposal.totalRecurringValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês
                                            </span>
                                        </div>
                                    </div>
                                    <div className="proposal-item-status-actions">
                                        <select
                                            className={`status-select status-${proposal.status}`}
                                            value={proposal.status}
                                            onChange={(e) => onUpdateProposalStatus(proposal.id, e.target.value as ProposalStatus)}
                                            aria-label={`Status da proposta para ${proposal.clientName}`}
                                        >
                                            <option value="Draft">Rascunho</option>
                                            <option value="Sent">Enviado</option>
                                            <option value="Accepted">Aceito</option>
                                            <option value="Declined">Recusado</option>
                                        </select>
                                        <div className="proposal-actions-group">
                                            <button className="btn-icon btn-edit" title="Duplicar Orçamento" onClick={() => onDuplicateProposal(proposal.id)}>
                                                 <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            </button>
                                            <button className="btn-icon btn-edit" title="Editar Orçamento" onClick={() => onEditProposal(proposal.analysisId)}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                            <button className="btn-icon btn-delete" title="Excluir Orçamento" onClick={() => onDeleteProposal(proposal.id)}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : proposals.length > 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <h3>Nenhum orçamento corresponde aos filtros</h3>
                            <p>Tente ajustar ou limpar os filtros para ver seus orçamentos.</p>
                        </div>
                    ) : (
                        <div className="empty-state">
                           <div className="empty-state-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            </div>
                            <h3>Nenhum orçamento criado ainda</h3>
                            <p>Use os dados de uma análise para gerar seu primeiro orçamento para um cliente.</p>
                        </div>
                    )}
                </div>
            </main>
            </>
        );
    };

    const renderContent = () => {
        if (!session) {
            switch (currentView) {
                case 'login': return <AuthPage />;
                default: return <LandingPage onStart={() => setCurrentView('login')} />;
            }
        }

        if (!userProfile) return <LoadingSkeleton />;

        switch (currentView) {
            case 'app': return <AnalysisToolPage onBack={() => setCurrentView('dashboard')} onAnalysisComplete={handleAnalysisComplete} theme={theme} toggleTheme={toggleTheme} onNavigateToProposalBuilder={handleNavigateToProposalBuilder} />;
            case 'profile': return <ProfilePage userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onBack={() => setCurrentView('dashboard')} theme={theme} toggleTheme={toggleTheme} />;
            case 'settings': return <SettingsPage userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onBack={() => setCurrentView('dashboard')} theme={theme} toggleTheme={toggleTheme} onNavigateToServiceLibrary={() => setCurrentView('serviceLibrary')} />;
            case 'serviceLibrary': return <ServiceLibraryPage userProfile={userProfile} onUpdateProfile={handleUpdateProfile} onBack={() => setCurrentView('dashboard')} theme={theme} toggleTheme={toggleTheme} />;
            case 'proposalsList': return <ProposalsListPage proposals={proposalsHistory} onBack={() => setCurrentView('dashboard')} onNewProposal={() => { const lastAnalysis = analysisHistory[0]; if (lastAnalysis) { handleNavigateToProposalBuilder(lastAnalysis); } else { alert("Crie uma análise primeiro para poder gerar um orçamento."); setCurrentView('app'); } }} onEditProposal={handleEditProposal} onDeleteProposal={handleDeleteProposal} onUpdateProposalStatus={handleUpdateProposalStatus} onDuplicateProposal={handleDuplicateProposal} theme={theme} toggleTheme={toggleTheme} />;
            case 'proposalBuilder': return activeAnalysisForProposal ? <ProposalBuilderPage analysis={activeAnalysisForProposal} existingProposal={proposalsHistory.find(p => p.analysisId === activeAnalysisForProposal.id)} onSave={handleSaveProposal} onBack={() => setCurrentView('proposalsList')} userProfile={userProfile}/> : <p>Análise não encontrada.</p>;
            default: return <DashboardPage onNavigateToApp={() => setCurrentView('app')} onLogout={handleLogout} history={analysisHistory} theme={theme} toggleTheme={toggleTheme} userProfile={userProfile} onNavigateToProfile={() => setCurrentView('profile')} onNavigateToSettings={() => setCurrentView('settings')} onNavigateToProposalsList={() => setCurrentView('proposalsList')} onNavigateToProposalBuilder={handleNavigateToProposalBuilder} onUpdateHistoryItem={handleUpdateHistoryItem} onDeleteHistoryItem={handleDeleteHistoryItem} onNavigateToServiceLibrary={() => setCurrentView('serviceLibrary')} />;
        }
    };

    const containerClass = `app-container ${['landing', 'login'].includes(currentView) && !session ? 'is-fullpage' : ''}`;
    
    return <div className={containerClass}>{renderContent()}</div>;
};

export default App;
