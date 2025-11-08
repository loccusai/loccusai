import React, { useState, useEffect, useRef } from 'react';
import { UserProfile } from '../../types';

interface ProfileDropdownProps {
    user: UserProfile;
    onLogout: () => void;
    onNavigateToProfile: () => void;
    onNavigateToSettings: () => void;
}

const ProfileDropdown = ({ user, onLogout, onNavigateToProfile, onNavigateToSettings }: ProfileDropdownProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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

export default ProfileDropdown;