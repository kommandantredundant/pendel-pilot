import { createContext, useContext, useState, useEffect } from 'react';
import { detectLanguage, type Language } from './i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // A stored choice wins; otherwise follow the browser's language (German or English).
  const [language, setLanguage] = useState<Language>(() => {
    try {
      const stored = localStorage.getItem('language');
      if (stored === 'en' || stored === 'de') return stored;
    } catch {
      // Storage may be unavailable (private mode).
    }
    return detectLanguage(typeof navigator !== 'undefined' ? navigator.languages : undefined);
  });

  // Screen readers and hyphenation follow the page language.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    try {
      localStorage.setItem('language', lang);
    } catch {
      // The choice then lasts for this page view.
    }
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
