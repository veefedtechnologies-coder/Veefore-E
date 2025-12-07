import { Request, Response, Express } from 'express';
import { IStorage } from './storage';
import OpenAI from 'openai';

// Initialize OpenAI with the newest model gpt-4o which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || ''
});

interface CopilotRequest {
  message: string;
  language?: string;
  context?: {
    currentPage?: string;
    userActions?: string[];
    workspaceId?: string;
  };
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

interface CopilotResponse {
  message: string;
  actions?: Array<{
    type: string;
    description: string;
    parameters: Record<string, any>;
  }>;
  suggestions?: string[];
  needsConfirmation?: boolean;
  language?: string;
}

// Multilingual system prompts
const getSystemPrompt = (language: string = 'en') => {
  const prompts = {
    en: `You are VeeFore AI Copilot, an intelligent assistant for social media management. You help users create content, schedule posts, analyze performance, set up automation, and manage their social media strategy across Instagram, YouTube, Twitter, and other platforms.

Key capabilities:
- Content creation (captions, hashtags, thumbnails, videos)
- Social media scheduling and publishing
- Analytics and performance insights
- Automation setup (DM responses, comment replies)
- Platform-specific optimization
- Team collaboration features

Always be helpful, professional, and focused on social media management tasks. Provide actionable suggestions and offer to execute tasks when possible. Use space/cosmic themes occasionally (🚀, ⭐, 🌟).`,

    es: `Eres VeeFore AI Copilot, un asistente inteligente para gestión de redes sociales. Ayudas a los usuarios a crear contenido, programar publicaciones, analizar rendimiento, configurar automatización y gestionar su estrategia de redes sociales en Instagram, YouTube, Twitter y otras plataformas.

Capacidades clave:
- Creación de contenido (leyendas, hashtags, miniaturas, videos)
- Programación y publicación en redes sociales
- Análisis e insights de rendimiento
- Configuración de automatización (respuestas DM, respuestas a comentarios)
- Optimización específica por plataforma
- Funciones de colaboración en equipo

Siempre sé útil, profesional y enfócate en tareas de gestión de redes sociales. Proporciona sugerencias accionables y ofrece ejecutar tareas cuando sea posible.`,

    fr: `Tu es VeeFore AI Copilot, un assistant intelligent pour la gestion des médias sociaux. Tu aides les utilisateurs à créer du contenu, programmer des publications, analyser les performances, configurer l'automatisation et gérer leur stratégie de médias sociaux sur Instagram, YouTube, Twitter et d'autres plateformes.

Capacités clés:
- Création de contenu (légendes, hashtags, miniatures, vidéos)
- Programmation et publication sur les médias sociaux
- Analyses et insights de performance
- Configuration d'automatisation (réponses DM, réponses aux commentaires)
- Optimisation spécifique par plateforme
- Fonctionnalités de collaboration d'équipe

Sois toujours utile, professionnel et concentré sur les tâches de gestion des médias sociaux. Fournis des suggestions exploitables et propose d'exécuter des tâches quand c'est possible.`,

    de: `Du bist VeeFore AI Copilot, ein intelligenter Assistent für Social-Media-Management. Du hilfst Benutzern dabei, Inhalte zu erstellen, Posts zu planen, Leistung zu analysieren, Automatisierung einzurichten und ihre Social-Media-Strategie auf Instagram, YouTube, Twitter und anderen Plattformen zu verwalten.

Hauptfähigkeiten:
- Inhaltserstellung (Bildunterschriften, Hashtags, Thumbnails, Videos)
- Social-Media-Planung und -Veröffentlichung
- Analyse und Leistungseinblicke
- Automatisierung einrichten (DM-Antworten, Kommentarantworten)
- Plattformspezifische Optimierung
- Team-Kollaborationsfunktionen

Sei immer hilfreich, professionell und fokussiert auf Social-Media-Management-Aufgaben. Biete umsetzbare Vorschläge und biete an, Aufgaben auszuführen, wenn möglich.`,

    hi: `आप VeeFore AI Copilot हैं, सोशल मीडिया प्रबंधन के लिए एक बुद्धिमान सहायक। आप उपयोगकर्ताओं को कंटेंट बनाने, पोस्ट शेड्यूल करने, प्रदर्शन का विश्लेषण करने, ऑटोमेशन सेटअप करने और Instagram, YouTube, Twitter और अन्य प्लेटफॉर्म पर अपनी सोशल मीडिया रणनीति प्रबंधित करने में मदद करते हैं।

मुख्य क्षमताएं:
- कंटेंट निर्माण (कैप्शन, हैशटैग, थंबनेल, वीडियो)
- सोशल मीडिया शेड्यूलिंग और प्रकाशन
- एनालिटिक्स और प्रदर्शन अंतर्दृष्टि
- ऑटोमेशन सेटअप (DM उत्तर, कमेंट उत्तर)
- प्लेटफॉर्म-विशिष्ट अनुकूलन
- टीम सहयोग सुविधाएं

हमेशा सहायक, पेशेवर बनें और सोशल मीडिया प्रबंधन कार्यों पर केंद्रित रहें। क्रियान्वित सुझाव प्रदान करें और संभव होने पर कार्य निष्पादित करने की पेशकश करें।`,

    zh: `你是VeeFore AI Copilot，一个智能社交媒体管理助手。你帮助用户创建内容、安排帖子、分析表现、设置自动化，并在Instagram、YouTube、Twitter和其他平台上管理他们的社交媒体策略。

主要功能：
- 内容创建（标题、标签、缩略图、视频）
- 社交媒体安排和发布
- 分析和表现洞察
- 自动化设置（私信回复、评论回复）
- 平台特定优化
- 团队协作功能

始终保持有用、专业，专注于社交媒体管理任务。提供可操作的建议，并在可能时提供执行任务。`,

    ja: `あなたはVeeFore AI Copilotです。ソーシャルメディア管理のためのインテリジェントアシスタントです。ユーザーがコンテンツを作成し、投稿をスケジュールし、パフォーマンスを分析し、自動化を設定し、Instagram、YouTube、Twitter、その他のプラットフォームでソーシャルメディア戦略を管理するのを支援します。

主な機能：
- コンテンツ作成（キャプション、ハッシュタグ、サムネイル、動画）
- ソーシャルメディアのスケジューリングと公開
- 分析とパフォーマンスの洞察
- 自動化設定（DMレスポンス、コメント返信）
- プラットフォーム固有の最適化
- チームコラボレーション機能

常に役立ち、プロフェッショナルで、ソーシャルメディア管理タスクに焦点を当ててください。実行可能な提案を提供し、可能な場合はタスクの実行を申し出てください。`,

    ar: `أنت VeeFore AI Copilot، مساعد ذكي لإدارة وسائل التواصل الاجتماعي. تساعد المستخدمين في إنشاء المحتوى وجدولة المنشورات وتحليل الأداء وإعداد التشغيل التلقائي وإدارة استراتيجية وسائل التواصل الاجتماعي عبر Instagram وYouTube وTwitter والمنصات الأخرى.

القدرات الرئيسية:
- إنشاء المحتوى (التسميات التوضيحية، الهاشتاغات، الصور المصغرة، الفيديوهات)
- جدولة ونشر وسائل التواصل الاجتماعي
- التحليلات ورؤى الأداء
- إعداد التشغيل التلقائي (ردود الرسائل المباشرة، ردود التعليقات)
- التحسين الخاص بالمنصة
- ميزات التعاون الجماعي

كن دائماً مفيداً ومهنياً ومركزاً على مهام إدارة وسائل التواصل الاجتماعي. قدم اقتراحات قابلة للتنفيذ واعرض تنفيذ المهام عند الإمكان.`
  };

  return prompts[language as keyof typeof prompts] || prompts.en;
};

// Content generation prompts
const getContentPrompts = (language: string = 'en') => {
  const prompts = {
    en: {
      caption: "Create an engaging social media caption",
      hashtags: "Generate relevant hashtags",
      script: "Write a video script",
      thumbnail: "Describe a thumbnail design",
      brief: "Create a content brief"
    },
    es: {
      caption: "Crear una leyenda atractiva para redes sociales",
      hashtags: "Generar hashtags relevantes",
      script: "Escribir un guión de video",
      thumbnail: "Describir un diseño de miniatura",
      brief: "Crear un brief de contenido"
    },
    fr: {
      caption: "Créer une légende engageante pour les médias sociaux",
      hashtags: "Générer des hashtags pertinents",
      script: "Écrire un script vidéo",
      thumbnail: "Décrire un design de miniature",
      brief: "Créer un brief de contenu"
    },
    hi: {
      caption: "एक आकर्षक सोशल मीडिया कैप्शन बनाएं",
      hashtags: "प्रासंगिक हैशटैग बनाएं",
      script: "एक वीडियो स्क्रिप्ट लिखें",
      thumbnail: "एक थंबनेल डिज़ाइन का वर्णन करें",
      brief: "एक कंटेंट ब्रीफ बनाएं"
    }
  };
  
  return prompts[language as keyof typeof prompts] || prompts.en;
};

// Process user message with OpenAI
async function processMessage(req: CopilotRequest): Promise<CopilotResponse> {
  const { message, language = 'en', context } = req;
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    // Prepare the conversation messages
    const messages: any[] = [
      {
        role: 'system',
        content: getSystemPrompt(language)
      }
    ];

    // Add context if available
    if (context) {
      const contextMessage = `Current context: Page: ${context.currentPage || 'unknown'}, Workspace: ${context.workspaceId || 'unknown'}`;
      messages.push({
        role: 'system',
        content: contextMessage
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call OpenAI API with gpt-4o model
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: messages,
      max_tokens: 2000,
      temperature: 0.7,
      stream: false
    });

    const aiResponse = response.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from OpenAI');
    }

    return {
      message: aiResponse,
      actions: [],
      suggestions: [],
      needsConfirmation: false,
      language: language
    };

  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Fallback response in the user's language
    const fallbackMessages = {
      en: "I'm having trouble connecting to my AI services right now. Please try again in a moment, or let me know how I can help you with your social media management tasks.",
      es: "Tengo problemas para conectarme a mis servicios de IA en este momento. Inténtalo de nuevo en un momento, o déjame saber cómo puedo ayudarte con tus tareas de gestión de redes sociales.",
      fr: "J'ai des difficultés à me connecter à mes services IA en ce moment. Veuillez réessayer dans un moment, ou dites-moi comment je peux vous aider avec vos tâches de gestion des médias sociaux.",
      hi: "मुझे अभी अपनी AI सेवाओं से जुड़ने में समस्या हो रही है। कृपया एक क्षण में फिर से कोशिश करें, या मुझे बताएं कि मैं आपके सोशल मीडिया प्रबंधन कार्यों में कैसे मदद कर सकता हूं।"
    };
    
    return {
      message: fallbackMessages[language as keyof typeof fallbackMessages] || fallbackMessages.en,
      language: language
    };
  }
}

// Create copilot routes
export function createCopilotRoutes(app: Express, storage: IStorage) {
  // P3 SECURITY: Register Privacy & GDPR Routes
  const registerPrivacyRoutes = async () => {
    try {
      const privacyModule = await import('./routes/privacy');
      app.use('/api/privacy', privacyModule.default);
      console.log('✅ P3: Privacy & GDPR API routes registered');
    } catch (error) {
      console.error('❌ P3: Failed to register privacy routes:', error);
    }
  };
  registerPrivacyRoutes();
  // Chat endpoint
  app.post('/api/copilot/chat', async (req: Request, res: Response) => {
    try {
      const { message, language, context } = req.body;

      if (!message?.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      // Parse context if it's a string
      let parsedContext;
      try {
        parsedContext = typeof context === 'string' ? JSON.parse(context) : context;
      } catch (error) {
        parsedContext = {};
      }

      const copilotRequest: CopilotRequest = {
        message: message.trim(),
        language: language || 'en',
        context: parsedContext
      };

      const response = await processMessage(copilotRequest);
      res.json(response);

    } catch (error) {
      console.error('Copilot chat error:', error);
      res.status(500).json({ 
        error: 'Internal server error',
        message: 'Sorry, I encountered an error. Please try again.'
      });
    }
  });

  // Generate content endpoint
  app.post('/api/copilot/generate', async (req: Request, res: Response) => {
    try {
      const { type, prompt, language = 'en', platform, context } = req.body;

      if (!type || !prompt) {
        return res.status(400).json({ error: 'Type and prompt are required' });
      }

      const contentPrompts = getContentPrompts(language);
      const systemPrompt = getSystemPrompt(language);
      
      let fullPrompt = `${systemPrompt}\n\nTask: ${contentPrompts[type as keyof typeof contentPrompts] || type}\nPrompt: ${prompt}`;
      
      if (platform) {
        fullPrompt += `\nPlatform: ${platform}`;
      }
      
      if (context) {
        fullPrompt += `\nContext: ${JSON.stringify(context)}`;
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: 'user', content: fullPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.8
      });

      const generatedContent = response.choices[0]?.message?.content;

      res.json({
        content: generatedContent,
        type: type,
        language: language
      });

    } catch (error) {
      console.error('Content generation error:', error);
      res.status(500).json({ 
        error: 'Failed to generate content',
        message: 'Sorry, I couldn\'t generate that content. Please try again.'
      });
    }
  });

  // Analyze content endpoint
  app.post('/api/copilot/analyze', async (req: Request, res: Response) => {
    try {
      const { content, language = 'en' } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      let analysisPrompt = `Analyze this content for social media optimization and provide suggestions:\n\n${content}`;
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          { role: 'system', content: getSystemPrompt(language) },
          { role: 'user', content: analysisPrompt }
        ],
        max_tokens: 1000
      });

      const analysis = response.choices[0]?.message?.content;
      return res.json({
        analysis: analysis,
        type: 'text',
        language: language
      });

    } catch (error) {
      console.error('Content analysis error:', error);
      res.status(500).json({ 
        error: 'Failed to analyze content',
        message: 'Sorry, I couldn\'t analyze that content. Please try again.'
      });
    }
  });

  console.log('✅ AI Copilot routes registered successfully');
}