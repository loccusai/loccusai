import React from 'react';

interface LandingPageProps {
    onStart: () => void;
}

const LandingPage = ({ onStart }: LandingPageProps) => {
    return (
    <div className="landing-page">
        <header className="landing-header">
            <div className="landing-logo">
                <svg className="logo-image" viewBox="0 0 142 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 0C8.27 0 2 6.27 2 14C2 22.25 16 32 16 32S30 22.25 30 14C30 6.27 23.73 0 16 0ZM16 19C13.24 19 11 16.76 11 14C11 11.24 13.24 9 16 9C18.76 9 21 11.24 21 14C21 16.76 18.76 19 16 19Z" fill="#00A9FF"/>
                    <path d="M16 11.5L17.16 12.84L18.5 14L17.16 15.16L16 16.5L14.84 15.16L13.5 14L14.84 12.84L16 11.5Z" fill="white"/>
                    <text x="38" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="700" fill="currentColor">Loccus</text>
                    <text x="110" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="400" fill="currentColor">AI</text>
                </svg>
            </div>
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
        <section className="cta-section"><h2 className="section-title">Pronto para dominar o mercado local para seus clientes?</h2><button className="hero-cta" onClick={onStart}>Começar Agora</button></section>
        <footer className="landing-footer"><p>© 2024 Loccus AI. Todos os direitos reservados.</p></footer>
    </div>
    );
};

export default LandingPage;