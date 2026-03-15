export interface Config {
  brandName: string;
  knowledgeBase: string;
  instagramLogin?: string;
  instagramPassword?: string;
  instagramAccessToken?: string;
  instagramPageId?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  updatedAt: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
