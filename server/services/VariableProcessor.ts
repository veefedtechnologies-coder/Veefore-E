export interface VariableContext {
  username?: string;
  first_name?: string;
  full_name?: string;
  comment?: string;
  keyword?: string;
  creator_name?: string;
  post_caption?: string;
  link?: string;
  platform?: string;
}

export class VariableProcessor {
  /**
   * Process a template string and replace all {{variables}} with their context values.
   * Handles fallbacks to avoid sending broken variables like "Hey {{first_name}}".
   */
  static processTemplate(template: string, context: VariableContext): string {
    if (!template) return '';

    let processedText = template;

    // Mapping of supported variables to their values or safe fallbacks
    const replacements: Record<string, string> = {
      '{{username}}': context.username || 'there',
      '{{first_name}}': context.first_name || context.username || 'there',
      '{{full_name}}': context.full_name || context.username || 'there',
      '{{comment}}': context.comment || '',
      '{{keyword}}': context.keyword || '',
      '{{creator_name}}': context.creator_name || '',
      '{{post_caption}}': context.post_caption || '',
      '{{link}}': context.link || '',
      '{{platform}}': context.platform || 'Instagram',
      '{{date}}': new Date().toLocaleDateString(),
      '{{time}}': new Date().toLocaleTimeString(),
    };

    // Replace all known variables
    for (const [variable, value] of Object.entries(replacements)) {
      // Use global regex to replace all instances of the variable (case-insensitive)
      const regex = new RegExp(variable.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      processedText = processedText.replace(regex, value);
    }

    // Fallback for any unsupported or unreplaced variables (e.g., typos like {{usename}})
    // We strip them out so the user doesn't see a broken variable token.
    processedText = processedText.replace(/\{\{[^}]+\}\}/g, '');

    // Cleanup any double spaces caused by replacing variables with empty strings
    processedText = processedText.replace(/\s{2,}/g, ' ').trim();

    return processedText;
  }
}
