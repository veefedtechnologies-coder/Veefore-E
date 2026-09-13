/**
 * VeeGPT chat tools (function-calling definitions).
 *
 * These are the actions the chat model can invoke mid-conversation instead of a
 * separate regex/triage step. The model replies normally AND, when the user
 * actually wants to publish/schedule, emits a `schedule_post` tool call. The
 * client renders the resulting plan as an inline confirm card; on confirm it
 * runs the existing /post-agent/execute + publish flow.
 *
 * The parameter schema mirrors the `plan` shape the legacy post-agent produced,
 * so the downstream execute/confirm code is reused unchanged.
 */

import type { ChatTool } from '../services/AIServiceManager';

export const SCHEDULE_POST_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'schedule_post',
    description:
      'Create or schedule a social media post when the user is asking to PUBLISH or SCHEDULE a specific piece of content now (or is continuing such a request). ' +
      'Do NOT call this for general chat, ideas, questions, or when the user is only brainstorming. ' +
      'A post requires at least one attached image/video and a decision of post-now vs a specific schedule time. ' +
      'Caption, hashtags, mentions and collaborators are OPTIONAL — ONLY include them if the user EXPLICITLY provided or asked for them in their message. ' +
      'Do NOT invent hashtags, do NOT add mentions, and NEVER mention or hashtag the user\'s own connected account/username. If the user did not ask for hashtags, leave hashtags empty and generateHashtags false. If the user did not ask to mention anyone, leave mentions empty. ' +
      'Resolve relative times (e.g. "tomorrow 1pm", "tonight") to scheduledLocal in the user\'s LOCAL time (no timezone suffix). ' +
      'Do not judge whether a time is in the past — the system validates that deterministically.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['post', 'reel', 'story'], description: 'Content type. Use "reel" for video unless the user says story.' },
        accountId: { type: 'string', description: 'The connected account id to publish to. If exactly one account is connected, use it automatically.' },
        caption: { type: 'string', description: 'Caption text, or "" if none.' },
        generateCaption: { type: 'boolean', description: 'Set true ONLY if the user explicitly asked you to write/generate a caption. Default false — never auto-generate a caption the user did not request.' },
        generateHashtags: { type: 'boolean', description: 'Set true ONLY if the user explicitly asked for hashtags. Default false — never auto-add hashtags.' },
        hashtags: { type: 'array', items: { type: 'string' }, description: 'Explicit hashtags (without #) ONLY if the user asked for them. Empty array otherwise — never invent hashtags.' },
        mentions: { type: 'array', items: { type: 'string' }, description: 'Usernames to mention ONLY if the user explicitly named them. Empty array otherwise — never add mentions, and never mention the user\'s own connected account.' },
        collaborators: { type: 'array', items: { type: 'string' }, description: 'Collaborator usernames, if any.' },
        schedule: { type: 'boolean', description: 'true to schedule for later, false to post now.' },
        scheduledLocal: { type: ['string', 'null'], description: '"YYYY-MM-DDTHH:mm" in LOCAL time when scheduling, else null.' },
        summary: { type: 'string', description: 'One short human line summarizing the post for the confirm card.' },
        mediaOrdinal: { type: 'number', description: 'Which image from the conversation to attach, as a 1-based number from the "Media available in this conversation" list (1 = most recent). OMIT this to use the most recent image (the default). Only set it when the user clearly wants a SPECIFIC earlier image (e.g. "post the original one"). Never pass image URLs or paths.' },
        suggestion: { type: 'string', description: 'REQUIRED. One specific, actionable idea to increase reach/engagement that the user did NOT already include — e.g. a stronger hook caption, 3-5 niche hashtags, a clear CTA, trending audio for reels, or a better posting time. Always provide a genuinely useful tip (never empty).' },
      },
      required: ['type', 'schedule', 'suggestion'],
      additionalProperties: false,
    },
  },
};

/** All tools exposed to the VeeGPT chat model. */
/**
 * Show the user a VISUAL picker of the images already in the conversation
 * (thumbnails), so they can choose which one to schedule/post. Call this when
 * the user wants to pick among multiple images (e.g. "give me the options",
 * "which images can I use", "let me choose the image"). It renders the pictures
 * as tappable thumbnails — NEVER list images to the user as URLs, file paths, or
 * IDs. After they pick a number, call schedule_post with mediaOrdinal.
 */
export const SHOW_MEDIA_OPTIONS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'show_media_options',
    description:
      'Display the images already in this conversation as a visual thumbnail picker the user can tap. ' +
      'You MUST call this (and MUST NOT answer with text) whenever the user asks to see, list, choose, or pick among their images — e.g. "give me the option of images", "give me the image options", "which image should I post", "let me pick", "show my images", "options again". ' +
      'It renders every conversation image as a picture with a number and a preview button. ' +
      'NEVER enumerate images as a text/numbered/bulleted list, and never mention image URLs, file paths, or IDs — the user cannot act on those. After the user picks a number, call schedule_post with mediaOrdinal.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description:
            'A short note on why the picker is being shown (e.g. "user asked to choose an image to schedule"). Optional.',
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
};

export const VEEGPT_CHAT_TOOLS: ChatTool[] = [SCHEDULE_POST_TOOL, SHOW_MEDIA_OPTIONS_TOOL];

// ─── Content generation tools (caption / hashtags) ──────────────────────────

/**
 * Generate caption options on demand (NOT tied to scheduling a post). The
 * result is rendered as selectable caption cards the user can copy/use.
 */
export const GENERATE_CAPTION_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'generate_caption',
    description:
      'Generate one or more social-media CAPTION options when the user explicitly asks you to write/draft/generate a caption (e.g. "write me a caption for a fitness reel", "give me 3 caption ideas"). ' +
      'Do NOT call this when the user is scheduling/publishing a post (use schedule_post for that) or just chatting. ' +
      'The system renders the options as cards the user can copy — you do NOT need to also write the captions in your text reply.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What the caption is about (the subject/theme the user described).' },
        postType: { type: 'string', enum: ['post', 'reel', 'story'], description: 'Content type, default "post".' },
        count: { type: 'number', description: 'How many caption options to produce (1-3, default 3).' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
};

/**
 * Generate hashtags on demand. Result is rendered as a hashtag chip card.
 */
export const GENERATE_HASHTAGS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'generate_hashtags',
    description:
      'Generate a set of relevant HASHTAGS when the user explicitly asks for hashtags (e.g. "give me hashtags for a travel post", "what hashtags should I use for fitness"). ' +
      'Do NOT auto-add hashtags to a post here — this is only for when the user wants a hashtag list. The system renders them as copyable chips.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The subject/niche to generate hashtags for.' },
        count: { type: 'number', description: 'How many hashtags (5-30, default 12).' },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
};

/**
 * Generate a downloadable DOCUMENT (PDF, Word, Excel, or PowerPoint) from
 * structured content the model provides here. The system renders a document
 * card in chat and builds the real, well-formatted file on the client when the
 * user downloads it — so fill the matching field FULLY with real content, not
 * placeholders. Pick ONE `type` and populate the field for that type:
 *   • pdf / docx  → `sections`  (a written document: headings, prose, bullets)
 *   • xlsx        → `sheets`    (tables: columns + rows of data)
 *   • pptx        → `slides`    (a deck: slide titles + bullet points)
 */
export const GENERATE_DOCUMENT_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'generate_document',
    description:
      'Create a polished, downloadable DOCUMENT when the user asks for a PDF, Word doc, Excel/spreadsheet, or PowerPoint/slides ' +
      '(e.g. "make a PDF report", "put this in an excel sheet", "create a slide deck about X", "give me a word document"). ' +
      'AUTHOR THE FULL, DETAILED CONTENT yourself in the arguments — real headings, thorough multi-sentence prose, complete table rows, substantive slide bullets. Never use placeholders or one-liners; produce a genuinely comprehensive, professional document as an expert would. ' +
      'Aim for depth: an intro/overview, several well-developed sections, and a closing/summary where appropriate. ' +
      'Add VISUALS when they help: use `highlights` for a row of key-stat cards, and a section `chart` (bar) to show comparisons or trends — but only when the data is meaningful, never decorative. ' +
      'Choose the format that best fits the request. The system shows a document card the user can VIEW in-app or download; you do NOT need to repeat the whole content in your text reply — just a one-line intro.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['pdf', 'docx', 'xlsx', 'pptx'],
          description: 'File format: "pdf" or "docx" for written documents, "xlsx" for spreadsheets/tables, "pptx" for slide decks.',
        },
        title: { type: 'string', description: 'Document title (also the file name and the heading on the first page/slide).' },
        subtitle: { type: 'string', description: 'Optional one-line subtitle shown under the title on the cover.' },
        summary: { type: 'string', description: 'One short sentence describing the document, shown on the chat card.' },
        highlights: {
          type: 'array',
          description: 'Optional row of key-stat cards shown near the top (e.g. metrics, KPIs). Use only when you have real, meaningful numbers/facts. 2-4 works best.',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: 'What the stat measures (e.g. "Avg. engagement").' },
              value: { type: 'string', description: 'The headline value (e.g. "4.2%", "12k").' },
              sublabel: { type: 'string', description: 'Optional small caption under the value.' },
            },
            required: ['label', 'value'],
            additionalProperties: false,
          },
        },
        sections: {
          type: 'array',
          description: 'For "pdf"/"docx": the document body, in order. Each section is a heading and/or prose and/or a bullet list and/or a chart.',
          items: {
            type: 'object',
            properties: {
              heading: { type: 'string', description: 'Optional section heading.' },
              body: { type: 'string', description: 'Optional paragraph text (can be several sentences; use blank lines to separate paragraphs).' },
              bullets: { type: 'array', items: { type: 'string' }, description: 'Optional bullet points.' },
              callout: { type: 'string', description: 'Optional highlighted note/quote/tip shown in an accent box.' },
              chart: {
                type: 'object',
                description: 'Optional simple bar chart for this section. Use for real comparisons/trends only.',
                properties: {
                  title: { type: 'string', description: 'Chart title.' },
                  points: {
                    type: 'array',
                    description: 'Bars, in order.',
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        value: { type: 'number' },
                      },
                      required: ['label', 'value'],
                      additionalProperties: false,
                    },
                  },
                },
                required: ['points'],
                additionalProperties: false,
              },
            },
            additionalProperties: false,
          },
        },
        sheets: {
          type: 'array',
          description: 'For "xlsx": one or more sheets. Each has a name, column headers, and rows of cell values.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Sheet/tab name.' },
              columns: { type: 'array', items: { type: 'string' }, description: 'Column header labels.' },
              rows: {
                type: 'array',
                description: 'Rows of cells; each row is an array of values aligned to columns.',
                items: { type: 'array', items: { type: ['string', 'number'] } },
              },
            },
            required: ['columns', 'rows'],
            additionalProperties: false,
          },
        },
        slides: {
          type: 'array',
          description: 'For "pptx": the slides in order. Each has a title and bullet points and/or a short body.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Slide title.' },
              bullets: { type: 'array', items: { type: 'string' }, description: 'Bullet points on the slide.' },
              body: { type: 'string', description: 'Optional short body/subtitle text.' },
            },
            additionalProperties: false,
          },
        },
      },
      required: ['type', 'title'],
      additionalProperties: false,
    },
  },
};

/**
 * Gemini NATIVE image GENERATION capability. Call this only when the user wants
 * a NEW image/creative created (text-to-image): social creatives, thumbnails,
 * product shots, posters, banners, backgrounds, campaign assets, concepts.
 * Do NOT call it for captions, analysis, or when the user only wants to
 * understand/describe an existing image. Author a rich, specific `prompt` — the
 * quality of the image depends on the direction you give (subject, composition,
 * lighting, style, mood, background, any on-image text). The system renders a
 * live generation card and produces the final image.
 */
export const GENERATE_IMAGE_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'generate_image',
    description:
      'Create a NEW image/creative from a text brief using Veefore\'s AI image capability (e.g. "make an Instagram creative for my sneaker launch", "design a YouTube thumbnail", "create a poster"). ' +
      'Write a detailed, professional creative brief in `prompt`: subject, composition, lighting, style/mood, background, colors, and any on-image text. ' +
      'Do NOT call this for captions/hashtags/analytics, or when the user only wants to describe/understand an existing image. The system shows the generation card — you only need a one-line intro in your reply.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The full, detailed image/creative brief to render.' },
        title: { type: 'string', description: 'Optional short title/label for the creative.' },
        platform: { type: 'string', description: 'Optional target platform (e.g. "instagram", "instagram story", "youtube", "linkedin") to pick the aspect ratio.' },
        aspectRatio: { type: 'string', enum: ['square', 'portrait', 'story', 'landscape', 'wide'], description: 'Optional explicit aspect ratio. Overrides platform.' },
        count: { type: 'number', description: 'How many distinct options/variations to create (1-4, default 1). Only set >1 when the user asks for multiple options.' },
        premium: { type: 'boolean', description: 'Set true ONLY for genuinely complex/professional/high-fidelity work (advanced compositions, precise on-image text/layout, difficult brand consistency). Otherwise omit — the default model is faster and cheaper.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
}

/**
 * Gemini NATIVE image EDITING capability. Call this when the user wants to edit
 * / transform an image they attached (background change/removal, relight, change
 * a color, make it ad-ready, expand aspect ratio, add a logo, cinematic
 * version, etc.). The user's attached image is passed to the model as real
 * image input. State clearly WHAT changes and WHAT must be preserved.
 */
export const EDIT_IMAGE_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'edit_image',
    description:
      'Edit or transform the image the user attached, using Veefore\'s AI image capability (e.g. "remove the background", "put the product in a luxury studio", "make the lighting warmer", "change the shirt to white", "expand to 9:16", "add my logo"). ' +
      'Only call this when the user has attached an image (or is continuing to edit one) AND wants it changed — not for describing/understanding it. ' +
      'In `instruction`, state exactly what to change; in `preserve`, state what must stay identical (important for product/brand shots, e.g. "keep the product shape, logo, proportions and colors unchanged").',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'The exact change(s) to apply to the attached image.' },
        preserve: { type: 'string', description: 'What must remain unchanged (product shape, logo, proportions, colors, etc.).' },
        title: { type: 'string', description: 'Optional short title/label for the result.' },
        aspectRatio: { type: 'string', enum: ['square', 'portrait', 'story', 'landscape', 'wide'], description: 'Optional target aspect ratio (for expansion/reframing).' },
        premium: { type: 'boolean', description: 'Set true ONLY for genuinely complex/high-fidelity edits. Otherwise omit.' },
      },
      required: ['instruction'],
      additionalProperties: false,
    },
  },
}

/**
 * AI Video Editor capability. Call this when the user has attached a VIDEO and
 * wants it EDITED — trim/cut, remove an object/person, change/remove the
 * background, add captions/subtitles, apply a colour/cinematic look, reframe or
 * change aspect ratio, speed changes, reels/shorts export, etc. The attached
 * video is routed into Veefore's existing AI Video Editor pipeline, which is
 * ASYNC and multi-stage; the chat renders an inline editor card that streams the
 * plan/progress and drives the edit conversationally.
 *
 * Do NOT call this for images (that is `edit_image`), and do NOT call it when the
 * user only wants to DESCRIBE / understand a video rather than change it. State
 * the concrete edit to perform in `instruction`.
 *
 * TWO RULES THE DESCRIPTION MAKES EXPLICIT, because both were violated in
 * production on the message "add a beautiful and animated caption and also apply
 * color grade":
 *   • With a video attached, "caption(s)"/"subtitles" is a BURNED-IN timed
 *     caption edit, never a written social post caption.
 *   • A multi-part edit request goes into ONE `instruction` naming every part —
 *     the model must not send half the request to the tool and answer the other
 *     half in prose.
 */
export const VIDEO_EDITOR_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'video_editor',
    description:
      'Edit the VIDEO the user attached using Veefore\'s AI Video Editor (e.g. "remove the person behind me", "make this cinematic", "cut the first 5 seconds", "add captions", "reframe to 9:16 for a reel", "remove the background", "trim to 15 seconds"). ' +
      'Only call this when the user attached a VIDEO (or is continuing to edit one) AND wants it changed. ' +
      'NOT for images (use edit_image) and NOT for merely describing/summarizing a video. ' +
      'Video editing is asynchronous and multi-stage: the system opens an inline editor card that runs the edit — you only need a one-line intro in your reply. ' +
      'Put the exact change to perform in `instruction`; put anything that must stay untouched in `preserve`. ' +
      'CAPTIONS: when a video is attached, "caption"/"captions"/"subtitles" means BURNING TIMED CAPTIONS INTO THE VIDEO — put it in `instruction` (e.g. "add animated burned-in captions"). Do NOT satisfy it by writing a social post caption; that is a different capability and it does not change the video. ' +
      'ONE CALL, EVERY EDIT: the `instruction` must carry EVERY edit the user asked for in that message. Never drop or split off part of a multi-part request. ' +
      'WRONG — "add an animated caption and apply a colour grade" answered with instruction "apply a cinematic colour grade" plus a written post caption in your reply. ' +
      'RIGHT — one call with instruction "add animated burned-in captions and apply a cinematic colour grade".',
    parameters: {
      type: 'object',
      properties: {
        instruction: { type: 'string', description: 'The exact edit to perform on the attached video.' },
        preserve: { type: 'string', description: 'What must remain unchanged (subject, framing, audio, branding, etc.).' },
      },
      required: ['instruction'],
      additionalProperties: false,
    },
  },
}

// ─── Analytics / insight / best-time / trends tools ─────────────────────────

/**
 * Read the user's analytics and produce data-grounded insight or growth
 * recommendations. Reuses the same engine as the dashboard.
 */
export const GET_ANALYTICS_INSIGHT_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'get_analytics_insight',
    description:
      'Analyze the user\'s REAL account performance and return either a quick performance insight or prioritized growth recommendations. ' +
      'Call this when the user asks how their account/content is performing, why reach/engagement changed, how to grow, or what to improve (e.g. "how am I doing", "how can I grow", "what should I improve", "give me recommendations"). ' +
      'Uses live analytics — never guess these numbers.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['insight', 'recommendations'],
          description: '"recommendations" = prioritized growth actions (default for "how do I grow / improve"); "insight" = a single performance headline + tip (for "how am I doing").',
        },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
};

/**
 * Best time to post — reads the precomputed best-active-time analysis.
 */
export const GET_BEST_POSTING_TIME_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'get_best_posting_time',
    description:
      'Return the data-backed BEST TIME(S) to post for the user\'s connected account, based on when their audience engages most. ' +
      'Call this when the user asks when to post, the best time/day to post, or wants their schedule optimized.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
};

/**
 * Live trend/topic research via our own web research engine (Tavily + Firecrawl
 * + LLM). NOT Perplexity.
 */
export const RESEARCH_TRENDS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'research_trends',
    description:
      'Research CURRENT, up-to-date TRENDS in a niche/topic from the live web (e.g. "trending reels in fashion", "what is trending in fitness right now", "latest Instagram algorithm updates"). ' +
      'Returns trend classifications + sources. Use for time-sensitive trend questions. ' +
      'IMPORTANT: when the user refers to "my niche", "my industry", "my space", or "my audience", substitute their ACTUAL niche from the VeeGPT Memory/context into the query (e.g. if their niche is fitness, query "trending Instagram reels in fitness") — never search generically. If you don\'t know their niche, say so and ask, rather than guessing.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The trend/topic question to research (include the niche if known).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

/**
 * General live web search / deep research via our own engine. Use for any
 * request needing current information, competitor discovery, market research,
 * statistics, news, or "what are people saying about X".
 */
export const SEARCH_WEB_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'search_web',
    description:
      'Search the live web and synthesize an answer WITH CITATIONS for anything that needs current/up-to-date information the model may not know: latest news, recent updates, statistics, market/industry research, competitor discovery, product comparisons, or "what are people saying about X". ' +
      'Call this whenever the user asks for recent info, research, competitors, or facts you are not certain are current. Always prefer this over guessing. ' +
      'When the request references the user\'s own niche/industry/audience, substitute their ACTUAL niche from the VeeGPT Memory/context into the query instead of searching generically.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search/research question (be specific; include niche, brand, or timeframe if relevant).' },
        mode: { type: 'string', enum: ['search', 'competitors'], description: 'Use "competitors" when the user is asking to find competitors/similar brands; otherwise "search".' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

/**
 * Deep Research: multi-query structured report.
 */
export const DEEP_RESEARCH_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'deep_research',
    description:
      'Run a DEEP, multi-source research report when the user explicitly asks for in-depth research, a report, a market analysis, or a comprehensive overview of a topic (e.g. "create a report about social media trends in fashion", "do deep research on AI marketing tools"). ' +
      'This is heavier than search_web — it breaks the topic into sub-queries, reads many sources, and returns an executive summary, key findings, trends, opportunities, risks and sources. Use only for genuine deep-research/report requests.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The research topic / report request (be specific; include niche or scope).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
};

/** Tools that need a connected account / workspace analytics. */
export const VEEGPT_INSIGHT_TOOLS: ChatTool[] = [
  GENERATE_CAPTION_TOOL,
  GENERATE_HASHTAGS_TOOL,
  GENERATE_DOCUMENT_TOOL,
  GENERATE_IMAGE_TOOL,
  EDIT_IMAGE_TOOL,
  GET_ANALYTICS_INSIGHT_TOOL,
  GET_BEST_POSTING_TIME_TOOL,
  RESEARCH_TRENDS_TOOL,
  SEARCH_WEB_TOOL,
  DEEP_RESEARCH_TOOL,
];

/**
 * Native image capability tools (generation + editing). These are a first-class
 * capability the MODEL always decides on itself, so they must stay available
 * even on an image-ATTACHMENT turn (uploading an image to edit it). Tier gating
 * still applies (both are `full`+). Kept as their own set so the chat route can
 * expose them independently of the account/analytics tools.
 */
export const VEEGPT_IMAGE_TOOLS: ChatTool[] = [GENERATE_IMAGE_TOOL, EDIT_IMAGE_TOOL];

/**
 * Native AI Video Editor capability tools. Like the image tools, this is a
 * first-class capability the MODEL decides on itself, so it must stay available
 * on a video-ATTACHMENT turn (uploading a video to edit it). Tier gating still
 * applies (`video_editor` is `full`+). Kept as its own set so the chat route can
 * expose it independently of the account/analytics tools and re-add it on a
 * video-attachment turn (mirroring `VEEGPT_IMAGE_TOOLS`).
 */
export const VEEGPT_VIDEO_TOOLS: ChatTool[] = [VIDEO_EDITOR_TOOL];

/**
 * Memory tool: lets the model save a durable, user-specific fact/preference to
 * long-term memory WHILE generating its reply — folding memory detection into
 * the single chat call (no separate per-message extraction LLM call). The model
 * only calls this when the latest message genuinely states something worth
 * remembering across chats; transient chit-chat/questions never trigger it.
 */
export const REMEMBER_FACT_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'remember_fact',
    description:
      'Save durable, user-specific fact(s) or preference(s) to long-term memory so future chats can use them. ' +
      'Be PROACTIVE: whenever the user reveals something genuinely useful and lasting about THEM, their brand, or how they want to work — save it, even if they did not say "remember this". ' +
      'Examples worth saving: their name, brand/business, niche, target audience, goals, products/services, posting schedule/cadence, preferred tone/style, dos and don\'ts, locations, competitors they care about, or any stable preference. ' +
      'If the message contains SEVERAL distinct durable facts, emit a SEPARATE remember_fact call for EACH one (do not cram multiple facts into a single string). ' +
      'CRITICAL: Do NOT call this for an ACTION REQUEST or TASK. If the user is asking you to DO something now — schedule a post, publish, create content, generate a caption, etc. (e.g. "schedule my post tomorrow at 1pm") — that is a TASK, not a fact. Handle it with the right tool; do NOT memorize it and do NOT invent a recurring preference from a one-off request. ' +
      'Do NOT call it for transient chit-chat, greetings, or pure questions, and do NOT re-save a fact that is ALREADY in the "VeeGPT Memory" list you were given (just acknowledge you know it). ' +
      'Still reply to the user normally in text — this tool runs alongside your reply.',
    parameters: {
      type: 'object',
      properties: {
        fact: {
          type: 'string',
          description: 'ONE concise, standalone fact written in the third person, keeping specifics (e.g. "Posts reels every Friday", "Brand color is blue", "Runs a coffee shop in Austin"). No preamble, no quotes. Call the tool again for each additional distinct fact.',
        },
      },
      required: ['fact'],
      additionalProperties: false,
    },
  },
};

/** Tools available even with no connected social account (e.g. memory). */
export const VEEGPT_MEMORY_TOOLS: ChatTool[] = [REMEMBER_FACT_TOOL];

/**
 * Update an existing memory fact when the user changes a previously-stored
 * detail (e.g. brand color blue → red). The model picks the fact id from the
 * "VeeGPT Memory" list it was given. This keeps memory clean (one fact per topic)
 * instead of piling contradicting facts.
 */
export const UPDATE_MEMORY_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'update_memory',
    description:
      'Update an EXISTING long-term memory fact when the user changes a detail that REPLACES a stored one ' +
      '(e.g. they previously said brand color is blue, now they say it is red; or posting schedule changed). ' +
      'Find the matching fact id in the "VeeGPT Memory" list you were given and replace its text. ' +
      'Use this INSTEAD of remember_fact when the new info supersedes an existing fact on the SAME topic. ' +
      'If you are unsure whether it replaces the old fact or is an additional one, do NOT call this — ask the user to confirm in plain text.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the existing fact to update (from the [id:...] tags in VeeGPT Memory).' },
        fact: { type: 'string', description: 'The new, corrected fact text (concise, third person).' },
      },
      required: ['id', 'fact'],
      additionalProperties: false,
    },
  },
};

/**
 * Forget (delete) a memory fact when the user says it's no longer true or asks
 * you to forget it.
 */
export const FORGET_MEMORY_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'forget_memory',
    description:
      'Delete a long-term memory fact when the user says it is no longer true, asks you to forget it, or it is clearly obsolete. ' +
      'Find the matching fact id in the "VeeGPT Memory" list you were given. Only delete facts you are confident the user wants removed. ' +
      'IMPORTANT — "remove/clean up duplicates": when the user asks to remove duplicate or redundant facts, delete ONLY the extra copies of facts that say the SAME thing, and KEEP one copy of each distinct fact. ' +
      'Two facts are duplicates ONLY if they convey the same meaning (e.g. "Brand color is blue" and "User\'s brand colour is blue"). ' +
      'Facts about DIFFERENT topics (name, niche, plan, schedule, engagement rate, drafts count, etc.) are NEVER duplicates of each other — do NOT delete them. ' +
      'Also, CONTRADICTING facts on the same topic (e.g. "brand color is blue" vs "brand color is red") are NOT duplicates — if the user is cleaning up, keep the most recent/correct one and remove the stale ones, but never wipe the whole topic. ' +
      'NEVER delete every fact unless the user explicitly asks to clear or forget everything. When in doubt, ask the user to confirm in plain text instead of deleting.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The id of the fact to delete (from the [id:...] tags in VeeGPT Memory).' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
};

/** All memory tools (save + update + forget). */
export const VEEGPT_MEMORY_TOOLS_ALL: ChatTool[] = [REMEMBER_FACT_TOOL, UPDATE_MEMORY_TOOL, FORGET_MEMORY_TOOL];

/**
 * Read-only data tool: lets the model fetch LIVE workspace data on demand to
 * answer questions like "how many posts are scheduled?", "what's scheduled?",
 * "what are my drafts?", or account/analytics stats. The model calls this with
 * the kind of data it needs; the server runs the query and feeds the result
 * back so the reply uses REAL numbers (never guessed). Strictly read-only —
 * scoped to the user's current workspace.
 */
export const GET_WORKSPACE_DATA_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'get_workspace_data',
    description:
      'Fetch the user\'s LIVE data from their current Veefore workspace to answer factual questions about their account — ' +
      'scheduled posts, published posts, drafts, content counts, connected accounts and their stats/analytics, recent posts, etc. ' +
      'Call this WHENEVER the user asks about the state of THEIR account/content (e.g. "how many posts are scheduled", "what is scheduled", "show my drafts", "how many followers do I have", "what did I post recently"). ' +
      'Do NOT guess these numbers — always call this tool to get the real data, then answer from it.',
    parameters: {
      type: 'object',
      properties: {
        resource: {
          type: 'string',
          enum: ['scheduled_posts', 'published_posts', 'draft_posts', 'recent_content', 'content_summary', 'accounts', 'overview'],
          description:
            'Which data to fetch: "scheduled_posts" = upcoming scheduled posts; "published_posts" = already published; "draft_posts" = drafts; ' +
            '"recent_content" = latest content of any status; "content_summary" = counts by status; "accounts" = connected accounts + stats; "overview" = a bit of everything.',
        },
        limit: { type: 'number', description: 'Max items to return (default 20, max 50).' },
      },
      required: ['resource'],
      additionalProperties: false,
    },
  },
};

/** Read-only data tools (only when a workspace is available). */
export const VEEGPT_DATA_TOOLS: ChatTool[] = [GET_WORKSPACE_DATA_TOOL];

/**
 * On-demand SELECTED-ACCOUNT data tool.
 *
 * Offered ONLY when the user has picked a specific social account from the
 * composer dropdown. It fetches that ONE account's full profile + analytics
 * (followers, engagement, reach/impressions, audience demographics, best-time
 * signals, recent posts) straight from the database/Redis snapshot — but only
 * when the current question actually needs it. This is what keeps the account's
 * heavy data OUT of the prompt on every turn: it is pulled in on demand instead
 * of being force-injected.
 */
export const GET_ACCOUNT_DETAILS_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'get_account_details',
    description:
      'Fetch LIVE analytics for the social account the user SELECTED — the SAME data that powers their analytics dashboard. ' +
      'It can return a SINGLE metric, SEVERAL metrics, or the WHOLE analytics set, for a chosen time range. ' +
      'Available metrics include: followers, following, posts, engagement, engagement rate, reach, impressions, likes, comments, shares, saves, video views, ' +
      'new followers, lost followers, net follower growth, follower growth rate, profile visits, website clicks, published/failed posts, publishing success rate, ' +
      'and (for Facebook) reactions, page views, post clicks — plus audience demographics (countries, cities, gender/age) and top-performing posts. ' +
      'IMPORTANT — only request what the question needs: for "how many followers" pass metrics ["followers"]; for "how is my engagement this month" pass ["engagement"] with timeframe "30d"; ' +
      'for "give me a full analytics report" pass metrics ["all"]. Do NOT fetch everything for a single-metric question. ' +
      'Call this whenever the user asks anything factual about THIS account or wants analysis grounded in real numbers (performance, growth, audience, best posts, "how am I doing", "analyze my account", a specific metric, or a specific time period). ' +
      'Do NOT call it for greetings, general how-to/strategy questions, or brainstorming. Never guess numbers — always fetch them here.',
    parameters: {
      type: 'object',
      properties: {
        username: {
          type: 'string',
          description: 'Optional. The @handle to look up if the user names a specific connected account. Omit to use the account currently selected in the composer.',
        },
        metrics: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Which metrics the question needs, as plain words, e.g. ["followers"], ["reach","impressions"], ["engagement","likes","comments"], ["new followers","lost followers","follower growth"], ["profile visits","published posts"]. ' +
            'Use ["all"] (or omit) ONLY when the user wants the full/overall analytics. Prefer the minimal set.',
        },
        timeframe: {
          type: 'string',
          enum: ['today', '7d', '30d', '90d', '6m', '1y', 'all'],
          description: 'Time range for time-based metrics (default "30d"). Ignored for the current follower/following/posts totals. The system automatically caps this to the user\'s subscription plan (e.g. Free = 30 days).',
        },
        days: {
          type: 'number',
          description: 'Optional explicit number of days for the range (overrides timeframe). Also capped to the plan limit.',
        },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['audience', 'top_content'] },
          description: 'Optional extra sections: "audience" = demographics (countries/cities/gender-age); "top_content" = best-performing posts. Include only when the question needs them.',
        },
      },
      additionalProperties: false,
    },
  },
};

/** On-demand selected-account data tool (only when an account is selected). */
export const VEEGPT_ACCOUNT_TOOLS: ChatTool[] = [GET_ACCOUNT_DETAILS_TOOL];

/**
 * Edit tool: reschedule an existing scheduled post to a new time. The model
 * resolves WHICH post from the user's words (it should first look at the data
 * from get_workspace_data so it has the right contentId). Operates only on the
 * user's own workspace content.
 */
export const RESCHEDULE_POST_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'reschedule_post',
    description:
      'Change the scheduled time of an EXISTING scheduled post. ' +
      'First call get_workspace_data (scheduled_posts) to find the correct contentId and confirm which post the user means. ' +
      'Only call this when the user clearly asks to move/reschedule a specific scheduled post to a new time.',
    parameters: {
      type: 'object',
      properties: {
        contentId: { type: 'string', description: 'The id of the scheduled post to move (from get_workspace_data).' },
        scheduledLocal: { type: 'string', description: 'New time as "YYYY-MM-DDTHH:mm" in the user\'s LOCAL time.' },
      },
      required: ['contentId', 'scheduledLocal'],
      additionalProperties: false,
    },
  },
};

/**
 * Edit tool: cancel/unschedule an existing scheduled post (moves it back to a
 * draft — it is NOT published and NOT deleted).
 */
export const CANCEL_SCHEDULED_POST_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'cancel_scheduled_post',
    description:
      'Cancel/unschedule an EXISTING scheduled post so it will NOT publish (it becomes a draft; it is not deleted). ' +
      'First call get_workspace_data (scheduled_posts) to find the correct contentId. Only call when the user clearly asks to cancel/unschedule a specific scheduled post.',
    parameters: {
      type: 'object',
      properties: {
        contentId: { type: 'string', description: 'The id of the scheduled post to cancel (from get_workspace_data).' },
      },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
};

/**
 * Edit tool: update the caption/text of an existing post (draft or scheduled).
 */
export const UPDATE_POST_CAPTION_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'update_post_caption',
    description:
      'Update the caption/text of an EXISTING post (draft or scheduled). ' +
      'First call get_workspace_data to find the correct contentId. Only call when the user clearly asks to change/rewrite a specific post\'s caption.',
    parameters: {
      type: 'object',
      properties: {
        contentId: { type: 'string', description: 'The id of the post to edit (from get_workspace_data).' },
        caption: { type: 'string', description: 'The new caption/text for the post.' },
      },
      required: ['contentId', 'caption'],
      additionalProperties: false,
    },
  },
};

/**
 * Edit tool: permanently DELETE a post (draft, scheduled, or published record).
 * Confirm-required (renders an edit confirm card before applying).
 */
export const DELETE_POST_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'delete_post',
    description:
      'Permanently DELETE a post (draft or scheduled) from the user\'s workspace. This cannot be undone. ' +
      'First call get_workspace_data to find the correct contentId. Only call when the user clearly asks to delete/remove a specific post. The user must confirm before it is deleted.',
    parameters: {
      type: 'object',
      properties: {
        contentId: { type: 'string', description: 'The id of the post to delete (from get_workspace_data).' },
      },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
};

/**
 * Edit tool: duplicate an existing post into a new draft (optionally changing
 * the type, e.g. repost as a reel). Confirm-required.
 */
export const DUPLICATE_POST_TOOL: ChatTool = {
  type: 'function',
  function: {
    name: 'duplicate_post',
    description:
      'Create a COPY of an existing post as a new DRAFT (same caption/media), optionally changing the content type (e.g. repost as a reel). ' +
      'First call get_workspace_data to find the correct contentId. Only call when the user asks to duplicate/copy/repost an existing post.',
    parameters: {
      type: 'object',
      properties: {
        contentId: { type: 'string', description: 'The id of the post to duplicate (from get_workspace_data).' },
        asType: { type: 'string', enum: ['post', 'reel', 'story'], description: 'Optional new content type for the copy. Omit to keep the original type.' },
      },
      required: ['contentId'],
      additionalProperties: false,
    },
  },
};

/** Edit tools that MUTATE workspace content (only when a workspace is available). */
export const VEEGPT_EDIT_TOOLS: ChatTool[] = [RESCHEDULE_POST_TOOL, CANCEL_SCHEDULED_POST_TOOL, UPDATE_POST_CAPTION_TOOL, DELETE_POST_TOOL, DUPLICATE_POST_TOOL];
