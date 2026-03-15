import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";
import axios from "axios";
import firebaseConfig from "./firebase-applet-config.json" assert { type: "json" };

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = admin.firestore();
if (firebaseConfig.firestoreDatabaseId) {
  // Note: In some versions of firebase-admin, you might need to specify the databaseId differently
  // but for standard setups, the projectId is enough if it's the default database.
  // If it's a named database, we might need to use the full SDK capabilities.
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Instagram Webhook Verification
  app.get("/api/instagram/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const VERIFY_TOKEN = process.env.INSTAGRAM_VERIFY_TOKEN || "uninter_caratinga_token";

    if (mode && token) {
      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("WEBHOOK_VERIFIED");
        res.status(200).send(challenge);
      } else {
        res.sendStatus(403);
      }
    }
  });

  // Instagram Webhook Message Handling
  app.post("/api/instagram/webhook", async (req, res) => {
    const body = req.body;

    console.log("Webhook received payload:", JSON.stringify(body, null, 2));

    // Log the raw event for debugging
    try {
      await db.collection('webhook_events').add({
        payload: body,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) {
      console.error("Error logging webhook event:", e);
    }

    // Handle WhatsApp
    if (body.object === "whatsapp_business_account") {
      try {
        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message && message.type === "text") {
          const senderId = message.from;
          const messageText = message.text.body;

          console.log(`Processing WhatsApp message from ${senderId}: ${messageText}`);

          const configDoc = await db.collection('configs').doc('settings').get();
          const config = configDoc.data() as any;

          if (!config?.whatsappAccessToken || !config?.whatsappPhoneNumberId) {
            throw new Error("WhatsApp credentials missing in config.");
          }

          const aiResponse = await getAIResponse(config, messageText, senderId);

          const whatsappUrl = `https://graph.facebook.com/v19.0/${config.whatsappPhoneNumberId}/messages`;
          await axios.post(
            whatsappUrl,
            {
              messaging_product: "whatsapp",
              to: senderId,
              text: { body: aiResponse },
            },
            {
              headers: { Authorization: `Bearer ${config.whatsappAccessToken}` },
            }
          );

          await db.collection('logs').add({
            type: 'whatsapp_interaction',
            senderId,
            message: messageText,
            response: aiResponse,
            status: 'success',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        return res.status(200).send("EVENT_RECEIVED");
      } catch (error: any) {
        const errorMessage = error.response?.data?.error?.message || error.message;
        console.error("WhatsApp Error:", errorMessage);
        return res.status(200).send("EVENT_RECEIVED");
      }
    }

    // Handle Instagram and Facebook
    if (body.object === "instagram" || body.object === "page") {
      for (const entry of body.entry) {
        const messagingEvents = entry.messaging || [];
        
        for (const messagingEvent of messagingEvents) {
          if (messagingEvent.message && !messagingEvent.message.is_echo) {
            const senderId = messagingEvent.sender.id;
            const messageText = messagingEvent.message.text;

            if (!messageText) continue;

            console.log(`Processing ${body.object} message from ${senderId}: ${messageText}`);
            
            try {
              const configDoc = await db.collection('configs').doc('settings').get();
              const config = configDoc.data() as any;

              if (!config.instagramAccessToken || !config.instagramPageId) {
                throw new Error(`${body.object} credentials missing in config.`);
              }

              const aiResponse = await getAIResponse(config, messageText, senderId);

              const instagramUrl = `https://graph.facebook.com/v19.0/${config.instagramPageId}/messages`;
              await axios.post(
                instagramUrl,
                {
                  recipient: { id: senderId },
                  message: { text: aiResponse },
                },
                {
                  params: { access_token: config.instagramAccessToken },
                }
              );

              await db.collection('logs').add({
                type: body.object === "instagram" ? 'instagram_interaction' : 'facebook_interaction',
                senderId,
                message: messageText,
                response: aiResponse,
                status: 'success',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
              });
            } catch (error: any) {
              const errorMessage = error.response?.data?.error?.message || error.message;
              console.error(`${body.object} Error:`, errorMessage);
              
              await db.collection('logs').add({
                type: body.object === "instagram" ? 'instagram_error' : 'facebook_error',
                senderId: messagingEvent.sender.id,
                message: messageText,
                error: errorMessage,
                status: 'error',
                timestamp: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          }
        }
      }
      res.status(200).send("EVENT_RECEIVED");
    } else {
      console.log("Received non-supported object:", body.object);
      res.sendStatus(404);
    }
  });

  async function getAIResponse(config: any, messageText: string, senderId: string) {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // 1. Fetch recent history for context
    let history: any[] = [];
    try {
      const historySnap = await db.collection('logs')
        .where('senderId', '==', senderId)
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();
      
      // Map to Gemini format (oldest first)
      history = historySnap.docs.reverse().map(doc => {
        const data = doc.data();
        return [
          { role: "user", parts: [{ text: data.message }] },
          { role: "model", parts: [{ text: data.response }] }
        ];
      }).flat();
    } catch (e) {
      console.error("Error fetching history:", e);
    }

    const isFirstContact = history.length === 0;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
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

            MENSAGEM ATUAL DO USUÁRIO:
            ${messageText}
          `}]
        }
      ],
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    return result.text || "Olá! Como posso ajudar você hoje?";
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
