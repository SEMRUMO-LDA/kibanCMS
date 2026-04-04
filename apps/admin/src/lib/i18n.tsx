/**
 * i18n — Internationalization for kibanCMS Admin
 * Supports PT-PT and EN. Add more languages by extending the translations object.
 * Usage: const { t, locale, setLocale } = useI18n();
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

export type Locale = 'pt' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Sidebar
    'nav.main': 'Main',
    'nav.dashboard': 'Dashboard',
    'nav.content': 'Content',
    'nav.media': 'Media',
    'nav.system': 'System',
    'nav.users': 'Users',
    'nav.activity': 'Activity',
    'nav.addons': 'Add-ons',
    'nav.settings': 'Settings',
    'nav.quickSearch': 'Quick search',
    'nav.signOut': 'Sign Out',

    // Dashboard
    'dashboard.greeting.morning': 'Good morning',
    'dashboard.greeting.afternoon': 'Good afternoon',
    'dashboard.greeting.evening': 'Good evening',
    'dashboard.subtitle': "Here's what's happening with your content",
    'dashboard.entries': 'Entries',
    'dashboard.collections': 'Collections',
    'dashboard.media': 'Media',
    'dashboard.team': 'Team',
    'dashboard.contentItems': 'Content items',
    'dashboard.schemas': 'Schemas',
    'dashboard.filesUploaded': 'Files uploaded',
    'dashboard.members': 'Members',
    'dashboard.newEntry': 'New Entry',
    'dashboard.createContent': 'Create content',
    'dashboard.uploadMedia': 'Upload Media',
    'dashboard.imagesFiles': 'Images & files',
    'dashboard.newCollection': 'New Collection',
    'dashboard.aiOrManual': 'AI or manual',
    'dashboard.apiKeys': 'API Keys',
    'dashboard.integrationSetup': 'Integration setup',
    'dashboard.recentDrafts': 'Recent Drafts',
    'dashboard.noDrafts': 'No drafts — all content is published',
    'dashboard.recentActivity': 'Recent Activity',
    'dashboard.noActivity': 'No activity yet',
    'dashboard.entriesByCollection': 'Entries by Collection',
    'dashboard.noCollections': 'No collections yet',
    'dashboard.scheduled': 'Scheduled',
    'dashboard.noScheduled': 'No scheduled content',
    'dashboard.systemStatus': 'System Status',
    'dashboard.dbConnected': 'Database connected',
    'dashboard.apiKeysActive': 'API keys active',
    'dashboard.viewAll': 'View all',
    'dashboard.slowConnection': 'Some data may be incomplete — connection was slow.',
    'dashboard.retry': 'Retry',

    // Collections
    'collections.title': 'Content Collections',
    'collections.newCollection': 'New Collection',
    'collections.noCollections': 'No Collections Found',
    'collections.getCode': 'Get Code',
    'collections.loading': 'Loading collections...',

    // Entries
    'entries.createEntry': 'Create Entry',
    'entries.noEntries': 'No entries yet',
    'entries.search': 'Search by title or slug...',
    'entries.all': 'all',
    'entries.draft': 'draft',
    'entries.published': 'published',
    'entries.review': 'review',
    'entries.archived': 'archived',
    'entries.selected': 'selected',
    'entries.selectAction': 'Select action...',
    'entries.publish': 'Publish',
    'entries.archive': 'Archive',
    'entries.delete': 'Delete',
    'entries.apply': 'Apply',
    'entries.clear': 'Clear',

    // Entry Editor
    'editor.editEntry': 'Edit Entry',
    'editor.createEntry': 'Create New Entry',
    'editor.history': 'History',
    'editor.preview': 'Preview',
    'editor.hidePreview': 'Hide Preview',
    'editor.saving': 'Saving...',
    'editor.saved': 'Saved',
    'editor.unsavedChanges': 'You have unsaved changes. Leave anyway?',
    'editor.updateEntry': 'Update Entry',

    // Media
    'media.title': 'Media Library',
    'media.subtitle': 'Upload and manage images, videos, and files',
    'media.dropFiles': 'Drop files to upload',
    'media.browse': 'browse',
    'media.uploading': 'Uploading',
    'media.allFiles': 'All Files',
    'media.images': 'Images',
    'media.videos': 'Videos',
    'media.documents': 'Documents',

    // Users
    'users.title': 'Users',
    'users.subtitle': 'Manage team members and permissions',
    'users.inviteUser': 'Invite User',

    // Settings
    'settings.title': 'Settings',
    'settings.save': 'Save',
    'settings.saved': 'Settings saved',
    'settings.general': 'General',
    'settings.api': 'API',
    'settings.media': 'Media',
    'settings.permalinks': 'Permalinks',
    'settings.privacy': 'Privacy',
    'settings.email': 'Email',

    // Activity
    'activity.title': 'Activity Log',
    'activity.noActivity': 'No activity yet. Start creating content!',
    'activity.created': 'created',
    'activity.updated': 'updated',
    'activity.in': 'in',

    // Add-ons
    'addons.title': 'Add-ons',
    'addons.subtitle': 'Extend kibanCMS with powerful modules — install with one click',
    'addons.allAddons': 'All Add-ons',
    'addons.installed': 'Installed',
    'addons.install': 'Install',
    'addons.installing': 'Installing...',
    'addons.uninstall': 'Uninstall',
    'addons.open': 'Open',
    'addons.noInstalled': 'No add-ons installed',
    'addons.createsCollections': 'Creates collections',
    'addons.fields': 'fields',

    // Common
    'common.loading': 'Loading...',
    'common.back': 'Back',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search...',
    'common.confirm': 'Are you sure?',
    'common.error': 'Error',
    'common.success': 'Success',

    // Login
    'login.title': 'Sign in to access your administrative dashboard',
    'login.email': 'Email Address',
    'login.password': 'Password',
    'login.signIn': 'Sign In',
    'login.signingIn': 'Signing in...',
  },

  pt: {
    // Sidebar
    'nav.main': 'Principal',
    'nav.dashboard': 'Painel',
    'nav.content': 'Conteúdo',
    'nav.media': 'Multimédia',
    'nav.system': 'Sistema',
    'nav.users': 'Utilizadores',
    'nav.activity': 'Atividade',
    'nav.addons': 'Extensões',
    'nav.settings': 'Definições',
    'nav.quickSearch': 'Pesquisa rápida',
    'nav.signOut': 'Terminar sessão',

    // Dashboard
    'dashboard.greeting.morning': 'Bom dia',
    'dashboard.greeting.afternoon': 'Boa tarde',
    'dashboard.greeting.evening': 'Boa noite',
    'dashboard.subtitle': 'Eis o que se passa com o seu conteúdo',
    'dashboard.entries': 'Entradas',
    'dashboard.collections': 'Coleções',
    'dashboard.media': 'Multimédia',
    'dashboard.team': 'Equipa',
    'dashboard.contentItems': 'Itens de conteúdo',
    'dashboard.schemas': 'Esquemas',
    'dashboard.filesUploaded': 'Ficheiros carregados',
    'dashboard.members': 'Membros',
    'dashboard.newEntry': 'Nova Entrada',
    'dashboard.createContent': 'Criar conteúdo',
    'dashboard.uploadMedia': 'Carregar Ficheiro',
    'dashboard.imagesFiles': 'Imagens e ficheiros',
    'dashboard.newCollection': 'Nova Coleção',
    'dashboard.aiOrManual': 'IA ou manual',
    'dashboard.apiKeys': 'Chaves API',
    'dashboard.integrationSetup': 'Configurar integração',
    'dashboard.recentDrafts': 'Rascunhos Recentes',
    'dashboard.noDrafts': 'Sem rascunhos — todo o conteúdo está publicado',
    'dashboard.recentActivity': 'Atividade Recente',
    'dashboard.noActivity': 'Sem atividade ainda',
    'dashboard.entriesByCollection': 'Entradas por Coleção',
    'dashboard.noCollections': 'Sem coleções ainda',
    'dashboard.scheduled': 'Agendado',
    'dashboard.noScheduled': 'Sem conteúdo agendado',
    'dashboard.systemStatus': 'Estado do Sistema',
    'dashboard.dbConnected': 'Base de dados ligada',
    'dashboard.apiKeysActive': 'Chaves API ativas',
    'dashboard.viewAll': 'Ver tudo',
    'dashboard.slowConnection': 'Alguns dados podem estar incompletos — ligação lenta.',
    'dashboard.retry': 'Tentar novamente',

    // Collections
    'collections.title': 'Coleções de Conteúdo',
    'collections.newCollection': 'Nova Coleção',
    'collections.noCollections': 'Nenhuma Coleção Encontrada',
    'collections.getCode': 'Obter Código',
    'collections.loading': 'A carregar coleções...',

    // Entries
    'entries.createEntry': 'Criar Entrada',
    'entries.noEntries': 'Sem entradas ainda',
    'entries.search': 'Pesquisar por título ou slug...',
    'entries.all': 'todas',
    'entries.draft': 'rascunho',
    'entries.published': 'publicado',
    'entries.review': 'revisão',
    'entries.archived': 'arquivado',
    'entries.selected': 'selecionadas',
    'entries.selectAction': 'Selecionar ação...',
    'entries.publish': 'Publicar',
    'entries.archive': 'Arquivar',
    'entries.delete': 'Eliminar',
    'entries.apply': 'Aplicar',
    'entries.clear': 'Limpar',

    // Entry Editor
    'editor.editEntry': 'Editar Entrada',
    'editor.createEntry': 'Criar Nova Entrada',
    'editor.history': 'Histórico',
    'editor.preview': 'Pré-visualizar',
    'editor.hidePreview': 'Ocultar Pré-visualização',
    'editor.saving': 'A guardar...',
    'editor.saved': 'Guardado',
    'editor.unsavedChanges': 'Tem alterações não guardadas. Sair mesmo assim?',
    'editor.updateEntry': 'Atualizar Entrada',

    // Media
    'media.title': 'Biblioteca de Multimédia',
    'media.subtitle': 'Carregar e gerir imagens, vídeos e ficheiros',
    'media.dropFiles': 'Arraste ficheiros para carregar',
    'media.browse': 'procurar',
    'media.uploading': 'A carregar',
    'media.allFiles': 'Todos',
    'media.images': 'Imagens',
    'media.videos': 'Vídeos',
    'media.documents': 'Documentos',

    // Users
    'users.title': 'Utilizadores',
    'users.subtitle': 'Gerir membros da equipa e permissões',
    'users.inviteUser': 'Convidar Utilizador',

    // Settings
    'settings.title': 'Definições',
    'settings.save': 'Guardar',
    'settings.saved': 'Definições guardadas',
    'settings.general': 'Geral',
    'settings.api': 'API',
    'settings.media': 'Multimédia',
    'settings.permalinks': 'Ligações permanentes',
    'settings.privacy': 'Privacidade',
    'settings.email': 'Email',

    // Activity
    'activity.title': 'Registo de Atividade',
    'activity.noActivity': 'Sem atividade. Comece a criar conteúdo!',
    'activity.created': 'criou',
    'activity.updated': 'atualizou',
    'activity.in': 'em',

    // Add-ons
    'addons.title': 'Extensões',
    'addons.subtitle': 'Expanda o kibanCMS com módulos poderosos — instale com um clique',
    'addons.allAddons': 'Todas as Extensões',
    'addons.installed': 'Instaladas',
    'addons.install': 'Instalar',
    'addons.installing': 'A instalar...',
    'addons.uninstall': 'Desinstalar',
    'addons.open': 'Abrir',
    'addons.noInstalled': 'Nenhuma extensão instalada',
    'addons.createsCollections': 'Cria coleções',
    'addons.fields': 'campos',

    // Common
    'common.loading': 'A carregar...',
    'common.back': 'Voltar',
    'common.cancel': 'Cancelar',
    'common.save': 'Guardar',
    'common.delete': 'Eliminar',
    'common.edit': 'Editar',
    'common.create': 'Criar',
    'common.search': 'Pesquisar...',
    'common.confirm': 'Tem a certeza?',
    'common.error': 'Erro',
    'common.success': 'Sucesso',

    // Login
    'login.title': 'Inicie sessão para aceder ao painel administrativo',
    'login.email': 'Endereço de Email',
    'login.password': 'Palavra-passe',
    'login.signIn': 'Entrar',
    'login.signingIn': 'A entrar...',
  },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem('kiban-locale');
    return (saved === 'pt' || saved === 'en') ? saved : 'en';
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem('kiban-locale', l);
  }, []);

  const t = useCallback((key: string): string => {
    return translations[locale][key] || translations['en'][key] || key;
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);
