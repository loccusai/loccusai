import React, { useState, useEffect } from 'react';
import { UserProfile } from '../../types';

interface SettingsPageProps {
    onBack: () => void;
    userProfile: UserProfile | null;
    onUpdateProfile: (profile: Partial<UserProfile>) => Promise<void>;
}

const SettingsPage = ({ onBack, userProfile, onUpdateProfile }: SettingsPageProps) => {
    const [profileData, setProfileData] = useState<Partial<UserProfile>>(userProfile || {});
    const [saving, setSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    
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
        setSaveSuccess(false); // Reset on new save
        await onUpdateProfile(profileData);
        setSaving(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000); // Revert after 3 seconds
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
                    [`${prefix}${prefix ? 'C' : 'c'}omplement`]: data.complemento,
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
                        <div className="input-group address-complement"><input type="text" name="companyComplement" placeholder="Complemento" value={profileData.companyComplement || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-city"><input type="text" name="companyCity" placeholder="Cidade" value={profileData.companyCity || ''} onChange={handleChange} style={{paddingLeft: '12px'}}/></div>
                        <div className="input-group address-state"><input type="text" name="companyState" placeholder="UF" value={profileData.companyState || ''} onChange={handleChange} maxLength={2} style={{paddingLeft: '12px'}}/></div>
                    </div>
                </div>

                 <div className="settings-section">
                    <h3>Modelos de Proposta</h3>
                    <p className="form-description" style={{fontSize: '0.9rem', marginBottom: '1.5rem', marginTop: '-0.5rem'}}>
                        Crie modelos padrão para os termos e condições. Eles serão pré-preenchidos automaticamente no gerador de orçamentos, economizando seu tempo.
                    </p>
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
                <button type="submit" disabled={saving || saveSuccess}>
                    {saving ? 'Salvando...' : (saveSuccess ? 'Salvo com Sucesso!' : 'Salvar Alterações')}
                </button>
            </div>
        </form>
        </main>
        </>
    );
};

export default SettingsPage;