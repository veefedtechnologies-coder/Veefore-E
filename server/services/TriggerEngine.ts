import { IAutomationRule, AutomationRuleModel } from '../models/Automation/AutomationRule';
import { VariableProcessor } from './VariableProcessor';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

export interface TriggerEvaluationResult {
  matched: boolean;
  rule?: IAutomationRule;
  matchType?: 'exact' | 'contains' | 'intent' | 'any';
  matchedKeyword?: string;
  intent?: string;
}

export class TriggerEngine {
  /**
   * Normalize a comment for evaluation: lowercase, trim, remove emojis and duplicate punctuation
   */
  static normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Remove emojis
      .replace(/[^\w\s]/gi, ' ') // Replace punctuation with space
      .replace(/\s+/g, ' ')      // Normalize spaces
      .trim();
  }

  /**
   * Evaluate a comment against an array of rules
   */
  static async evaluate(commentText: string, rules: IAutomationRule[]): Promise<TriggerEvaluationResult> {
    const normalizedComment = this.normalizeText(commentText);
    const rawCommentLower = commentText.toLowerCase().trim();

    // -- BATCH AI INTENT MATCHING --
    let globalDetectedIntent: string | null = null;
    let didGlobalIntentCheck = false;
    
    const allIntentsSet = new Set<string>();
    for (const rule of rules) {
      if (!rule.isActive) continue;
      const triggerConfig = rule.trigger || {};
      const matchMode = triggerConfig.matchMode || rule.matchMode || 'contains';
      if (matchMode === 'intent' || triggerConfig.useAiIntent) {
        const intents: string[] = triggerConfig.intents || triggerConfig.aiIntents || rule.aiIntents || [];
        for (const i of intents) allIntentsSet.add(i);
      }
    }
    
    const uniqueIntents = Array.from(allIntentsSet);
    if (uniqueIntents.length > 0 && openai) {
      didGlobalIntentCheck = true;
      try {
        const prompt = `You are a social media comment intent classifier. 
Comment: "${commentText}"
Possible Intents: ${JSON.stringify(uniqueIntents)}
Does the comment match any of these intents? If yes, respond ONLY with the exact intent string from the list. If no, respond with "NO".`;

        const completion = await openai.chat.completions.create({
          messages: [{ role: "system", content: prompt }],
          model: "gpt-3.5-turbo",
          max_tokens: 20,
          temperature: 0
        });
        const responseText = completion.choices[0]?.message?.content?.trim();
        if (responseText && responseText !== "NO" && uniqueIntents.includes(responseText)) {
          globalDetectedIntent = responseText;
          console.log(`[TRIGGER_ENGINE] Global AI Intent match: ${globalDetectedIntent}`);
        }
      } catch (error) {
        console.warn(`[TRIGGER_ENGINE] Global OpenAI Intent Match failed. Error: ${(error as Error).message}`);
      }
    }

    // Sort rules by priority if needed, or process all and return highest match.
    // For now, return the first rule that matches.
    for (const rule of rules) {
      if (!rule.isActive) continue;

      const triggerConfig = rule.trigger || {};
      const keywords: string[] = triggerConfig.keywords || rule.keywords || [];
      const matchMode = triggerConfig.matchMode || rule.matchMode || 'contains'; // exact, contains, intent, any

      // "Any" mode (triggers on literally every comment)
      if (matchMode === 'any') {
        return { matched: true, rule, matchType: 'any' };
      }

      // Check Negative filters first
      const negativeKeywords: string[] = triggerConfig.negativeKeywords || rule.negativeKeywords || [];
      const hasNegativeMatch = negativeKeywords.some(neg => {
        const normNeg = this.normalizeText(neg);
        return normalizedComment.includes(normNeg);
      });

      if (hasNegativeMatch) {
        continue; // Skip this rule, a negative keyword was found
      }

      // Keyword matching
      if (keywords.length > 0) {
        if (matchMode === 'exact') {
          const matchedKeyword = keywords.find(k => this.normalizeText(k) === normalizedComment);
          if (matchedKeyword) {
            return { matched: true, rule, matchType: 'exact', matchedKeyword };
          }
        } 
        else if (matchMode === 'contains') {
          const matchedKeyword = keywords.find(k => {
            const normKey = this.normalizeText(k);
            return normalizedComment.includes(normKey) || rawCommentLower.includes(k.toLowerCase());
          });
          if (matchedKeyword) {
            return { matched: true, rule, matchType: 'contains', matchedKeyword };
          }
        }
      }

      // AI Intent matching
      if (matchMode === 'intent' || triggerConfig.useAiIntent) {
        const intents: string[] = triggerConfig.intents || triggerConfig.aiIntents || rule.aiIntents || [];
        if (intents.length > 0) {
          if (didGlobalIntentCheck) {
            // We already did a global OpenAI check
            if (globalDetectedIntent && intents.includes(globalDetectedIntent)) {
              return { matched: true, rule, matchType: 'intent', intent: globalDetectedIntent };
            }
          } else {
            // Fallback basic fuzzy match if OpenAI wasn't configured
            const matchedIntent = intents.find(intent => {
              const intentWords = this.normalizeText(intent).split(' ').filter(w => w.length > 3);
              return intentWords.some(word => normalizedComment.includes(word));
            });

            if (matchedIntent) {
              return { matched: true, rule, matchType: 'intent', intent: matchedIntent };
            }
          }
        }
      }
    }

    return { matched: false };
  }

  /**
   * Fetches active rules from the database and evaluates them against the incoming webhook data.
   */
  static async evaluateAndTrigger(data: any): Promise<{ matched: boolean; ruleName?: string; intent?: string; matchedKeyword?: string }> {
    try {
      console.log(`[TRIGGER_ENGINE] Fetching active automation rules for workspace: ${data.workspaceId}`);
      
      const activeRules = await AutomationRuleModel.find({
        workspaceId: data.workspaceId,
        isActive: true,
      });

      // Filter rules by target media if specified
      const rules = activeRules.filter(rule => {
        if (!rule.targetMediaIds || rule.targetMediaIds.length === 0) return true;
        if (!data.mediaId) return true; // If we don't know the media ID, assume it matches to be safe, or false depending on logic? Assuming false is safer if targeting is specific, but let's check if array includes.
        return rule.targetMediaIds.includes(data.mediaId);
      });

      if (!rules || rules.length === 0) {
        console.log(`[TRIGGER_ENGINE] No active matching rules found for workspace ${data.workspaceId}`);
        return { matched: false };
      }

      console.log(`[TRIGGER_ENGINE] Found ${rules.length} active rules. Evaluating...`);
      const result = await this.evaluate(data.commentText, rules);

      if (result.matched && result.rule) {
        console.log(`[TRIGGER_ENGINE] 🎯 Match found! Rule: "${result.rule.name}" via ${result.matchType} matching.`);
        
        // Log Variable Processing for verification
        try {
          const actionConfig = result.rule.action || {};
          
          // The frontend might save responses as a stringified JSON object
          let parsedResponses: any = result.rule.responses;
          if (typeof parsedResponses === 'string' && parsedResponses.startsWith('{')) {
             try { parsedResponses = JSON.parse(parsedResponses); } catch(e) {}
          }

          let dmButtons = actionConfig.dmButtons || parsedResponses?.dmButtons || [];

          let template = "Default DM Template";
          if (actionConfig.dmResponses && actionConfig.dmResponses.length > 0) {
            template = actionConfig.dmResponses[Math.floor(Math.random() * actionConfig.dmResponses.length)];
          } else if (parsedResponses?.dmResponses && parsedResponses.dmResponses.length > 0) {
            template = parsedResponses.dmResponses[Math.floor(Math.random() * parsedResponses.dmResponses.length)];
          } else if (parsedResponses) {
            template = Array.isArray(parsedResponses) ? parsedResponses[Math.floor(Math.random() * parsedResponses.length)] : JSON.stringify(parsedResponses);
          }

          console.log(`[TRIGGER_ENGINE] 📝 Original DM Template: "${template}"`);
          
          const finalMessage = VariableProcessor.processTemplate(template, {
            username: data.username,
            keyword: result.intent || result.matchedKeyword || 'None',
            link: "https://your-configured-link.com" // Placeholder for testing
          });
          
          console.log(`[TRIGGER_ENGINE] 🚀 Final Parsed DM (Ready to Send): "${finalMessage}"`);

          let finalCommentReply = null;
          let commentTemplates = actionConfig.responses || [];
          if (!commentTemplates || commentTemplates.length === 0) {
             if (parsedResponses?.responses && parsedResponses.responses.length > 0) {
                commentTemplates = parsedResponses.responses;
             } else if (Array.isArray(parsedResponses)) {
                commentTemplates = parsedResponses;
             }
          }

          if (commentTemplates && commentTemplates.length > 0) {
            const commentTemplate = commentTemplates[Math.floor(Math.random() * commentTemplates.length)];
            finalCommentReply = VariableProcessor.processTemplate(commentTemplate, {
              username: data.username,
              keyword: result.intent || result.matchedKeyword || 'None',
              link: "https://your-configured-link.com"
            });
            console.log(`[TRIGGER_ENGINE] 🚀 Final Parsed Comment Reply: "${finalCommentReply}"`);
          }

          return {
            matched: true,
            ruleName: result.rule.name,
            intent: result.intent,
            matchedKeyword: result.matchedKeyword,
            finalDM: finalMessage,
            finalCommentReply: finalCommentReply,
            ruleId: result.rule._id?.toString(),
            dmButtons: dmButtons,
            followerGate: result.rule.followerGate
          };
        } catch (vErr) {
          console.error(`[TRIGGER_ENGINE] ⚠️ Error processing variables:`, vErr);
        }
      }

      console.log(`[TRIGGER_ENGINE] No rules matched the comment text.`);
      return { matched: false };
    } catch (error) {
      console.error(`[TRIGGER_ENGINE] Error during evaluation and trigger logic:`, error);
      throw error;
    }
  }
}
