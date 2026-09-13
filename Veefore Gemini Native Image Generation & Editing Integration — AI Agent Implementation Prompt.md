# Veefore Gemini Native Image Generation & Editing Integration

## Objective

Implement a production-ready image generation and image editing system inside Veefore using our existing Gemini infrastructure.

The key architectural requirement is:

**Do NOT create a separate "Nano Banana model" product, model selector, provider, or standalone AI system.**

Nano Banana is Google's native Gemini image-generation capability. It must be integrated underneath our existing Gemini provider/model infrastructure as an **image capability**.

The user should experience this as Veefore's own AI image creation/editing capability, not as "select Nano Banana".

The architecture should allow Veefore to use:

- Existing Gemini text/reasoning models for text, planning, analysis, prompt interpretation, etc.
- Gemini native image models only when an actual image generation/editing operation is required.
- OpenAI GPT where the existing Veefore architecture supports it for creative ideation/planning, if configured.
- No unnecessary image-model calls.

Do not break or replace the existing Gemini model integrations.

---

# 1. First inspect the existing codebase

Before changing anything, inspect the entire existing AI architecture and identify:

- Gemini provider implementation
- OpenAI provider implementation
- Existing model registry
- VeeGPT orchestration
- AI routing/model selection
- Credit/meting system
- Content Studio
- Existing image generation implementation, if any
- Existing asset/file storage
- Existing upload system
- Existing chat/conversation state
- Existing loading states
- Existing React components/design system
- Existing API routes/controllers/services
- Existing error handling
- Existing logging/observability
- Existing workspace/user authorization
- Existing subscription/feature limits

Do not create duplicate abstractions if equivalent infrastructure already exists.

Extend the existing architecture wherever possible.

Do not rewrite unrelated systems.

---

# 2. Core architecture

Implement a capability-oriented architecture rather than exposing individual image models to users.

Conceptually:

User
↓
Veefore UI
↓
VeeGPT / AI Orchestrator
↓
Intent + capability detection
↓
AI execution planner
↓
Gemini Provider / OpenAI Provider
↓
Image capability when required
↓
Asset storage
↓
Veefore UI

The important distinction is:

### Text request

Example:

"Give me 5 Instagram captions for a sneaker launch."

Do NOT call Nano Banana.

Use the existing text model routing.

### Image generation request

Example:

"Create a premium Instagram creative for my sneaker launch."

The system should detect:

`capability = IMAGE_GENERATION`

Then invoke Gemini's native image capability.

### Image editing request

Example:

"Remove the background from this image and put the product in a luxury studio."

Detect:

`capability = IMAGE_EDITING`

Then invoke Gemini's native image capability with the supplied image.

---

# 3. Do not expose Nano Banana as a user-facing model

There must NOT be a UI like:

Model:
- GPT
- Gemini
- Nano Banana
- Claude

for image creation.

Likewise, do not create a separate:

`Nano Banana Service`

that duplicates the Gemini provider.

Instead:

`GeminiProvider`

should internally support capabilities such as:

- text generation
- multimodal understanding
- image generation
- image editing

The image capability can internally map to the appropriate current Gemini image model.

For example:

```text
GeminiProvider
├── text
├── multimodal
└── image
    ├── generation
    └── editing
```

The exact implementation should follow the existing provider architecture.

---

# 4. Current Gemini image models

Use Google's current native image model identifiers.

Preferred general-purpose image model:

`gemini-3.1-flash-image`

This is Nano Banana 2.

For complex/high-quality/professional image work:

`gemini-3-pro-image`

This is Nano Banana Pro.

Do not hardcode these model IDs throughout the application.

Put them into the existing model/provider configuration or capability registry.

Example concept:

```ts
gemini:
  text:
    default: existing-current-gemini-text-model

  image:
    default: gemini-3.1-flash-image
    premium: gemini-3-pro-image
```

Adapt this to the project's existing configuration system rather than blindly implementing this exact structure.

Do not use deprecated preview image model IDs.

---

# 5. Intelligent image-model routing

The user must never need to decide which image model to use.

The system should automatically determine whether image generation/editing is necessary and, if so, which Gemini image capability is appropriate.

Default:

`gemini-3.1-flash-image`

Use the premium image model only when the task genuinely benefits from it.

Examples of tasks that can justify the premium image model:

- highly complex compositions
- professional advertising creatives
- difficult brand consistency
- complex multi-reference workflows
- high-fidelity creative direction
- complex text/layout requirements
- premium campaign assets
- situations where the normal image model repeatedly fails quality requirements

Do NOT automatically use the premium model for every request.

The goal is:

**best quality/cost/latency tradeoff, not maximum model usage.**

---

# 6. GPT + Gemini architecture

Where OpenAI GPT is already configured and available, use GPT as the creative/planning intelligence when appropriate.

The architecture should be:

```text
User request
    ↓
Intent detection
    ↓
Creative reasoning / planning
    ↓
Image specification
    ↓
Gemini native image generation/editing
    ↓
Result
```

For example:

User:

"Create an Instagram ad for my new premium sneaker."

GPT can determine:

- campaign objective
- target audience
- creative direction
- composition
- visual hierarchy
- tone
- typography requirements
- aspect ratio
- scene
- product positioning
- lighting
- background
- CTA
- brand constraints

Then the resulting structured image specification is passed to Gemini's native image capability.

Do NOT send the user's raw request blindly to the image model if Veefore's AI planning layer can improve it.

However:

**Do not call GPT unnecessarily.**

If the request is already sufficiently specific, the system may directly construct the image instruction using the existing AI orchestration layer.

Avoid:

User → GPT → Gemini text → GPT → Gemini image

unless each stage provides meaningful value.

Every additional model call costs money and increases latency.

---

# 7. Image generation

Support:

- text-to-image
- brand creative generation
- social media creatives
- thumbnails
- product creatives
- campaign creatives
- posters
- banners
- backgrounds
- concept images
- marketing graphics
- multiple aspect ratios

Support the image sizes/aspect ratios available from the selected Gemini image model.

Do not invent unsupported parameters.

Use the official Gemini API implementation currently supported by the project.

Prefer Google's current Interactions API for new image-generation functionality if compatible with the existing backend architecture.

If the project already has a stable Gemini integration, extend it rather than creating a second unrelated Gemini client.

---

# 8. Image editing

Support image + instruction workflows.

Examples:

"Remove the background."

"Change the background to a luxury studio."

"Make the lighting warmer."

"Change the shirt from black to white."

"Make this suitable for an Instagram advertisement."

"Add a premium product-photography environment."

"Keep the product exactly the same but change the background."

"Create a cinematic version."

"Expand this image to 9:16."

"Add my uploaded logo."

The original uploaded image must be passed to the image model as actual image input.

Do not merely describe the image in text and ask the model to recreate it.

---

# 9. Multi-turn editing

Implement an image editing session.

Example:

```text
Original image
      ↓
Edit 1: Remove background
      ↓
Edit 2: Add luxury studio
      ↓
Edit 3: Warm lighting
      ↓
Edit 4: Add logo
      ↓
Current image
```

Maintain an image-generation/editing session ID.

Store:

- original asset
- generated versions
- operation
- instruction
- model used
- timestamp
- workspace
- user
- credit usage
- parent asset ID
- resulting asset ID

Users should be able to continue editing the current image without losing previous versions.

Provide version history where compatible with the existing Asset Library.

---

# 10. Reference images

Support reference images where the Gemini image model supports them.

Use references for:

- product consistency
- character consistency
- brand style
- visual inspiration
- logo
- packaging
- clothing
- multiple product assets

Do not unnecessarily send every image from the user's workspace.

Only include references relevant to the current task.

Implement sensible limits according to the selected Gemini image model's current API limits.

---

# 11. Brand context

Integrate Veefore workspace/brand context when available.

For image generation, relevant brand context can include:

- brand name
- logo
- brand colors
- typography preferences
- visual style
- target audience
- industry
- campaign objective
- existing brand assets

Do not blindly inject the entire workspace database into the prompt.

Create a compact relevant brand context object.

Example:

```text
Brand:
Example Brand

Industry:
Fashion

Visual style:
Minimal, premium, modern

Primary colors:
Black / white

Audience:
18–30

Campaign:
New sneaker launch
```

Only include context relevant to the current generation.

---

# 12. Image generation UI

This is a major product requirement.

When an image is being created or edited, DO NOT show a generic spinner such as:

"Loading..."

Instead create a premium Veefore image-generation experience.

The UI should show a dedicated generation card/box containing:

- image preview area
- animated generation effect
- subtle shimmer/glow
- moving light/noise/gradient effect
- generation status
- current processing stage
- progress-like visual feedback
- cancel action if technically possible

The experience should feel like an AI creative engine is actively working.

Do not use purple as the primary visual color.

Follow Veefore's existing brand/design language.

---

# 13. Generation states

Implement explicit generation states.

Example:

```text
Preparing your creative
↓
Understanding your brief
↓
Building the visual direction
↓
Creating the composition
↓
Rendering the image
↓
Refining visual details
↓
Finalizing your creative
↓
Complete
```

For editing:

```text
Analyzing your image
↓
Understanding requested changes
↓
Applying the edit
↓
Refining details
↓
Finalizing image
↓
Complete
```

The exact messages should dynamically reflect the operation.

For example:

Background removal:

"Analyzing your image"
→ "Separating the subject"
→ "Removing the background"
→ "Refining edges"
→ "Finalizing image"

Image generation:

"Understanding your creative brief"
→ "Planning the composition"
→ "Creating the scene"
→ "Rendering details"
→ "Finalizing your creative"

---

# 14. Important: do not fake model progress

The UI may display friendly processing stages, but do NOT falsely claim that the Gemini API is currently performing a specific internal operation unless the API actually exposes that information.

The stages should represent Veefore's own pipeline state.

For example:

```text
PLANNING
IMAGE_GENERATION
POST_PROCESSING
STORAGE
COMPLETED
```

The frontend may map these backend states to user-friendly text.

Do not claim:

"Gemini is currently rendering the person's face"

unless that information is actually available.

---

# 15. Visual generation card

Create a reusable component rather than implementing the animation separately in every screen.

Conceptually:

```text
<ImageGenerationCard
    status="generating"
    stage="rendering"
    operation="image_generation"
    preview={previewImage}
/>
```

The component should support:

- generation
- editing
- variation
- background removal
- image expansion
- regeneration
- error
- completed
- cancelled

It should be reusable throughout Content Studio and any future Veefore feature that generates images.

---

# 16. Preview behavior

If the model/API provides intermediate visual output that can safely be displayed, show it.

Otherwise, do not fabricate intermediate images.

Instead show:

- existing image blurred/faded behind the effect for editing
- generated placeholder/skeleton for new generation
- animated visual processing layer
- final image transition

When the final image arrives:

```text
generation card
      ↓
smooth reveal
      ↓
final image
```

Avoid abrupt UI replacement.

---

# 17. Error states

Handle:

- Gemini API failure
- timeout
- rate limit
- invalid image
- unsupported format
- content-policy refusal
- insufficient credits
- provider outage
- storage failure
- malformed model response
- network failure
- user cancellation

Show useful user-facing messages.

Never expose raw provider errors/API keys/internal stack traces.

Example:

"Your image couldn't be generated this time. Your credits were not charged."

if no charge occurred.

If credits were reserved but the provider failed, follow the existing credit reconciliation/refund mechanism.

---

# 18. Credit metering

Integrate image generation into the existing Veefore credit system.

Do NOT create a separate image-credit currency.

Use the existing Veefore credit/metering architecture.

The flow must follow:

```text
Estimate
↓
Reserve credits atomically
↓
Execute provider call
↓
Measure actual usage/cost where available
↓
Reconcile
↓
Commit/refund difference
```

Do not simply deduct a fixed number of credits before calling the provider and permanently consume them if the request fails.

Respect:

- subscription limits
- workspace limits
- credit balance
- feature entitlement
- rate limits
- add-on credits

---

# 19. Asset storage

Do not store large image binary/base64 payloads directly in MongoDB unless the existing architecture explicitly requires it.

Store generated files in the existing object/file storage system.

MongoDB should store metadata such as:

```text
assetId
workspaceId
userId
type
operation
model
provider
sourceAssetId
prompt/instruction metadata
width
height
aspectRatio
storageUrl
createdAt
creditUsage
generationSessionId
```

Follow the existing Veefore asset schema if one already exists.

Do not create duplicate asset systems.

---

# 20. Security

Never expose Gemini/OpenAI API keys to the frontend.

All provider calls must occur server-side.

Validate:

- authenticated user
- workspace access
- subscription entitlement
- credit balance
- file ownership
- MIME type
- file size
- allowed image formats

Prevent users from using image generation against another workspace's assets.

---

# 21. API design

Follow the existing Veefore API conventions.

If equivalent endpoints do not exist, create clean endpoints such as:

```text
POST /api/ai/images/generate
POST /api/ai/images/edit
POST /api/ai/images/variation
GET  /api/ai/images/:generationId
POST /api/ai/images/:generationId/cancel
```

Do not blindly create all endpoints if the current API architecture already has equivalent routes.

The generation endpoint should return a generation ID/job ID when asynchronous processing is appropriate.

Example:

```json
{
  "generationId": "...",
  "status": "processing",
  "operation": "image_generation"
}
```

The frontend can then receive status updates through the existing realtime mechanism if available.

Prefer the existing WebSocket/SSE/job architecture if Veefore already has one.

Do not introduce polling if an existing realtime mechanism already exists.

---

# 22. Backend state machine

Use explicit generation states.

Example:

```text
QUEUED
PLANNING
GENERATING
POST_PROCESSING
STORING
COMPLETED
FAILED
CANCELLED
```

The frontend should render UI from these states.

Do not infer state from arbitrary strings returned by an AI provider.

---

# 23. Avoid unnecessary model calls

This is critical.

The system must NOT call an image model for:

- normal chat
- captions
- hashtags
- analytics
- recommendations
- strategy
- scheduling
- social listening
- text rewriting
- normal VeeGPT questions
- general image analysis where image generation is unnecessary

Call the Gemini native image capability only when:

```text
IMAGE_GENERATION
IMAGE_EDITING
IMAGE_VARIATION
IMAGE_TRANSFORMATION
IMAGE_EXPANSION
```

or another explicitly supported visual-generation capability is required.

If the user merely uploads an image and asks:

"What is in this image?"

Use existing multimodal/text vision capabilities instead of Nano Banana.

---

# 24. Don't confuse image understanding with image generation

This distinction must exist in the router.

Example:

User:
"Analyze this Instagram creative."

→ multimodal understanding.

User:
"Tell me what's wrong with this creative."

→ multimodal understanding + text reasoning.

User:
"Fix the problems you identified and regenerate the creative."

→ multimodal understanding + reasoning + image generation/editing.

User:
"Create a new creative based on this."

→ image generation.

---

# 25. Quality loop

For important image-generation workflows, optionally allow:

```text
Generate
↓
Evaluate
↓
Regenerate if necessary
```

Use GPT or existing multimodal reasoning to evaluate things such as:

- obvious instruction violations
- missing requested elements
- incorrect aspect ratio
- poor composition
- missing brand elements
- unreadable text
- incorrect product representation

Do NOT create an infinite regeneration loop.

Use a strict maximum retry count.

Do not regenerate automatically if the result is acceptable.

Every additional generation costs money.

---

# 26. Prompt construction

Do not let arbitrary user input directly control provider configuration.

Build a structured internal image instruction from:

```text
User intent
+
Creative brief
+
Brand context
+
Reference images
+
Platform
+
Aspect ratio
+
Output requirements
+
Safety constraints
```

The prompt should prioritize:

1. User's actual requested change
2. Preservation requirements
3. Brand requirements
4. Composition
5. Visual style
6. Technical output requirements

For editing, explicitly state what must remain unchanged when necessary.

Example:

"Preserve the product's shape, logo, proportions, material texture and color. Change only the background and lighting."

This is important for product creatives.

---

# 27. Social-platform awareness

When the user requests an image for a social platform, automatically use the appropriate aspect ratio when it can be reliably determined from Veefore's existing platform configuration.

Examples:

Instagram Post
Instagram Story/Reel
YouTube Thumbnail
LinkedIn Post
Facebook Post
etc.

Do not hardcode assumptions if Veefore already has platform metadata.

Allow the user to override the format.

---

# 28. Multiple variations

If the user asks:

"Create 4 options."

Do not assume that one model call will reliably return exactly four images.

The backend should handle multiple variations according to the provider's actual capabilities and response behavior.

If multiple calls are required:

- reserve appropriate credits
- execute within concurrency limits
- track each result
- preserve the parent generation ID
- return all successful assets
- reconcile failed generations correctly

Do not silently charge for failed outputs.

---

# 29. Observability

Add structured logging for:

- generation ID
- user/workspace ID
- provider
- capability
- selected internal image model
- latency
- success/failure
- retry count
- credit reservation
- actual credit usage
- output dimensions
- error category

Never log:

- API keys
- raw private user images
- sensitive user content
- unnecessary full prompts if the existing privacy policy does not permit it

---

# 30. Configuration

Do not hardcode API keys.

Use the existing environment/configuration system.

Add only the required configuration values.

Example conceptually:

```text
GEMINI_API_KEY
OPENAI_API_KEY
```

Reuse existing keys if already configured.

For image model IDs, use configuration/constants rather than scattering strings throughout the code.

---

# 31. Frontend UX

The Content Studio should feel like a professional AI creative tool.

When generation starts:

```text
┌──────────────────────────────────────────┐
│                                          │
│          [animated visual effect]        │
│                                          │
│       Creating your creative             │
│                                          │
│       Building visual direction          │
│                                          │
│       ━━━━━━━━━━━━━━━░░░░░               │
│                                          │
└──────────────────────────────────────────┘
```

For editing:

```text
┌──────────────────────────────────────────┐
│                                          │
│       [existing image preview]           │
│          animated processing             │
│                                          │
│       Applying your changes              │
│       Refining image details             │
│                                          │
└──────────────────────────────────────────┘
```

The exact visual design should match the existing Veefore UI.

Do not introduce a random new design language.

Do not use purple as the primary color.

Use existing Veefore typography, spacing, radius, shadows and color tokens wherever possible.

---

# 32. Animation requirements

Use performant CSS/React animations.

The generation effect should feel premium but not distracting.

Possible effects:

- shimmer
- subtle moving gradient
- scanning light
- soft glow
- image blur-to-sharp transition
- skeleton composition
- animated border
- subtle particles if the existing design language supports them

Do not use excessive animations that increase CPU/GPU usage on mobile.

Respect `prefers-reduced-motion`.

---

# 33. Mobile responsiveness

The image-generation experience must work properly on:

- desktop
- tablet
- mobile

The generated image should never overflow its container.

Editing controls should remain usable on mobile.

Do not build desktop-only interactions.

---

# 34. Final user experience

The desired experience is:

User:

"Create a premium Instagram creative for my clothing brand."

Veefore:

1. Understands the request.
2. Determines that image generation is required.
3. Builds the creative direction.
4. Shows the generation card immediately.
5. Displays a meaningful generation state.
6. Calls the appropriate Gemini native image capability.
7. Receives the generated image.
8. Saves it to the Veefore asset system.
9. Reconciles credits.
10. Smoothly reveals the final image.
11. Gives the user actions such as:
   - Edit
   - Regenerate
   - Create variation
   - Download/export
   - Schedule
   - Add to campaign
   - Save to library

The user should never need to understand which underlying model generated the image.

---

# 35. Important implementation constraints

Do NOT:

- create a separate Nano Banana product
- create a Nano Banana model selector
- expose Gemini image model names to normal users
- replace existing Gemini text models
- replace VeeGPT
- call an image model for normal text requests
- make unnecessary GPT calls
- make unnecessary Gemini calls
- duplicate the existing provider architecture
- duplicate the existing credit system
- duplicate asset storage
- store API keys on the frontend
- permanently deduct credits before successful execution
- fake provider/model progress
- expose raw provider errors
- use deprecated Gemini image preview model IDs
- introduce purple UI
- rewrite unrelated working code
- create a second AI orchestration system

---

# 36. Implementation process

Follow this order:

### Phase 1 — Audit

Inspect the repository and document the existing:

- AI providers
- model registry
- VeeGPT orchestration
- Content Studio
- asset system
- credit system
- queues/jobs
- realtime system
- UI components

### Phase 2 — Architecture

Extend the existing architecture with:

- image capability
- image generation/editing service
- model routing
- generation state machine

### Phase 3 — Backend

Implement:

- generation
- editing
- reference images
- session/versioning
- credit reservation/reconciliation
- asset storage
- errors
- logging

### Phase 4 — Frontend

Implement:

- generation card
- animated processing state
- editing state
- result reveal
- error state
- retry
- cancel where supported
- responsive behavior

### Phase 5 — Integration

Connect:

- VeeGPT
- Gemini
- OpenAI where useful
- Content Studio
- Asset Library
- credits
- workspace permissions

### Phase 6 — Testing

Test at minimum:

1. Normal VeeGPT text request → no image model.
2. Image generation → Gemini image capability.
3. Image editing → Gemini image capability with input image.
4. Image analysis → no image generation.
5. GPT planning → image generation.
6. Insufficient credits → blocked before provider call.
7. Provider failure → credits reconciled.
8. Multiple variations.
9. Mobile UI.
10. Generation cancellation.
11. Invalid image.
12. Large image.
13. Multiple reference images.
14. Multi-turn editing.
15. Workspace authorization.
16. Concurrent generations.
17. Retry after failure.
18. Existing Gemini text functionality still works.

---

# 37. Definition of done

The implementation is complete only when:

- Existing Gemini text models continue working.
- Existing VeeGPT functionality continues working.
- Gemini native image generation works.
- Gemini native image editing works.
- Nano Banana is NOT exposed as a separate user-facing model.
- Image generation is automatically invoked only when required.
- GPT is used for creative reasoning only where it adds meaningful value.
- The appropriate Gemini image capability is automatically selected.
- Credits use the existing Veefore metering architecture.
- Generated assets are persisted correctly.
- Multi-turn editing works.
- Generation states are visible in the UI.
- The generation card has the premium animated visual treatment.
- No fake internal model progress is shown.
- Errors are handled safely.
- Mobile UX works.
- No unnecessary provider calls are introduced.
- No existing unrelated functionality is broken.

Before finishing, run the existing test suite, type checks, linting and build. Fix any regressions introduced by this implementation.

Do not stop after creating the API integration. The backend, model routing, credit handling, asset persistence and frontend generation experience must all work together as one production-ready Veefore feature.