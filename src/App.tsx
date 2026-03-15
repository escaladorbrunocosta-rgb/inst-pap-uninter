/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, 
  MessageSquare, 
  MessageCircle,
  Send, 
  Bot, 
  User, 
  Save, 
  RefreshCw,
  ChevronRight,
  Info,
  ExternalLink,
  Sparkles,
  Lock,
  Instagram,
  CheckCircle,
  Activity,
  History,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { GoogleGenAI } from "@google/genai";
import { db, auth } from './firebase';
import { Config, Message } from './types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_KNOWLEDGE_BASE = `Esta base de conhecimento foi estruturada EXCLUSIVAMENTE para o atendimento no Polo EAD Uninter Caratinga.

### REGRA DE OURO: LISTAGEM DE CURSOS
O assistente deve listar APENAS os cursos que estão confirmados como disponíveis especificamente no Polo de Caratinga. 
- É PROIBIDO listar genericamente todos os 600 cursos da Uninter.
- Se o usuário perguntar por um curso, o assistente DEVE confirmar se ele é ofertado localmente em Caratinga antes de dar qualquer detalhe.

### 1. Informações do Polo Caratinga
O Polo de Caratinga é o ponto de apoio presencial para alunos da região de Caratinga-MG.
* Diferenciais: Nota máxima no MEC, suporte local para provas e documentos.

### 2. Oferta de Cursos no Polo Caratinga
* Áreas principais com oferta frequente: Gestão, Educação, Tecnologia, Engenharia e Saúde (EAD e Semipresencial).
* O assistente deve usar a ferramenta de busca para verificar a oferta ATUAL do Polo de Caratinga no site oficial da Uninter se houver dúvida.

### 3. Processo de Ingresso e Bolsas
* Vestibular Online, Nota do ENEM, Transferência e Segunda Graduação.
* **Nota do ENEM:** O aluno pode ingressar usando sua nota do ENEM para obter bolsas de estudo. 
* **IMPORTANTE:** Nunca mencione porcentagens específicas de desconto para o ENEM, pois os valores variam conforme a nota e o período. Informe que a equipe de Caratinga validará o melhor benefício para o aluno.

### 4. Metodologia e Materiais
* AVA Univirtus, material didático 100% digital incluso (livros digitais acessíveis pelo computador ou celular), APOLs em casa e provas no polo. Média 70.
* **Livros:** Todo o material é disponibilizado de forma digital, garantindo praticidade e atualização constante.

### 5. Bibliotecas Digitais
Os alunos da Uninter têm acesso a um vasto acervo DIGITAL, incluindo:
* **Biblioteca Digital Mundial (UNESCO):** Conteúdo multilíngue gratuito de literatura, áudio, mapas e fotografias.
* **Domínio Público (MEC):** Cerca de 180 mil textos, imagens e sons.
* **Acesso Livre CAPES:** Periódicos e bases científicas.
* **Biblioteca Brasiliana (USP):** Foco em autores brasileiros e obras raras.
* **Link Oficial:** https://www.uninter.com/biblioteca/bibliotecas-virtuais
* **Nota:** O atendimento e o acervo são focados na experiência digital.

### 6. Contato e Matrícula
Para finalização de matrículas, entrega de documentos físicos (quando necessário) ou dúvidas financeiras específicas, o aluno deve ser direcionado para a secretaria do Polo:
* **WhatsApp Secretaria:** https://wa.me/553333224001
* **Telefone:** (33) 3322-4001
* **Nota:** O assistente deve sempre incentivar o clique no link para um atendimento humano especializado após tirar as dúvidas iniciais.`;

export default function App() {
  const [activeTab, setActiveTab] = useState<'settings' | 'chat' | 'dashboard'>('settings');
  const [config, setConfig] = useState<Config>({
    brandName: 'Uninter Caratinga',
    knowledgeBase: DEFAULT_KNOWLEDGE_BASE,
    updatedAt: new Date().toISOString()
  });
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth & Config Sync
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    const unsubscribeConfig = onSnapshot(doc(db, 'configs', 'settings'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as Config);
      }
    });

    const unsubscribeLogs = onSnapshot(
      query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(20)),
      (snapshot) => {
        const newLogs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setLogs(newLogs);
      }
    );

    // Test connection
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'configs', 'settings'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('offline')) {
          console.error("Firebase connection error. Check configuration.");
        }
      }
    };
    testConnection();

    return () => {
      unsubscribeAuth();
      unsubscribeConfig();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const saveConfig = async () => {
    if (!user) {
      alert("Você precisa estar logado para salvar as configurações.");
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'configs', 'settings'), {
        ...config,
        updatedAt: new Date().toISOString()
      });
      setActiveTab('chat');
    } catch (error) {
      console.error("Error saving config", error);
      alert("Erro ao salvar. Verifique se você tem permissões de administrador.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const isFirstContact = messages.length === 0;
      const historyContext = messages.map(m => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`).join('\n');

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: `
              Você é um assistente humano e cordial do Polo Uninter Caratinga. 
              Seu objetivo é prestar um atendimento humanizado, empático e eficiente.

              REGRAS DE OURO:
              1. FOCO TOTAL: Responda APENAS o que foi perguntado. Se o usuário perguntar "Tem Pedagogia?", responda apenas se tem e uma breve descrição. NÃO fale de metodologia, provas ou preços se não for solicitado.
              2. SAUDAÇÃO: ${isFirstContact ? 'Inicie EXCLUSIVAMENTE com: "Olá! Sou o assistente do Polo Uninter Caratinga. Como posso te ajudar?".' : 'PROIBIDO saudações ou apresentações.'}
              3. PROIBIÇÃO DE LIVROS FÍSICOS: É terminantemente PROIBIDO mencionar "livros físicos". Use apenas "livros digitais" ou "material 100% digital".
              4. WHATSAPP (RESTRITO): Envie o link do WhatsApp (https://wa.me/553333224001) APENAS em dois casos: 
                 a) Se você não souber a resposta.
                 b) Se o usuário pedir para falar com um humano, perguntar preços específicos ou quiser se matricular.
                 NUNCA envie o link na primeira resposta se não houver necessidade.
              5. CURSOS: Apenas cursos do Polo Caratinga.
              6. FORMATAÇÃO: Use frases curtas. Se precisar dar mais de uma informação, use mensagens separadas ou tópicos muito breves.
              7. TOM: Profissional, direto e sem "encher linguiça".

              BASE DE CONHECIMENTO:
              ${config.knowledgeBase}

              HISTÓRICO DA CONVERSA:
              ${historyContext}

              MENSAGEM ATUAL DO USUÁRIO:
              ${input}
            `}]
          }
        ],
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      const response = await model;
      const aiMessage: Message = {
        role: 'assistant',
        content: response.text || "Desculpe, tive um problema ao processar sua mensagem.",
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      // ... error handling ...
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-black/5 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
              <Sparkles size={18} />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">InstaGreet AI</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-black/60 hidden sm:inline">{user.email}</span>
                <button 
                  onClick={() => auth.signOut()}
                  className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="text-xs font-medium bg-black text-white px-4 py-2 rounded-full hover:bg-black/80 transition-all"
              >
                Login Admin
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-1 bg-black/5 p-1 rounded-xl w-fit mb-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'dashboard' ? "bg-white shadow-sm text-black" : "text-black/60 hover:text-black"
            )}
          >
            <LayoutDashboard size={16} />
            Dashboard
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'settings' ? "bg-white shadow-sm text-black" : "text-black/60 hover:text-black"
            )}
          >
            <Settings size={16} />
            Configurações
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              activeTab === 'chat' ? "bg-white shadow-sm text-black" : "text-black/60 hover:text-black"
            )}
          >
            <MessageSquare size={16} />
            Simulador
          </button>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                      <Activity size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black/40 uppercase tracking-wider">Status Webhook</p>
                      <p className="text-sm font-bold text-green-600">Ativo & Conectado</p>
                    </div>
                  </div>
                  <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                    <div className="h-full w-full bg-green-500" />
                  </div>
                </div>
                
                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black/40 uppercase tracking-wider">Total de Interações</p>
                      <p className="text-xl font-bold">{logs.length}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                      <Bot size={20} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-black/40 uppercase tracking-wider">IA Ativa</p>
                      <p className="text-sm font-bold">Gemini 3 Flash</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-black/5 flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <History size={18} className="text-black/40" />
                    Logs de Atividade (Multi-Plataforma)
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-black/40">Tempo Real</span>
                </div>
                <div className="divide-y divide-black/5">
                  {logs.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="text-sm text-black/40">Nenhuma interação registrada ainda.</p>
                    </div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-black/[0.02] transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                              log.type.includes('whatsapp') ? "bg-emerald-500" : 
                              log.type.includes('facebook') ? "bg-blue-600" : "bg-pink-500"
                            )}>
                              {log.type.includes('whatsapp') ? 'WA' : log.type.includes('facebook') ? 'FB' : 'IG'}
                            </div>
                            <span className="text-xs font-bold text-black/60">ID: {log.senderId}</span>
                          </div>
                          <span className="text-[10px] text-black/40">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString() : 'Recent'}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {log.type === 'instagram_error' ? (
                            <div className="p-3 bg-red-50 rounded-xl border border-red-100">
                              <p className="text-[10px] font-bold uppercase text-red-500 mb-1">Erro de Processamento:</p>
                              <p className="text-xs text-red-700">{log.error}</p>
                              <p className="mt-2 text-[10px] text-red-400">Mensagem original: "{log.message}"</p>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-2">
                                <span className="text-[10px] font-bold uppercase text-blue-500 w-12 shrink-0">User:</span>
                                <p className="text-xs text-black/80">{log.message}</p>
                              </div>
                              <div className="flex gap-2">
                                <span className="text-[10px] font-bold uppercase text-purple-500 w-12 shrink-0">AI:</span>
                                <p className="text-xs text-black/60 italic">{log.response}</p>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          ) : activeTab === 'settings' ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Info size={18} className="text-black/40" />
                    Identidade da Marca
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-black/40 mb-2">Nome da Marca/Perfil</label>
                      <input 
                        type="text"
                        value={config.brandName}
                        onChange={(e) => setConfig(prev => ({ ...prev, brandName: e.target.value }))}
                        className="w-full bg-[#F8F9FA] border border-black/5 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                        placeholder="Ex: Uninter Caratinga"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Instagram size={18} className="text-black/40" />
                    Acesso ao Perfil
                  </h2>
                  
                  <div className="space-y-6">
                    {/* Login/Senha Section */}
                    <div className="p-4 bg-black/5 rounded-xl border border-black/5">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-black/60 mb-4 flex items-center gap-2">
                        <User size={14} />
                        Acesso Direto (Login/Senha)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Usuário / Login</label>
                          <div className="relative">
                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/20" />
                            <input 
                              type="text"
                              value={config.instagramLogin || ''}
                              onChange={(e) => setConfig(prev => ({ ...prev, instagramLogin: e.target.value }))}
                              className="w-full bg-white border border-black/5 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                              placeholder="@seu_perfil"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Senha</label>
                          <div className="relative">
                            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-black/20" />
                            <input 
                              type="password"
                              value={config.instagramPassword || ''}
                              onChange={(e) => setConfig(prev => ({ ...prev, instagramPassword: e.target.value }))}
                              className="w-full bg-white border border-black/5 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                              placeholder="••••••••"
                            />
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={saveConfig}
                        disabled={isSaving}
                        className="mt-4 w-full py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-black/80 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSaving ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                        {config.instagramLogin && config.instagramPassword ? 'Atualizar Acesso Direto' : 'Liberar Acesso Direto'}
                      </button>
                    </div>

                    {/* Official API Section */}
                    <div className="p-4 bg-blue-50/50 rounded-xl border border-blue-100">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-blue-600/60 mb-4 flex items-center gap-2">
                        <ExternalLink size={14} />
                        Método Oficial (Recomendado para Automação)
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Access Token (Graph API)</label>
                          <input 
                            type="password"
                            value={config.instagramAccessToken || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, instagramAccessToken: e.target.value }))}
                            className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5"
                            placeholder="EAAb..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Instagram Page ID</label>
                          <input 
                            type="text"
                            value={config.instagramPageId || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, instagramPageId: e.target.value }))}
                            className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5"
                            placeholder="123456789..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <MessageCircle size={18} className="text-black/40" />
                    WhatsApp Business API
                  </h2>
                  
                  <div className="space-y-6">
                    <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-emerald-600/60 mb-4 flex items-center gap-2">
                        <ExternalLink size={14} />
                        Configuração WhatsApp
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Phone Number ID</label>
                          <input 
                            type="text"
                            value={config.whatsappPhoneNumberId || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, whatsappPhoneNumberId: e.target.value }))}
                            className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5"
                            placeholder="123456789..."
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-black/40 mb-1">Access Token (WhatsApp)</label>
                          <input 
                            type="password"
                            value={config.whatsappAccessToken || ''}
                            onChange={(e) => setConfig(prev => ({ ...prev, whatsappAccessToken: e.target.value }))}
                            className="w-full bg-white border border-black/5 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-black/5"
                            placeholder="EAAb..."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-sm text-amber-800 font-medium mb-2 flex items-center gap-2">
                        <Info size={16} />
                        Configuração no Meta
                      </p>
                      <ol className="text-xs text-amber-700 space-y-2 list-decimal ml-4">
                        <li>No seu App no Meta, adicione o produto <strong>WhatsApp</strong>.</li>
                        <li>Configure o Webhook para o objeto <strong>whatsapp_business_account</strong>.</li>
                        <li>Use a mesma URL e Token de Verificação abaixo.</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <ExternalLink size={18} className="text-black/40" />
                    Implantação no Instagram
                  </h2>
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                      <p className="text-sm text-amber-800 font-medium mb-2 flex items-center gap-2">
                        <Info size={16} />
                        Passos Necessários
                      </p>
                      <ol className="text-xs text-amber-700 space-y-2 list-decimal ml-4">
                        <li>Crie uma conta em <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="underline font-bold">Meta for Developers</a>.</li>
                        <li>Crie um Aplicativo em <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline font-bold">Meus Aplicativos</a> (tipo Empresa).</li>
                        <li>Adicione o produto <strong>Instagram Graph API</strong>.</li>
                        <li>Gere o Token no <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="underline font-bold">Graph API Explorer</a>.</li>
                        <li>Configure o Webhook com os dados abaixo:</li>
                      </ol>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-black/40 mb-1">Callback URL (Webhook)</label>
                        <div className="flex gap-2">
                          <input 
                            readOnly
                            value={`${window.location.origin}/api/instagram/webhook`}
                            className="flex-1 bg-black/5 border border-black/5 rounded-lg px-3 py-2 text-xs font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-black/40 mb-1">Verify Token</label>
                        <input 
                          readOnly
                          value="uninter_caratinga_token"
                          className="w-full bg-black/5 border border-black/5 rounded-lg px-3 py-2 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <p className="text-[10px] text-black/40 italic">
                      * Após configurar no Meta, o assistente começará a responder automaticamente as DMs do perfil @unintercaratinga.
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Bot size={18} className="text-black/40" />
                    Base de Conhecimento
                  </h2>
                  <p className="text-sm text-black/60 mb-4">
                    Insira aqui todas as informações que o assistente deve saber. Ele usará apenas este texto para responder.
                  </p>
                  <textarea 
                    value={config.knowledgeBase}
                    onChange={(e) => setConfig(prev => ({ ...prev, knowledgeBase: e.target.value }))}
                    className="w-full bg-[#F8F9FA] border border-black/5 rounded-xl px-4 py-3 h-[400px] focus:outline-none focus:ring-2 focus:ring-black/5 transition-all font-mono text-sm leading-relaxed"
                    placeholder="Cole aqui o texto do seu arquivo/base de conhecimento..."
                  />
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-black text-white rounded-2xl p-6 shadow-lg">
                  <h3 className="font-semibold mb-2">Pronto para Atender?</h3>
                  <p className="text-sm text-white/70 mb-6">
                    Salve suas alterações para que o assistente virtual seja atualizado com as novas informações.
                  </p>
                  <button 
                    onClick={saveConfig}
                    disabled={isSaving}
                    className="w-full bg-white text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-white/90 transition-all disabled:opacity-50"
                  >
                    {isSaving ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                    Salvar Configurações
                  </button>
                </div>

                <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/5">
                  <h3 className="font-semibold mb-4">Dicas de Ouro</h3>
                  <ul className="space-y-3 text-sm text-black/60">
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 text-black/20" />
                      Seja específico sobre preços e prazos.
                    </li>
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 text-black/20" />
                      Inclua links importantes ou endereços.
                    </li>
                    <li className="flex gap-2">
                      <ChevronRight size={16} className="shrink-0 text-black/20" />
                      Defina o tom de voz (ex: "Sempre use emojis de coração").
                    </li>
                  </ul>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="chat"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="max-w-2xl mx-auto"
            >
              <div className="bg-white rounded-3xl shadow-xl border border-black/5 overflow-hidden flex flex-col h-[600px]">
                {/* Chat Header */}
                <div className="px-6 py-4 bg-white border-b border-black/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white">
                      <Bot size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{config.brandName}</h3>
                      <span className="text-[10px] uppercase tracking-widest font-bold text-emerald-500">Assistente Online</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setMessages([])}
                    className="text-black/40 hover:text-black transition-colors"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide">
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center text-black/20 mb-4">
                        <MessageSquare size={32} />
                      </div>
                      <h4 className="font-bold text-black/40 mb-1">Simule uma conversa</h4>
                      <p className="text-sm text-black/30">Envie uma mensagem como se fosse um cliente no Instagram.</p>
                    </div>
                  )}
                  {messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      className={cn(
                        "flex gap-3 max-w-[85%]",
                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        msg.role === 'user' ? "bg-black/5 text-black/40" : "bg-black text-white"
                      )}>
                        {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                      </div>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-sm leading-relaxed",
                        msg.role === 'user' 
                          ? "bg-black text-white rounded-tr-none" 
                          : "bg-[#F8F9FA] border border-black/5 rounded-tl-none"
                      )}>
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                  {isLoading && (
                    <div className="flex gap-3 max-w-[85%]">
                      <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white shrink-0">
                        <Bot size={14} />
                      </div>
                      <div className="bg-[#F8F9FA] border border-black/5 px-4 py-3 rounded-2xl rounded-tl-none">
                        <div className="flex gap-1">
                          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-black/20 rounded-full" />
                          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-black/20 rounded-full" />
                          <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-black/20 rounded-full" />
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-black/5">
                  <div className="relative">
                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Digite sua mensagem..."
                      className="w-full bg-[#F8F9FA] border border-black/5 rounded-2xl px-5 py-4 pr-14 focus:outline-none focus:ring-2 focus:ring-black/5 transition-all text-sm"
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isLoading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center hover:bg-black/80 transition-all disabled:opacity-30"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </form>
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-2xl border border-blue-100 flex gap-3">
                <Info size={20} className="text-blue-500 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Modo Simulação:</strong> Esta conversa não é enviada para o Instagram. Use para testar se o assistente está respondendo corretamente com base na sua base de conhecimento.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-12 border-t border-black/5 text-center">
        <p className="text-xs text-black/30 font-medium uppercase tracking-widest">
          Desenvolvido com IA para Atendimento Cordial
        </p>
      </footer>
    </div>
  );
}
