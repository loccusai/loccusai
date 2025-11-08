import React, { useState, useEffect, useMemo } from 'react';
import { analyzeCompanyPresence } from './services/geminiService';
import { CompanyData, SummaryPoint, AnalysisResult, LatLng, GroundingChunk, AnalysisHistoryItem, UserProfile, Proposal, ProposalServiceItem, ProposalStatus, ServiceLibraryItem } from './types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { createClient, Session, SupabaseClient } from '@supabase/supabase-js';

// --- SUPABASE CLIENT SETUP (COM FALLBACK) ---
let supabase: SupabaseClient | null = null;
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
        avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wAARCAA8ADwDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAgMAAQQFBgf/xAAqEAACAgEDAwQCAAcAAAAAAAAAAQIRAwQhEjFBUQUTImFxFIGRoUKxwf/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAHREBAQEAAgMBAQEAAAAAAAAAAAERAiESMUFREv/aAAwDAQACEQMRAD8A9NjjGMYxjYRiMYwYxjGDAA5s5sAxnNisBqG0hsgbQ2kCSA2kCSA2kNJDSAkDYGyBtIbQEgLQ2gJAbQEgJjGxjAxjZGNhGMYxgxhYxjAYsYxggc2c2MYDnNiMYwYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGAf/Z"
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
                <div className="pricing-card-header"><div className="plan-info"><span className="plan-name">PRO</span><span className="plan-badge">RECOMENDADO</span></div><p className="plan-description">Acesso completo ao plano PRO com recorrência mensal.</p></div>
                <div className="pricing-card-body"><div className="price-container"><span className="main-price">R$97,00</span><span className="price-period">/ mês</span></div>
                    <ul className="features-list">
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Análises de empresas ilimitadas</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Relatórios de concorrentes</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Dados do Google Maps & Search</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Gerador de Orçamentos em PDF</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Histórico Salvo na Nuvem</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Personalização com Dados da Agência</span></li>
                        <li className="feature-list-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Acesso a futuras atualizações</span></li>
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
    )
};


// --- Componente Principal da Aplicação (Formulário) ---
const AppForm = ({ onBack, onResult, userProfile }: { onBack: () => void; onResult: (result: AnalysisResult, companyName: string) => void; userProfile: UserProfile | null; }) => {
    const [companyName, setCompanyName] = useState('');
    const [city, setCity] = useState(userProfile?.companyCity || '');
    const [state, setState] = useState(userProfile?.companyState || '');
    const [keywords, setKeywords] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [location, setLocation] = useState<LatLng | null>(null);
    const [isFetchingLocation, setIsFetchingLocation] = useState(false);

    useEffect(() => {
        // Tenta obter a geolocalização ao montar o componente
        handleGetLocation();
    }, []);
    
    useEffect(() => {
        // Atualiza os campos de cidade e estado se o perfil do usuário for carregado
        if (userProfile?.companyCity && !city) {
            setCity(userProfile.companyCity);
        }
        if (userProfile?.companyState && !state) {
            setState(userProfile.companyState);
        }
    }, [userProfile]);


    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            console.warn("Geolocalização não é suportada por este navegador.");
            return;
        }
        setIsFetchingLocation(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
                setIsFetchingLocation(false);
            },
            (err) => {
                console.warn(`AVISO: Não foi possível obter a geolocalização (${err.message}). A análise prosseguirá sem coordenadas geográficas.`);
                setLocation(null);
                setIsFetchingLocation(false);
            }
        );
    };

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
            const { responseText, groundingChunks } = await analyzeCompanyPresence(companyName, city, state, keywordsArray, location);

            // Parsing the response
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
    
    // Auto-complete de endereço via CEP
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
                    placeholder="CEP (para preencher cidade/estado)"
                    onBlur={handleCepBlur}
                    maxLength={9}
                 />
            </div>
            
             <div className="address-fields-grid">
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
            
            <div className="input-group">
                 {isFetchingLocation && <div className="spinner"></div>}
                 <input
                    type="text"
                    value={location ? `Geolocalização: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}` : 'Buscando geolocalização...'}
                    readOnly
                 />
            </div>

            {error && <p className="error-box">{error}</p>}
            <button type="submit" disabled={loading}>
                 {loading ? <span className="button-spinner"></span> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 16.17l7.59-7.59L19 10l-9 9z"></path></svg>}
                {loading ? 'Gerando Análise...' : 'Gerar Análise'}
            </button>
        </form>
    </div>
    )
};


// --- Componente de Exibição dos Resultados ---
const AnalysisResultDisplay = ({ result, onGenerateProposal }: { result: AnalysisResult | AnalysisHistoryItem; onGenerateProposal?: (analysis: AnalysisResult | AnalysisHistoryItem) => void; }) => {
    const { tableData, summaryTable, analysis, recommendations, hashtags, groundingChunks } = result;

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert('Copiado para a área de transferência!');
        } catch (err) {
            console.error('Falha ao copiar texto: ', err);
            alert('Não foi possível copiar o texto.');
        }
    };
    
    // Função para renderizar as fontes de pesquisa
    const renderGroundingSources = (chunks?: GroundingChunk[]) => {
        if (!chunks || chunks.length === 0) {
            return null;
        }

        const sources = chunks.reduce((acc, chunk) => {
            if (chunk.web && chunk.web.uri) {
                acc.add({ type: 'web', uri: chunk.web.uri, title: chunk.web.title || chunk.web.uri });
            }
            if (chunk.maps && chunk.maps.uri) {
                acc.add({ type: 'maps', uri: chunk.maps.uri, title: chunk.maps.title || chunk.maps.uri });
            }
            return acc;
        }, new Set<{ type: string; uri: string; title: string; }>());

        if (sources.size === 0) return null;

        return (
            <div className="card">
                <h3>Fontes da Pesquisa</h3>
                <ul className="sources-list">
                    {Array.from(sources).map((source, index) => (
                        <li key={index}>
                            <a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title}</a>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };
    
    // Função para renderizar as recomendações com formatação correta
    const renderRecommendations = (recsText: string) => {
        const cleanedText = recsText.replace(/^###\s*Recomendações Estratégicas\s*/i, '').trim();
        const recommendationsArray = cleanedText.split(/\n\s*(?=\d+\.\s*)/).filter(Boolean);

        if (recommendationsArray.length === 0) {
            return <p className="recommendation-content">{cleanedText}</p>;
        }

        return (
            <ol className="recommendations-list">
                {recommendationsArray.map((rec, index) => {
                    const match = rec.match(/^\d+\.\s*\*\*(.*?)\*\*\s*:\s*(.*)/s);
                    if (match) {
                        const [, title, content] = match;
                        return (
                            <li key={index}>
                                <div className="recommendation-content">
                                    <strong className="recommendation-title">{title}</strong>
                                    {content.trim()}
                                </div>
                            </li>
                        );
                    }
                    return (
                        <li key={index}>
                            <p className="recommendation-content">{rec.replace(/^\d+\.\s*/, '').trim()}</p>
                        </li>
                    );
                })}
            </ol>
        );
    };

    // Função para renderizar a análise com formatação correta
    const renderAnalysis = (analysisText: string) => {
        const cleanedText = analysisText.replace(/^###\s*Análise Detalhada\s*/i, '').trim();
        const points = cleanedText.split(/\n\s*(?=\*\*(.*?)\*\*\s*:)/).filter(Boolean);

        if (points.length <= 1) { // Se não houver múltiplos pontos com **, renderiza como parágrafo único
            return <p className="summary-text">{cleanedText}</p>;
        }

        return (
            <ul className="analysis-list">
                {points.map((point, index) => {
                     const match = point.match(/\*\*(.*?)\*\*\s*:\s*(.*)/s);
                     if (match) {
                        const [, title, content] = match;
                        return (
                             <li key={index}>
                                <div className="analysis-content">
                                    <strong className="recommendation-title">{title}</strong>
                                     {content.trim()}
                                </div>
                            </li>
                        )
                     }
                      return (
                         <li key={index}>
                            <p className="analysis-content">{point.trim()}</p>
                        </li>
                      );
                })}
            </ul>
        );
    };

    // Função para gerar o PDF
    const generatePdf = () => {
        const doc = new jsPDF();
        
        // Título principal
        doc.setFontSize(18);
        doc.text(`Análise de Presença Digital: ${(result as AnalysisHistoryItem).companyName}`, 14, 22);

        // Tabela de Comparação de Mercado
        if (tableData.length > 0) {
            doc.setFontSize(14);
            doc.text("Comparação de Mercado", 14, 35);
            autoTable(doc, {
                startY: 40,
                head: [Object.keys(tableData[0])],
                body: tableData.map(row => Object.values(row)),
                theme: 'striped',
                headStyles: { fillColor: [0, 123, 255] },
            });
        }
        
        const lastTableY = (doc as any).lastAutoTable.finalY || 40;

        // Tabela de Resumo
        if (summaryTable.length > 0) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text("Resumo da Análise", 14, 22);
            autoTable(doc, {
                startY: 27,
                head: [Object.keys(summaryTable[0])],
                body: summaryTable.map(row => Object.values(row)),
                theme: 'striped',
                headStyles: { fillColor: [0, 123, 255] },
            });
        }
        
        // Análise Detalhada
        if (analysis) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text("Análise Detalhada", 14, 22);
            const splitAnalysis = doc.splitTextToSize(analysis.replace(/^###\s*Análise Detalhada\s*/i, '').trim(), 180);
            doc.setFontSize(11);
            doc.text(splitAnalysis, 14, 30);
        }

        // Recomendações
        if (recommendations) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text("Recomendações Estratégicas", 14, 22);
            const splitRecommendations = doc.splitTextToSize(recommendations.replace(/^###\s*Recomendações Estratégicas\s*/i, '').replace(/\d+\.\s/g, '\n- ').trim(), 180);
            doc.setFontSize(11);
            doc.text(splitRecommendations, 14, 30);
        }

        doc.save(`analise_${(result as AnalysisHistoryItem).companyName.replace(/\s+/g, '_').toLowerCase()}.pdf`);
    };

    return (
        <div className="results-container">
            {onGenerateProposal && (
                <div className="card-header-with-action" style={{ marginBottom: '2rem' }}>
                    <button className="copy-button" onClick={generatePdf}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"></path><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l5 5v11a2 2 0 0 1-2 2z"></path><line x1="9" y1="17" x2="15" y2="17"></line><line x1="9" y1="13" x2="15" y2="13"></line><line x1="9" y1="9" x2="11" y2="9"></line></svg>
                        Baixar PDF
                    </button>
                    <button className="history-card-button" onClick={() => onGenerateProposal(result)}>
                         Gerar Orçamento
                         <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </button>
                </div>
            )}
             {tableData.length === 0 && summaryTable.length === 0 && !analysis && !recommendations ? (
                 <div className="card">
                     <h3>Carregando resultado...</h3>
                      <div className="skeleton skeleton-h3"></div>
                      <div className="skeleton skeleton-text"></div>
                      <div className="skeleton skeleton-text"></div>
                      <div className="skeleton skeleton-text" style={{ width: '80%'}}></div>
                 </div>
            ) : (
                <>
                <div className="card market-comparison-card">
                    <div className="card-title-with-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                        <h3>Comparação de Mercado</h3>
                    </div>
                    {tableData.length > 0 ? (
                        <div className="table-responsive">
                            <table>
                                <thead>
                                    <tr>{Object.keys(tableData[0]).map(header => <th key={header}>{header}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {tableData.map((row, index) => (
                                        <tr key={index}>
                                            {Object.values(row).map((cell, i) => <td key={i}>{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                        </div>
                    )}
                </div>

                <div className="card summary-table-card">
                     <div className="card-title-with-icon">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                        <h3>Resumo da Análise</h3>
                    </div>
                     {summaryTable.length > 0 ? (
                        <div className="table-responsive">
                            <table>
                                <thead>
                                    <tr>{Object.keys(summaryTable[0]).map(header => <th key={header}>{header}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {summaryTable.map((row, index) => (
                                        <tr key={index}>
                                            {Object.values(row).map((cell, i) => <td key={i}>{cell}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                         <div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                             <div className="skeleton skeleton-text" style={{ height: '40px' }}></div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="card-header-with-action">
                        <div className="card-title-with-icon">
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                            <h3>Análise Detalhada</h3>
                        </div>
                         <button className="copy-button" onClick={() => copyToClipboard(analysis)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copiar
                        </button>
                    </div>
                    {analysis ? renderAnalysis(analysis) : (
                        <div>
                             <div className="skeleton skeleton-text"></div>
                             <div className="skeleton skeleton-text"></div>
                             <div className="skeleton skeleton-text" style={{width: '70%'}}></div>
                        </div>
                    )}
                </div>

                <div className="card">
                    <div className="card-header-with-action">
                         <div className="card-title-with-icon">
                           <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                           <h3>Recomendações Estratégicas</h3>
                        </div>
                        <button className="copy-button" onClick={() => copyToClipboard(recommendations)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copiar
                        </button>
                    </div>
                     {recommendations ? renderRecommendations(recommendations) : (
                         <div>
                             <div className="skeleton skeleton-text"></div>
                             <div className="skeleton skeleton-text"></div>
                             <div className="skeleton skeleton-text" style={{width: '85%'}}></div>
                        </div>
                     )}
                </div>
                
                <div className="card">
                    <div className="card-header-with-action">
                         <div className="card-title-with-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>
                            <h3>Hashtags Estratégicas</h3>
                        </div>
                        <button className="copy-button" onClick={() => copyToClipboard(hashtags)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copiar
                        </button>
                    </div>
                    {hashtags ? (
                         <div className="hashtags-container">
                            {hashtags.split(/\s+/).filter(Boolean).map((tag, index) => (
                                <span key={index} className="hashtag-pill">{tag}</span>
                            ))}
                        </div>
                    ) : (
                         <div className="skeleton skeleton-text" style={{width: '90%'}}></div>
                    )}
                </div>

                {renderGroundingSources(groundingChunks)}
                </>
            )}
        </div>
    );
};


// --- Componente de Configurações ---
const SettingsPage = ({ onBack, userProfile, onUpdateProfile }: { onBack: () => void; userProfile: UserProfile | null; onUpdateProfile: (profile: Partial<UserProfile>) => Promise<void>; }) => {
    const [profileData, setProfileData] = useState<Partial<UserProfile>>(userProfile || {});
    const [saving, setSaving] = useState(false);
    
    useEffect(() => {
        setProfileData(userProfile || {});
    }, [userProfile]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        await onUpdateProfile(profileData);
        setSaving(false);
        alert('Perfil salvo com sucesso!');
    };
    
    const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>, prefix: 'company' | '') => {
        const cep = e.target.value.replace(/\D/g, '');
        if (cep.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                if (!response.ok) throw new Error('CEP não encontrado');
                const data = await response.json();
                if (data.erro) throw new Error('CEP inválido');
                setProfileData(prev => ({
                    ...prev,
                    [`${prefix}${prefix ? 'C' : 'c'}ep`]: cep,
                    [`${prefix}${prefix ? 'S' : 's'}treet`]: data.logradouro,
                    [`${prefix}${prefix ? 'N' : 'n'}eighborhood`]: data.bairro,
                    [`${prefix}${prefix ? 'C' : 'c'}ity`]: data.localidade,
                    [`${prefix}${prefix ? 'S' : 's'}tate`]: data.uf,
                }));
            } catch (err) {
                console.warn("Não foi possível buscar o CEP:", err);
            }
        }
    };


    if (!userProfile) return <div>Carregando...</div>;

    return (
        <>
        <header className="dashboard-header">
            <h1 style={{flexGrow: 1}}>Configurações</h1>
             <div className="dashboard-header-actions" style={{justifyContent: 'flex-end'}}>
                 <button className="back-button" onClick={onBack} style={{ marginBottom: 0, padding: '0.5rem 1rem' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Voltar ao Dashboard
                </button>
             </div>
        </header>
        <main>
        <form onSubmit={handleSave}>
            <div className="card">
                <div className="settings-section">
                    <h3>Meus Dados</h3>
                    <div className="form-group">
                        <label>Nome Completo</label>
                        <input type="text" name="name" value={profileData.name || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                     <div className="form-group">
                        <label>Telefone</label>
                        <input type="tel" name="phone" value={profileData.phone || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                </div>

                <div className="settings-section">
                    <h3>Dados da Minha Agência (para orçamentos)</h3>
                    <div className="form-group">
                        <label>Nome da Agência</label>
                        <input type="text" name="companyName" value={profileData.companyName || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                    <div className="form-group">
                        <label>CNPJ</label>
                        <input type="text" name="companyCnpj" value={profileData.companyCnpj || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                    <div className="form-group">
                        <label>Email da Agência</label>
                        <input type="email" name="companyEmail" value={profileData.companyEmail || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                     <div className="form-group">
                        <label>Telefone da Agência</label>
                        <input type="tel" name="companyPhone" value={profileData.companyPhone || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/>
                    </div>
                    <div className="form-group">
                        <label>CEP</label>
                        <input type="text" name="companyCep" value={profileData.companyCep || ''} onChange={handleChange} onBlur={(e) => handleCepBlur(e, 'company')} maxLength={9} style={{paddingLeft: '12px'}}/>
                    </div>
                    <div className="address-fields-grid" style={{marginBottom: 0}}>
                        <div className="input-group address-street"><input type="text" name="companyStreet" placeholder="Rua" value={profileData.companyStreet || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-number"><input type="text" name="companyNumber" placeholder="Nº" value={profileData.companyNumber || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-neighborhood"><input type="text" name="companyNeighborhood" placeholder="Bairro" value={profileData.companyNeighborhood || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-city"><input type="text" name="companyCity" placeholder="Cidade" value={profileData.companyCity || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-state"><input type="text" name="companyState" placeholder="UF" value={profileData.companyState || ''} onChange={handleChange} maxLength={2} style={{paddingLeft: '12px'}}/></div>
                    </div>
                </div>

                 <div className="settings-section">
                    <h3>Modelos de Proposta</h3>
                     <div className="form-group">
                        <label>Termos e Condições (Pagamento único)</label>
                        <textarea name="proposalOneTimeTemplate" value={profileData.proposalOneTimeTemplate || ''} onChange={handleChange} rows={5}></textarea>
                    </div>
                     <div className="form-group">
                        <label>Termos e Condições (Pagamento recorrente)</label>
                        <textarea name="proposalRecurringTemplate" value={profileData.proposalRecurringTemplate || ''} onChange={handleChange} rows={5}></textarea>
                    </div>
                </div>
            </div>
            
             <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button type="submit" disabled={saving}>
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                </button>
            </div>
        </form>
        </main>
        </>
    );
};


// --- Componente de Biblioteca de Serviços ---
const ServiceLibraryPage = ({ onBack, services, onUpdateServices }: { onBack: () => void; services: ServiceLibraryItem[]; onUpdateServices: (services: ServiceLibraryItem[]) => Promise<void>; }) => {
    const [localServices, setLocalServices] = useState<ServiceLibraryItem[]>(services);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setLocalServices(services);
    }, [services]);
    
    const handleAddService = () => {
        const newService: ServiceLibraryItem = {
            id: `service_${Date.now()}_${Math.random()}`,
            description: '',
            price: 0,
            type: 'one-time',
        };
        setLocalServices(prev => [...prev, newService]);
    };

    const handleServiceChange = (id: string, field: keyof ServiceLibraryItem, value: string | number) => {
        setLocalServices(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    const handleRemoveService = (id: string) => {
        setLocalServices(prev => prev.filter(s => s.id !== id));
    };

    const handleSaveLibrary = async () => {
        setSaving(true);
        await onUpdateServices(localServices);
        setSaving(false);
        alert('Biblioteca de serviços salva!');
    };
    
    return (
        <>
            <header className="dashboard-header">
                <h1>Biblioteca de Serviços</h1>
                 <button className="back-button" onClick={onBack} style={{ marginBottom: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Voltar
                </button>
            </header>
            <main>
                <div className="card">
                    <p className="form-description">Crie e salve serviços que você oferece com frequência para adicioná-los rapidamente aos seus orçamentos.</p>
                    <div className="services-list">
                         {localServices.map(service => (
                            <div key={service.id} className="service-item">
                                <div className="service-item-main">
                                     <div className="input-group">
                                         <textarea
                                            placeholder="Descrição do Serviço"
                                            value={service.description}
                                            onChange={(e) => handleServiceChange(service.id, 'description', e.target.value)}
                                        />
                                     </div>
                                </div>
                                <div className="service-item-side">
                                    <div className="input-group service-price-input">
                                         <input
                                            type="number"
                                            placeholder="Preço (R$)"
                                            value={service.price}
                                            onChange={(e) => handleServiceChange(service.id, 'price', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <select
                                        className="history-card-button"
                                        value={service.type}
                                        onChange={(e) => handleServiceChange(service.id, 'type', e.target.value)}
                                        style={{ height: '48px' }}
                                    >
                                        <option value="one-time">Único</option>
                                        <option value="recurring">Recorrente</option>
                                    </select>
                                    <button className="remove-service-btn" onClick={() => handleRemoveService(service.id)}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                     <button className="add-service-btn" onClick={handleAddService}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Adicionar Serviço
                    </button>
                </div>
                 <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
                    <button onClick={handleSaveLibrary} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar Biblioteca'}
                    </button>
                </div>
            </main>
        </>
    );
};


// --- Componente para Gerar e Visualizar Propostas (Orçamentos) ---
const ProposalBuilderPage = ({ onBack, analysis, userProfile, onSaveProposal }: { onBack: () => void; analysis: AnalysisHistoryItem; userProfile: UserProfile | null, onSaveProposal: (proposal: Proposal) => void; }) => {
    const [services, setServices] = useState<ProposalServiceItem[]>([]);
    const [clientEmail, setClientEmail] = useState('');
    const [terms, setTerms] = useState('');
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    
    // Adicionar um serviço da biblioteca
    const addServiceFromLibrary = (item: ServiceLibraryItem) => {
        const newService: ProposalServiceItem = { ...item, id: `service_${Date.now()}_${Math.random()}` };
        setServices(prev => [...prev, newService]);
    };
    
    const handleAddService = (type: 'one-time' | 'recurring') => {
        const newService: ProposalServiceItem = {
            id: `service_${Date.now()}_${Math.random()}`,
            description: '',
            price: 0,
            type,
        };
        setServices(prev => [...prev, newService]);
    };

    const handleServiceChange = (id: string, field: 'description' | 'price', value: string | number) => {
        setServices(prev =>
            prev.map(s => (s.id === id ? { ...s, [field]: value } : s))
        );
    };

    const handleRemoveService = (id:string) => {
        setServices(prev => prev.filter(s => s.id !== id));
    };

    const totalOneTime = useMemo(() => services.filter(s => s.type === 'one-time').reduce((acc, s) => acc + s.price, 0), [services]);
    const totalRecurring = useMemo(() => services.filter(s => s.type === 'recurring').reduce((acc, s) => acc + s.price, 0), [services]);
    
     useEffect(() => {
        // Define os termos com base nos serviços adicionados
        if (totalRecurring > 0) {
            setTerms(userProfile?.proposalRecurringTemplate || 'Termos para serviços recorrentes...');
        } else {
            setTerms(userProfile?.proposalOneTimeTemplate || 'Termos para serviço único...');
        }
    }, [totalOneTime, totalRecurring, userProfile]);
    
    const formatCurrency = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    
    const generateProposalPDF = async (outputType: 'bloburl' | 'save' = 'bloburl') => {
        const doc = new jsPDF();
        const agency = userProfile;
        
        // Cabeçalho
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(agency?.companyName || 'Sua Agência', 14, 20);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${agency?.companyStreet || ''}, ${agency?.companyNumber || ''} - ${agency?.companyNeighborhood || ''}`, 14, 26);
        doc.text(`${agency?.companyCity || ''}, ${agency?.companyState || ''} - CEP: ${agency?.companyCep || ''}`, 14, 30);
        doc.text(`CNPJ: ${agency?.companyCnpj || ''}`, 14, 34);
        doc.text(`Contato: ${agency?.companyEmail || ''} | ${agency?.companyPhone || ''}`, 14, 38);

        // Informações da Proposta
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Proposta de Serviços', 14, 55);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 62);
        doc.text(`Cliente: ${analysis.companyName}`, 14, 68);
        
        // Tabela de Serviços
        const tableBody = services.map(s => [
            s.description,
            s.type === 'one-time' ? 'Pag. Único' : 'Mensal',
            formatCurrency(s.price)
        ]);

        autoTable(doc, {
            startY: 80,
            head: [['Descrição do Serviço', 'Tipo', 'Valor']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [0, 123, 255] },
        });

        // Totais
        const lastTableY = (doc as any).lastAutoTable.finalY;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        if (totalOneTime > 0) {
            doc.text(`Total (Pagamento Único): ${formatCurrency(totalOneTime)}`, 14, lastTableY + 15);
        }
        if (totalRecurring > 0) {
             doc.text(`Total (Mensal): ${formatCurrency(totalRecurring)}`, 14, lastTableY + (totalOneTime > 0 ? 22 : 15));
        }

        // Termos e Condições
        doc.addPage();
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Termos e Condições', 14, 20);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const splitTerms = doc.splitTextToSize(terms, 180);
        doc.text(splitTerms, 14, 28);
        
        if (outputType === 'save') {
            doc.save(`proposta_${analysis.companyName.replace(/\s+/g, '_')}.pdf`);
        } else {
             const pdfBlob = doc.output('blob');
             const url = URL.createObjectURL(pdfBlob);
             setPdfUrl(url);
             setShowPdfPreview(true);
        }
    };
    
    const handleSaveAndPreview = () => {
        const newProposal: Proposal = {
            id: `prop_${Date.now()}`,
            analysisId: analysis.id,
            clientName: analysis.companyName,
            status: 'Draft',
            createdAt: new Date(),
            services,
            totalOneTimeValue: totalOneTime,
            totalRecurringValue: totalRecurring,
            analysisResult: analysis,
            clientEmail: clientEmail,
            termsAndConditions: terms,
        };
        onSaveProposal(newProposal);
        generateProposalPDF('bloburl');
    };

    return (
        <>
            <header className="dashboard-header">
                <h1>Gerador de Orçamento</h1>
                <button className="back-button" onClick={onBack} style={{marginBottom: 0}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Voltar
                </button>
            </header>
            <main>
                <div className="card">
                     <p className="form-description">Orçamento para: <strong>{analysis.companyName}</strong></p>
                     
                    {userProfile?.serviceLibrary && userProfile.serviceLibrary.length > 0 && (
                        <div className="card-header-with-action" style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
                            <h3>Adicionar serviço da biblioteca:</h3>
                            <div className="add-service-actions">
                            {userProfile.serviceLibrary.map(item => (
                                <button key={item.id} className="add-service-btn" onClick={() => addServiceFromLibrary(item)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    {item.description}
                                </button>
                            ))}
                            </div>
                        </div>
                    )}
                     
                    <h3>Serviços</h3>
                    <div className="services-list">
                        {services.length === 0 && <p>Nenhum serviço adicionado.</p>}
                        {services.map(service => (
                            <div key={service.id} className="service-item">
                                <div className="service-item-main">
                                     <span className={`service-type-badge ${service.type}`}>{service.type === 'one-time' ? 'Pagamento Único' : 'Recorrente'}</span>
                                     <div className="input-group">
                                         <textarea
                                            placeholder="Descrição do Serviço"
                                            value={service.description}
                                            onChange={(e) => handleServiceChange(service.id, 'description', e.target.value)}
                                            rows={1}
                                        />
                                     </div>
                                </div>
                                <div className="service-item-side">
                                    <div className="input-group service-price-input">
                                         <input
                                            type="number"
                                            placeholder="Preço (R$)"
                                            value={service.price}
                                            onChange={(e) => handleServiceChange(service.id, 'price', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <button className="remove-service-btn" onClick={() => handleRemoveService(service.id)}>
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="add-service-actions">
                        <button className="add-service-btn" onClick={() => handleAddService('one-time')}>+ Serviço (Único)</button>
                        <button className="add-service-btn" onClick={() => handleAddService('recurring')}>+ Serviço (Recorrente)</button>
                    </div>

                    <hr style={{margin: '2rem 0', border: 'none', borderTop: '1px solid var(--border-color)'}} />
                    
                    <div className="total-value-card">
                         {totalOneTime > 0 && (
                            <div className="total-value-group">
                                <h4>Total (Pag. Único):</h4>
                                <span className="total-price">{formatCurrency(totalOneTime)}</span>
                            </div>
                         )}
                         {totalRecurring > 0 && (
                            <div className="total-value-group">
                                <h4>Total (Mensal):</h4>
                                <span className="total-price">{formatCurrency(totalRecurring)}</span>
                            </div>
                         )}
                         {totalOneTime === 0 && totalRecurring === 0 && <p>Adicione serviços para ver o total.</p>}
                    </div>
                </div>

                <div className="card" style={{ marginTop: '2rem' }}>
                    <h3>Termos e Condições</h3>
                    <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={8}></textarea>
                </div>
                
                 <div className="email-proposal-card">
                    <h3>Enviar por Email (Opcional)</h3>
                    <p>Insira o e-mail do cliente para enviar uma cópia da proposta.</p>
                     <div className="input-group">
                        <input
                            type="email"
                            placeholder="Email do cliente"
                            value={clientEmail}
                            onChange={(e) => setClientEmail(e.target.value)}
                            style={{ paddingLeft: '12px' }}
                        />
                    </div>
                 </div>

                <div className="proposal-actions">
                     <button className="back-button btn-secondary" onClick={onBack}>Cancelar</button>
                    <button onClick={handleSaveAndPreview}>Salvar e Pré-visualizar PDF</button>
                </div>
            </main>
            
            {showPdfPreview && (
                <div className="pdf-preview-overlay">
                    <div className="pdf-preview-modal">
                        <div className="pdf-preview-header">
                            <h3>Pré-visualização da Proposta</h3>
                            <div className="pdf-preview-actions">
                                <button className="pdf-download-btn" onClick={() => generateProposalPDF('save')}>Baixar PDF</button>
                                <button className="pdf-close-btn" onClick={() => setShowPdfPreview(false)}>Fechar</button>
                            </div>
                        </div>
                        <div className="pdf-preview-body">
                             <iframe src={pdfUrl} title="Pré-visualização de PDF"></iframe>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// --- Componente para Listar Propostas ---
const ProposalsListPage = ({ onBack, proposals, onUpdateProposal, onDeleteProposal, onNavigateToBuilder }: { onBack: () => void; proposals: Proposal[]; onUpdateProposal: (proposal: Proposal) => void; onDeleteProposal: (id: string) => void; onNavigateToBuilder: (analysis: AnalysisHistoryItem) => void; }) => {
    
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
                        {sortedProposals.map(p => (
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
                                         <button className="btn-icon btn-edit" title="Editar Orçamento" onClick={() => onNavigateToBuilder(p.analysisResult as AnalysisHistoryItem)}>
                                             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                        <button className="btn-icon btn-delete" title="Excluir Orçamento" onClick={() => { if(window.confirm('Tem certeza?')) onDeleteProposal(p.id); }}>
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
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

// --- Componente Principal ---
export default function App() {
    type Page = 'landing' | 'auth' | 'dashboard' | 'app' | 'result' | 'profile' | 'settings' | 'proposalBuilder' | 'proposalsList' | 'serviceLibrary';
    const [page, setPage] = useState<Page>('landing');
    const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
    const [currentCompanyName, setCurrentCompanyName] = useState('');
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

    // Lida com a autenticação e perfis do Supabase
    useEffect(() => {
        if (!supabase) {
            // Se o Supabase não estiver configurado, pula para o dashboard para usar o Local Storage
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
                // Busca ou cria o perfil do usuário
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                
                if (error && error.code === 'PGRST116') { // "PGRST116" = not found
                    // Cria o perfil se não existir
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
    
     // Sincroniza dados com o Supabase quando o usuário está logado
    useEffect(() => {
        if (supabase && session?.user && userProfile) {
            const syncData = async () => {
                const { data: remoteHistory, error: historyError } = await supabase
                    .from('analyses')
                    .select('*')
                    .eq('user_id', session.user.id);
                if (historyError) console.error("Erro ao buscar histórico do Supabase:", historyError);
                else setHistory(remoteHistory as AnalysisHistoryItem[]);

                const { data: remoteProposals, error: proposalsError } = await supabase
                    .from('proposals')
                    .select('*')
                    .eq('user_id', session.user.id);
                if (proposalsError) console.error("Erro ao buscar propostas do Supabase:", proposalsError);
                else setProposals(remoteProposals as Proposal[]);
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

    const handleResult = (result: AnalysisResult, companyName: string) => {
        const newHistoryItem: AnalysisHistoryItem = {
            ...result,
            id: `analysis_${Date.now()}`,
            companyName,
            date: new Date(),
        };
        
        const updatedHistory = [newHistoryItem, ...history];
        setHistory(updatedHistory);

        if (supabase && session?.user) {
            supabase.from('analyses').insert({ ...newHistoryItem, user_id: session.user.id }).then(({ error }) => {
                if(error) console.error("Erro ao salvar análise no Supabase:", error);
            });
        }
        
        setCurrentResult(result);
        setCurrentCompanyName(companyName);
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
    
    // Funções CRUD para Propostas
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
    
    // Funções CRUD para Histórico
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
    
    // Funções para Biblioteca de Serviços (salvas no perfil do usuário)
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
                    <header className="dashboard-header"><h1>Análise: {currentCompanyName}</h1></header>
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
