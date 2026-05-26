import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LegalQueryInput {
  query: string;
  businessType: string;
  industry: string;
  location: string;
  scenario?: string;
  contractType?: string;
}

export interface LegalGuidanceResult {
  guidance: string;
  risks: string[];
  recommendations: string[];
  resources: string[];
  disclaimer: string;
  templates: string[];
  nextSteps: string[];
}

export interface ContractGenerationInput {
  contractType: string;
  parties: {
    creator: string;
    brand: string;
    brandType: string;
  };
  terms: {
    duration: string;
    compensation: string;
    deliverables: string[];
    exclusivity: boolean;
    territory: string;
  };
  industry: string;
  jurisdiction: string;
}

export interface GeneratedContract {
  contractText: string;
  keyTerms: string[];
  warningFlags: string[];
  reviewChecklist: string[];
  jurisdiction: string;
  disclaimer: string;
}

const LEGAL_TEMPLATES = {
  influencer_agreement: {
    name: "Influencer Collaboration Agreement",
    description: "Standard agreement for brand-influencer partnerships",
    category: "collaboration",
    sections: ["Scope of Work", "Compensation", "Content Rights", "FTC Compliance", "Termination"]
  },
  nda: {
    name: "Non-Disclosure Agreement",
    description: "Protect confidential information during partnerships",
    category: "privacy",
    sections: ["Confidential Information", "Obligations", "Duration", "Remedies"]
  },
  music_usage: {
    name: "Music Usage Rights Guide",
    description: "Guidelines for using music in social media content",
    category: "copyright",
    sections: ["Fair Use", "Licensing Requirements", "Platform Policies", "Risk Assessment"]
  },
  content_licensing: {
    name: "Content Licensing Agreement",
    description: "License your content to third parties",
    category: "licensing",
    sections: ["Usage Rights", "Territory", "Duration", "Attribution", "Compensation"]
  },
  privacy_policy: {
    name: "Creator Privacy Policy Template",
    description: "Privacy policy for creators collecting audience data",
    category: "privacy",
    sections: ["Data Collection", "Usage", "Storage", "User Rights", "Contact Information"]
  }
};

const JURISDICTION_GUIDELINES = {
  "united_states": {
    name: "United States",
    key_laws: ["FTC Guidelines", "COPPA", "DMCA", "First Amendment"],
    disclosure_requirements: "Clear and conspicuous disclosure required for paid partnerships",
    copyright_notice: "Content protected under US Copyright Law"
  },
  "european_union": {
    name: "European Union",
    key_laws: ["GDPR", "Digital Services Act", "Copyright Directive"],
    disclosure_requirements: "Advertising disclosure required under consumer protection laws",
    copyright_notice: "Content protected under EU Copyright Directive"
  },
  "united_kingdom": {
    name: "United Kingdom",
    key_laws: ["Consumer Protection Regulations", "Data Protection Act", "Communications Act"],
    disclosure_requirements: "ASA guidelines require clear advertising disclosure",
    copyright_notice: "Content protected under UK Copyright, Designs and Patents Act"
  },
  "canada": {
    name: "Canada",
    key_laws: ["Competition Act", "PIPEDA", "Copyright Act"],
    disclosure_requirements: "Competition Bureau requires clear disclosure of material connections",
    copyright_notice: "Content protected under Canadian Copyright Act"
  },
  "australia": {
    name: "Australia",
    key_laws: ["Australian Consumer Law", "Privacy Act", "Copyright Act"],
    disclosure_requirements: "ACCC requires clear and prominent disclosure",
    copyright_notice: "Content protected under Australian Copyright Act"
  }
};

export class SmartLegalAI {
  async provideLegalGuidance(input: LegalQueryInput): Promise<LegalGuidanceResult> {
    console.log(`[SMART LEGAL AI] Processing legal query for ${input.businessType} in ${input.industry}`);

    try {
      const jurisdiction = JURISDICTION_GUIDELINES[input.location as keyof typeof JURISDICTION_GUIDELINES] || JURISDICTION_GUIDELINES.united_states;
      
      const legalPrompt = this.buildLegalGuidancePrompt(input, jurisdiction);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a legal technology assistant specializing in creator economy and digital content law. Provide general legal guidance based on publicly available information. Always include appropriate disclaimers and recommend consulting with qualified legal counsel for specific legal advice. Output in valid JSON format.`
          },
          {
            role: "user",
            content: legalPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2, // Lower temperature for more consistent legal guidance
        max_tokens: 2000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      console.log(`[SMART LEGAL AI] Legal guidance provided for query: ${input.query.substring(0, 50)}...`);
      
      return {
        guidance: result.guidance || 'Unable to provide specific guidance for this query.',
        risks: result.risks || [],
        recommendations: result.recommendations || [],
        resources: result.resources || [],
        disclaimer: this.getLegalDisclaimer(),
        templates: this.getRelevantTemplates(input.scenario || input.query),
        nextSteps: result.nextSteps || []
      };

    } catch (error) {
      console.error('[SMART LEGAL AI] Legal guidance failed:', error);
      throw new Error('Failed to provide legal guidance');
    }
  }

  async generateContract(input: ContractGenerationInput): Promise<GeneratedContract> {
    console.log(`[SMART LEGAL AI] Generating ${input.contractType} contract for ${input.industry} industry`);

    try {
      const jurisdiction = JURISDICTION_GUIDELINES[input.jurisdiction as keyof typeof JURISDICTION_GUIDELINES] || JURISDICTION_GUIDELINES.united_states;
      
      const contractPrompt = this.buildContractPrompt(input, jurisdiction);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a legal document generation assistant. Create contract templates based on standard industry practices. Include all necessary clauses and protective provisions. Always include disclaimers about legal review requirements. Output in valid JSON format.`
          },
          {
            role: "user",
            content: contractPrompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Very low temperature for consistent contract generation
        max_tokens: 3000
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      console.log(`[SMART LEGAL AI] Contract generated successfully`);
      
      return {
        contractText: result.contractText || 'Contract generation failed',
        keyTerms: result.keyTerms || [],
        warningFlags: result.warningFlags || [],
        reviewChecklist: result.reviewChecklist || [],
        jurisdiction: jurisdiction.name,
        disclaimer: this.getContractDisclaimer()
      };

    } catch (error) {
      console.error('[SMART LEGAL AI] Contract generation failed:', error);
      throw new Error('Failed to generate contract');
    }
  }

  private buildLegalGuidancePrompt(input: LegalQueryInput, jurisdiction: any): string {
    return `
Provide legal guidance for this creator economy scenario:

QUERY: "${input.query}"
BUSINESS TYPE: ${input.businessType}
INDUSTRY: ${input.industry}
LOCATION: ${jurisdiction.name}
SCENARIO: ${input.scenario || 'General inquiry'}

JURISDICTION CONTEXT:
- Key Laws: ${jurisdiction.key_laws.join(', ')}
- Disclosure Requirements: ${jurisdiction.disclosure_requirements}
- Copyright Framework: ${jurisdiction.copyright_notice}

Please analyze this query and provide guidance in the following JSON structure:
{
  "guidance": "Detailed explanation of the legal considerations and general guidance",
  "risks": [
    "Potential legal risk 1",
    "Potential legal risk 2",
    "Potential legal risk 3"
  ],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  "resources": [
    "Relevant legal resource or authority 1",
    "Relevant legal resource or authority 2",
    "Platform policy or guideline"
  ],
  "nextSteps": [
    "Immediate action step 1",
    "Follow-up action step 2",
    "Long-term consideration"
  ]
}

Focus on practical guidance for creators and content producers. Address common legal issues like copyright, disclosure requirements, contract terms, and platform compliance.
`;
  }

  private buildContractPrompt(input: ContractGenerationInput, jurisdiction: any): string {
    return `
Generate a ${input.contractType} contract template with the following specifications:

PARTIES:
- Creator: ${input.parties.creator}
- Brand/Company: ${input.parties.brand} (${input.parties.brandType})

TERMS:
- Duration: ${input.terms.duration}
- Compensation: ${input.terms.compensation}
- Deliverables: ${input.terms.deliverables.join(', ')}
- Exclusivity: ${input.terms.exclusivity ? 'Yes' : 'No'}
- Territory: ${input.terms.territory}

CONTEXT:
- Industry: ${input.industry}
- Jurisdiction: ${jurisdiction.name}
- Applicable Laws: ${jurisdiction.key_laws.join(', ')}

Generate a complete contract template in JSON format:
{
  "contractText": "Complete contract text with all necessary clauses, terms, and legal language formatted for readability",
  "keyTerms": [
    "Summary of key term 1",
    "Summary of key term 2",
    "Summary of key term 3"
  ],
  "warningFlags": [
    "Potential issue or red flag 1",
    "Potential issue or red flag 2"
  ],
  "reviewChecklist": [
    "Item to review before signing 1",
    "Item to review before signing 2",
    "Item to review before signing 3"
  ]
}

Include standard clauses for: scope of work, compensation terms, intellectual property rights, confidentiality, termination conditions, dispute resolution, and compliance requirements.
`;
  }

  private getRelevantTemplates(query: string): string[] {
    const queryLower = query.toLowerCase();
    const relevantTemplates: string[] = [];

    if (queryLower.includes('influencer') || queryLower.includes('brand') || queryLower.includes('collaboration')) {
      relevantTemplates.push('influencer_agreement');
    }
    
    if (queryLower.includes('music') || queryLower.includes('audio') || queryLower.includes('song')) {
      relevantTemplates.push('music_usage');
    }
    
    if (queryLower.includes('nda') || queryLower.includes('confidential') || queryLower.includes('secret')) {
      relevantTemplates.push('nda');
    }
    
    if (queryLower.includes('content') || queryLower.includes('license') || queryLower.includes('rights')) {
      relevantTemplates.push('content_licensing');
    }
    
    if (queryLower.includes('privacy') || queryLower.includes('data') || queryLower.includes('personal')) {
      relevantTemplates.push('privacy_policy');
    }

    return relevantTemplates.length > 0 ? relevantTemplates : ['influencer_agreement', 'nda'];
  }

  private getLegalDisclaimer(): string {
    return `⚠️ LEGAL DISCLAIMER: This guidance is for informational purposes only and does not constitute legal advice. Laws vary by jurisdiction and circumstances. Always consult with a qualified attorney for legal advice specific to your situation. VeeFore and its AI systems are not liable for any legal consequences resulting from the use of this information.`;
  }

  private getContractDisclaimer(): string {
    return `⚠️ CONTRACT DISCLAIMER: This template is provided for informational purposes only and should not be used without review by a qualified attorney. Contract requirements vary by jurisdiction, industry, and specific circumstances. Both parties should seek independent legal counsel before executing any agreement. VeeFore assumes no responsibility for the legal adequacy or enforceability of this template.`;
  }

  getAvailableTemplates() {
    return LEGAL_TEMPLATES;
  }

  getJurisdictions() {
    return JURISDICTION_GUIDELINES;
  }
}

export const smartLegalAI = new SmartLegalAI();