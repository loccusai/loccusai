import React from 'react';
import { UserProfile } from '../../types';
import ProfileDropdown from './ProfileDropdown';
import ThemeSwitch from './ThemeSwitch';

type DashboardView = 'history' | 'app' | 'proposalsList' | 'serviceLibrary' | 'settings';

interface SidebarProps {
    activeView: DashboardView;
    onNavigate: (view: DashboardView) => void;
    userProfile: UserProfile | null;
    onLogout: () => void;
    theme: string;
    toggleTheme: () => void;
    isOpen: boolean;
    onClose: () => void;
}

const NavLink = ({ view, activeView, onNavigate, icon, label, onClose }: { view: DashboardView, activeView: DashboardView, onNavigate: (view: DashboardView) => void, icon: React.ReactNode, label: string, onClose: () => void }) => (
    <li>
        <a 
            href="#" 
            className={activeView === view ? 'active' : ''} 
            onClick={(e) => { e.preventDefault(); onNavigate(view); onClose(); }}
        >
            {icon}
            <span>{label}</span>
        </a>
    </li>
);

const Sidebar = ({ activeView, onNavigate, userProfile, onLogout, theme, toggleTheme, isOpen, onClose }: SidebarProps) => {
    return (
        <aside className={`sidebar ${isOpen ? 'is-open' : ''}`}>
            <div className="sidebar-header">
                <div className="landing-logo">
                    <svg className="logo-image" viewBox="0 0 142 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16 0C8.27 0 2 6.27 2 14C2 22.25 16 32 16 32S30 22.25 30 14C30 6.27 23.73 0 16 0ZM16 19C13.24 19 11 16.76 11 14C11 11.24 13.24 9 16 9C18.76 9 21 11.24 21 14C21 16.76 18.76 19 16 19Z" fill="#00A9FF"/>
                        <path d="M16 11.5L17.16 12.84L18.5 14L17.16 15.16L16 16.5L14.84 15.16L13.5 14L14.84 12.84L16 11.5Z" fill="white"/>
                        <text x="38" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="700" fill="currentColor">Loccus</text>
                        <text x="110" y="23" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="400" fill="currentColor">AI</text>
                    </svg>
                </div>
            </div>
            
            <nav className="sidebar-nav">
                <ul>
                    <NavLink 
                        view="app" 
                        activeView={activeView} 
                        onNavigate={onNavigate}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>}
                        label="Nova Análise"
                        onClose={onClose}
                    />
                    <NavLink 
                        view="history" 
                        activeView={activeView} 
                        onNavigate={onNavigate}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>}
                        label="Histórico"
                        onClose={onClose}
                    />
                    <NavLink 
                        view="proposalsList" 
                        activeView={activeView} 
                        onNavigate={onNavigate}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>}
                        label="Orçamentos"
                        onClose={onClose}
                    />
                     <NavLink 
                        view="serviceLibrary" 
                        activeView={activeView} 
                        onNavigate={onNavigate}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>}
                        label="Serviços"
                        onClose={onClose}
                    />
                     <NavLink 
                        view="settings" 
                        activeView={activeView} 
                        onNavigate={onNavigate}
                        icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>}
                        label="Configurações"
                        onClose={onClose}
                    />
                </ul>
            </nav>

            <div className="sidebar-footer">
                <ThemeSwitch theme={theme} toggleTheme={toggleTheme} />
                 {userProfile && <ProfileDropdown 
                    user={userProfile} 
                    onLogout={() => { onLogout(); onClose(); }} 
                    onNavigateToProfile={() => { onNavigate('settings'); onClose(); }}
                    onNavigateToSettings={() => { onNavigate('settings'); onClose(); }} 
                 />}
            </div>
        </aside>
    );
};

export default Sidebar;