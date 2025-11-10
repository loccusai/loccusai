import React, { useState, useEffect } from 'react';
import { ServiceLibraryItem } from '../../types';

interface ServiceLibraryPageProps {
    onBack: () => void;
    services: ServiceLibraryItem[];
    onUpdateServices: (services: ServiceLibraryItem[]) => Promise<void>;
}

const ServiceLibraryPage = ({ onBack, services, onUpdateServices }: ServiceLibraryPageProps) => {
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

    const handleServiceChange = (id: string, field: keyof ServiceLibraryItem, value: string | number | 'one-time' | 'recurring') => {
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
    
    const formatCurrency = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const handlePriceChange = (id: string, value: string) => {
        const digits = value.replace(/\D/g, '');
        if (digits === '') {
            handleServiceChange(id, 'price', 0);
            return;
        }
        const numberValue = parseInt(digits, 10);
        const price = numberValue / 100;
        handleServiceChange(id, 'price', price);
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
                                            type="text"
                                            placeholder="R$ 0,00"
                                            value={service.price > 0 ? formatCurrency(service.price) : ''}
                                            onChange={(e) => handlePriceChange(service.id, e.target.value)}
                                        />
                                    </div>
                                    <select
                                        className="history-card-button"
                                        value={service.type}
                                        onChange={(e) => handleServiceChange(service.id, 'type', e.target.value as 'one-time' | 'recurring')}
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

export default ServiceLibraryPage;