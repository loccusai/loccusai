import React, { useState, useEffect } from 'react';

// Dados para o carrossel de depoimentos
const testimonials = [
    {
        quote: "Eu passava horas montando relatórios de concorrentes. Com o Loccus AI, faço em minutos o que antes levava um dia inteiro. Meus clientes ficam impressionados e eu ganho mais tempo para focar em estratégia.",
        author: "João P.",
        title: "Gestor de Tráfego",
        avatar: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/wAARCAA8ADwDASIAAhEBAxEB/8QAGwAAAgMBAQEAAAAAAAAAAAAAAgMAAQQFBgf/xAAqEAACAgEDAwQCAAcAAAAAAAAAAQIRAwQhEjFBUQUTImFxFIGRoUKxwf/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAHREBAQEAAgMBAQEAAAAAAAAAAAERAiESMUFREv/aAAwDAQACEQMRAD8A9NjjGMYxjYRiMYwYxjGDAA5s5sAxnNisBqG0hsgbQ2kCSA2kCSA2kNJDSAkDYGyBtIbQEgLQ2gJAbQEgJjGxjAxjZGNhGMYxgxhYxjAYsYxggc2c2MYDnNiMYwYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGMAYxjGAf/Z"
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

interface LandingPageProps {
    onStart: () => void;
}

const LandingPage = ({ onStart }: LandingPageProps) => {
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

export default LandingPage;