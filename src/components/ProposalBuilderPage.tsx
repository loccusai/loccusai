import React, { useState, useEffect, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalysisHistoryItem, Proposal, ProposalServiceItem, ServiceLibraryItem, UserProfile, AnalysisResult } from '../../types';

interface ProposalBuilderPageProps {
    onBack: () => void;
    analysis: AnalysisHistoryItem;
    userProfile: UserProfile | null;
    onSaveProposal: (proposal: Proposal) => Promise<void>;
    proposalToEdit: Proposal | null;
}

const ProposalBuilderPage = ({ onBack, analysis, userProfile, onSaveProposal, proposalToEdit }: ProposalBuilderPageProps) => {
    const [services, setServices] = useState<ProposalServiceItem[]>([]);
    const [clientEmail, setClientEmail] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [terms, setTerms] = useState('');
    const [showPdfPreview, setShowPdfPreview] = useState(false);
    const [pdfUrl, setPdfUrl] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    
    useEffect(() => {
        if (proposalToEdit) {
            setServices(proposalToEdit.services);
            setClientEmail(proposalToEdit.clientEmail || '');
            setContactName(proposalToEdit.contactName || '');
            setContactPhone(proposalToEdit.contactPhone || '');
            setTerms(proposalToEdit.termsAndConditions || '');
        }
    }, [proposalToEdit]);

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

    const handleRemoveService = (id:string) => {
        setServices(prev => prev.filter(s => s.id !== id));
    };
    
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value.replace(/\D/g, ''); 
        
        if (value.length > 11) {
            value = value.substring(0, 11);
        }

        if (value.length > 10) { 
            value = value.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3');
        } else if (value.length > 6) {
            value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
        } else if (value.length > 2) { 
            value = value.replace(/^(\d{2})(\d{0,4}).*/, '($1) $2');
        } else if (value.length > 0) { 
            value = value.replace(/^(\d*)/, '($1');
        }

        setContactPhone(value);
    };

    const totalOneTime = useMemo(() => services.filter(s => s.type === 'one-time').reduce((acc, s) => acc + s.price, 0), [services]);
    const totalRecurring = useMemo(() => services.filter(s => s.type === 'recurring').reduce((acc, s) => acc + s.price, 0), [services]);
    
     useEffect(() => {
        if (!proposalToEdit) { // Only set template for new proposals
            if (totalRecurring > 0) {
                setTerms(userProfile?.proposalRecurringTemplate ?? 'Termos para serviços recorrentes...');
            } else {
                setTerms(userProfile?.proposalOneTimeTemplate ?? 'Termos para serviço único...');
            }
        }
    }, [totalOneTime, totalRecurring, userProfile, proposalToEdit]);
    
    const formatCurrency = (value: number) => {
        return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };
    
    const formatCurrencyInput = (value: number) => {
        if (value === 0) return '';
        return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const createProposalObject = (): Proposal => {
        const { tableData, summaryTable, analysis: analysisText, recommendations, hashtags, groundingChunks } = analysis;
        const cleanAnalysisResult: AnalysisResult = { tableData, summaryTable, analysis: analysisText, recommendations, hashtags, groundingChunks };

        return {
            id: proposalToEdit ? proposalToEdit.id : crypto.randomUUID(),
            analysisId: analysis.id,
            clientName: analysis.companyName,
            status: proposalToEdit ? proposalToEdit.status : 'Draft',
            createdAt: proposalToEdit ? proposalToEdit.createdAt : new Date(),
            services,
            totalOneTimeValue: totalOneTime,
            totalRecurringValue: totalRecurring,
            analysisResult: cleanAnalysisResult,
            clientEmail: clientEmail,
            contactName: contactName,
            contactPhone: contactPhone,
            termsAndConditions: terms,
        };
    };
    
    const handleSave = async () => {
        setIsSaving(true);
        try {
            const proposal = createProposalObject();
            await onSaveProposal(proposal);
            alert('Orçamento salvo com sucesso!');
            onBack();
        } catch (error) {
            console.error("Erro ao salvar o orçamento:", error);
            alert("Ocorreu um erro ao salvar o orçamento. Por favor, tente novamente.");
            setIsSaving(false);
        }
    };

    const handleSaveAndPreview = async () => {
        setIsPreviewing(true);
        try {
            const newProposal = createProposalObject();
            await onSaveProposal(newProposal);
            await generateProposalPDF('bloburl');
        } catch (err) {
            console.error("Falha ao gerar a pré-visualização do PDF", err);
            alert("Ocorreu um erro ao salvar e gerar a pré-visualização. Por favor, tente novamente.");
        } finally {
            setIsPreviewing(false);
        }
    };
    
    const generateProposalPDF = async (outputType: 'bloburl' | 'save' = 'bloburl') => {
        const doc = new jsPDF();
        const agency = userProfile;
        
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(agency?.companyName || 'Sua Agência', 14, 20);
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${agency?.companyStreet || ''}, ${agency?.companyNumber || ''} - ${agency?.companyNeighborhood || ''}`, 14, 26);
        doc.text(`${agency?.companyCity || ''}, ${agency?.companyState || ''} - CEP: ${agency?.companyCep || ''}`, 14, 30);
        doc.text(`CNPJ: ${agency?.companyCnpj || ''}`, 14, 34);
        doc.text(`Contato: ${agency?.companyEmail || ''} | ${agency?.companyPhone || ''}`, 14, 38);

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('Proposta de Serviços', 14, 55);
        
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        
        let currentY = 62;
        doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, currentY);
        currentY += 6;
        doc.text(`Cliente: ${analysis.companyName}`, 14, currentY);
        
        if (contactName) {
            currentY += 6;
            doc.text(`A/C: ${contactName}`, 14, currentY);
        }
        if (contactPhone) {
            currentY += 6;
            doc.text(`Telefone: ${contactPhone}`, 14, currentY);
        }
        
        const tableBody = services.map(s => [
            s.description,
            s.type === 'one-time' ? 'Pag. Único' : 'Mensal',
            formatCurrency(s.price)
        ]);

        autoTable(doc, {
            startY: currentY + 8,
            head: [['Descrição do Serviço', 'Tipo', 'Valor']],
            body: tableBody,
            theme: 'striped',
            headStyles: { fillColor: [0, 123, 255] },
        });

        const lastTableY = (doc as any).lastAutoTable.finalY;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        if (totalOneTime > 0) {
            doc.text(`Total (Pagamento Único): ${formatCurrency(totalOneTime)}`, 14, lastTableY + 15);
        }
        if (totalRecurring > 0) {
             doc.text(`Total (Mensal): ${formatCurrency(totalRecurring)}`, 14, lastTableY + (totalOneTime > 0 ? 22 : 15));
        }

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

    return (
        <>
            <header className="dashboard-header">
                <h1>{proposalToEdit ? 'Editar Orçamento' : 'Gerador de Orçamento'}</h1>
                <button className="back-button" onClick={onBack} style={{marginBottom: 0}}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                    Voltar
                </button>
            </header>
            <main>
                <div className="card">
                     <p className="form-description">Orçamento para: <strong>{analysis.companyName}</strong></p>

                    <div className="contact-info-grid">
                        <div className="form-group">
                            <label htmlFor="contactName">Nome do contato (opcional)</label>
                            <input
                                id="contactName"
                                type="text"
                                placeholder="Ex: João Silva"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="contactPhone">Telefone do contato (opcional)</label>
                            <input
                                id="contactPhone"
                                type="tel"
                                placeholder="(00) 00000-0000"
                                value={contactPhone}
                                onChange={handlePhoneChange}
                                maxLength={15}
                            />
                        </div>
                    </div>
                     
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
                            <div key={service.id} className="service-item-wrapper">
                                <h4 className="service-item-title">{service.type === 'one-time' ? 'Pagamento Único' : 'Recorrente'}</h4>
                                <div className="service-item-controls">
                                    <div className="input-group service-description-input">
                                        <textarea
                                            placeholder="Descrição do Serviço"
                                            value={service.description}
                                            onChange={(e) => handleServiceChange(service.id, 'description', e.target.value)}
                                            rows={1}
                                        />
                                    </div>
                                    <div className="input-group service-price-input">
                                        <span>R$</span>
                                        <input
                                            type="text"
                                            placeholder="0,00"
                                            value={formatCurrencyInput(service.price)}
                                            onChange={(e) => handlePriceChange(service.id, e.target.value)}
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

                <div className="card">
                    <h3>Termos e Condições</h3>
                    <textarea value={terms} onChange={e => setTerms(e.target.value)} rows={8}></textarea>
                </div>
                
                 <div className="card email-card">
                    <h3>Enviar por Email (Opcional)</h3>
                    <p className="form-description">Insira o e-mail do cliente para enviar uma cópia da proposta.</p>
                     <div className="form-group">
                        <label htmlFor="clientEmail">Email do cliente</label>
                        <input
                            id="clientEmail"
                            type="email"
                            placeholder="email@exemplo.com"
                            value={clientEmail}
                            onChange={(e) => setClientEmail(e.target.value)}
                        />
                    </div>
                 </div>

                <div className="proposal-actions">
                     <button className="btn-cancel" onClick={onBack} disabled={isSaving || isPreviewing}>Cancelar</button>
                     <button 
                        type="button" 
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={isSaving || isPreviewing}
                     >
                        {isSaving ? 'Salvando...' : 'Salvar Orçamento'}
                    </button>
                    <button className="btn-success" onClick={handleSaveAndPreview} disabled={isSaving || isPreviewing}>
                        {isPreviewing ? 'Gerando PDF...' : 'Salvar e Pré-visualizar PDF'}
                    </button>
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
                             <object data={pdfUrl} type="application/pdf" title="Pré-visualização de PDF">
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--icon-color)' }}>
                                    <h3>Oops! Não foi possível exibir o PDF.</h3>
                                    <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem' }}>Seu navegador pode não ser compatível com a pré-visualização. Por favor, use o botão abaixo para baixar o arquivo.</p>
                                    <a 
                                        href={pdfUrl} 
                                        download={`proposta_${analysis.companyName.replace(/\s+/g, '_')}.pdf`}
                                        className="pdf-download-btn"
                                    >
                                        Baixar PDF
                                    </a>
                                </div>
                            </object>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default ProposalBuilderPage;