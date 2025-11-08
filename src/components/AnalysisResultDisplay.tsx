import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AnalysisResult, AnalysisHistoryItem, GroundingChunk, CompanyData, SummaryPoint } from '../../types';

interface AnalysisResultDisplayProps {
    result: AnalysisResult | AnalysisHistoryItem;
    onGenerateProposal?: (analysis: AnalysisResult | AnalysisHistoryItem) => void;
}

const AnalysisResultDisplay = ({ result, onGenerateProposal }: AnalysisResultDisplayProps) => {
    const { tableData, summaryTable, analysis, recommendations, hashtags, groundingChunks } = result;
    const [feedbackMessage, setFeedbackMessage] = useState('');
    const [isFeedbackVisible, setIsFeedbackVisible] = useState(false);

    const copyToClipboard = async (text: string) => {
        if (isFeedbackVisible) return;

        try {
            await navigator.clipboard.writeText(text);
            setFeedbackMessage('Copiado para a área de transferência!');
        } catch (err) {
            console.error('Falha ao copiar texto: ', err);
            setFeedbackMessage('Não foi possível copiar o texto.');
        }

        setIsFeedbackVisible(true);
        setTimeout(() => {
            setIsFeedbackVisible(false);
        }, 2500);
    };
    
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

    const renderAnalysis = (analysisText: string) => {
        const cleanedText = analysisText.replace(/^###\s*Análise Detalhada\s*/i, '').trim();
        const points = cleanedText.split(/\n\s*(?=\*\*(.*?)\*\*\s*:)/).filter(Boolean);

        if (points.length <= 1) {
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

    const generatePdf = () => {
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text(`Análise de Presença Digital: ${(result as AnalysisHistoryItem).companyName}`, 14, 22);

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
        
        if (analysis) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text("Análise Detalhada", 14, 22);
            const splitAnalysis = doc.splitTextToSize(analysis.replace(/^###\s*Análise Detalhada\s*/i, '').trim(), 180);
            doc.setFontSize(11);
            doc.text(splitAnalysis, 14, 30);
        }

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
            <header className="dashboard-header">
                <h1>Análise: {(result as AnalysisHistoryItem).companyName}</h1>
            </header>
            <div className={`copy-notification ${isFeedbackVisible ? 'show' : ''}`}>
                {feedbackMessage}
            </div>

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

export default AnalysisResultDisplay;