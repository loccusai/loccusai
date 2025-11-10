import React, { useState } from 'react';
import supabase from '../supabaseClient'; // Importa a instância centralizada

const AuthPage = () => {
    const [isLoginView, setIsLoginView] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const authDisabledMessage = "A autenticação está desabilitada. Verifique as credenciais do Supabase na configuração.";

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase) {
            setError(authDisabledMessage);
            return;
        }
        setLoading(true);
        setError(null);

        if (!isLoginView && password !== confirmPassword) {
            setError("As senhas não coincidem.");
            setLoading(false);
            return;
        }

        try {
            if (isLoginView) {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                const { error } = await supabase.auth.signUp({ 
                    email, 
                    password,
                    options: {
                        data: {
                            full_name: name,
                        }
                    }
                });
                if (error) throw error;
            }
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
                    <div className="landing-logo">
                        <svg className="logo-image" viewBox="0 0 142 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M16 0C8.27 0 2 6.27 2 14C2 22.25 16 32 16 32S30 22.25 30 14C30 6.27 23.73 0 16 0ZM16 19C13.24 19 11 16.76 11 14C11 11.24 13.24 9 16 9C18.76 9 21 11.24 21 14C21 16.76 18.76 19 16 19Z" fill="#00A9FF"/>
                            <path d="M16 11.5L17.16 12.84L18.5 14L17.16 15.16L16 16.5L14.84 15.16L13.5 14L14.84 12.84L16 11.5Z" fill="white"/>
                            <text x="38" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="700" fill="currentColor">Loccus</text>
                            <text x="110" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="400" fill="currentColor">AI</text>
                        </svg>
                    </div>
                    <h1 className="auth-heading">{isLoginView ? 'Acesse sua Conta' : 'Crie sua Conta'}</h1>
                </div>
                 {error && <p className="auth-error">{error}</p>}
                <form className="auth-form" onSubmit={handleAuthAction}>
                    {!isLoginView && <input type="text" placeholder="Nome" required value={name} onChange={e => setName(e.target.value)} />}
                    <input type="email" placeholder="E-mail" required value={email} onChange={e => setEmail(e.target.value)} />
                    <input type="password" placeholder="Senha" required value={password} onChange={e => setPassword(e.target.value)} />
                    {!isLoginView && <input type="password" placeholder="Confirmar senha" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />}
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

export default AuthPage;