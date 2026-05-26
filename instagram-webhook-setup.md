# Instagram Webhook Real-Time Automation Setup

## Overview
VeeFore's Instagram webhook system enables real-time automated responses to comments, DMs, and mentions using advanced contextual AI that understands multiple languages and adapts to customer personalities.

## Webhook Configuration

### 1. Instagram App Setup
To enable real-time automation, configure your Instagram app in Facebook Developer Console:

1. Go to [Facebook Developer Console](https://developers.facebook.com/)
2. Navigate to your Instagram Basic Display app
3. Go to "Webhooks" section
4. Add webhook URL: `https://your-domain.replit.app/webhook/instagram`
5. Subscribe to these events:
   - `comments` - New comments on posts
   - `messages` - Direct messages
   - `mentions` - When your account is mentioned

### 2. Required Environment Variables
```
INSTAGRAM_APP_SECRET=your_app_secret_here
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=your_verification_token_here
```

### 3. Webhook Events Supported

#### Comment Events
- Triggers when users comment on your Instagram posts
- AI analyzes comment content, language, and tone
- Generates contextual responses based on automation rules

#### Direct Message Events
- Triggers when users send DMs
- Supports Hindi, Hinglish, and English detection
- Matches customer communication style and personality

#### Mention Events
- Triggers when your account is mentioned in posts/stories
- Can respond with contextual engagement

## AI-Powered Automation Features

### Contextual Response Generation
- **Language Detection**: Automatically detects Hindi, Hinglish, English, and internet slang
- **Tone Matching**: Analyzes customer's communication style (formal, casual, friendly, etc.)
- **Personality Adaptation**: Responds with configured brand personality
- **Context Awareness**: Understands conversation history and content context

### Response Personalization
- **Friendly & Approachable**: Warm, welcoming responses
- **Professional & Polite**: Business-appropriate communication
- **Casual & Relaxed**: Informal, conversational tone
- **Enthusiastic & Energetic**: Excited, positive responses
- **Helpful & Supportive**: Problem-solving, assistance-focused

### Response Length Control
- **Short**: 1-2 sentences for quick acknowledgments
- **Medium**: 2-3 sentences for balanced responses
- **Long**: 3-4 sentences for detailed engagement

## How Real-Time Automation Works

### 1. Webhook Reception
```
POST /webhook/instagram
{
  "object": "instagram",
  "entry": [{
    "id": "instagram_business_account_id",
    "time": 1234567890,
    "changes": [{
      "field": "comments",
      "value": {
        "from": { "id": "user_id", "username": "user_handle" },
        "text": "Great post! Kya price hai?",
        "post_id": "post_id"
      }
    }]
  }]
}
```

### 2. AI Processing Pipeline
1. **Event Validation**: Verify webhook signature for security
2. **Account Matching**: Find corresponding workspace and social account
3. **Rule Evaluation**: Check active automation rules for the workspace
4. **Content Analysis**: AI analyzes message language, tone, and intent
5. **Response Generation**: Create contextual response using configured personality
6. **Delivery**: Send response with optional delay settings

### 3. Example Automation Flow

**User Comment**: "Love this! Kitne ka hai yeh product?"
**AI Analysis**: 
- Language: Hinglish (Hindi + English)
- Intent: Product inquiry
- Tone: Enthusiastic, casual

**Generated Response** (Friendly personality): 
"Thank you so much! 😊 Is product ki price ₹2,999 hai. DM mein more details share kar sakte hain!"

## Security Features

### Webhook Verification
- Instagram signature validation using HMAC-SHA256
- Prevents unauthorized webhook calls
- Protects against replay attacks

### Rate Limiting
- Configurable response delays
- Maximum responses per day limits
- Prevents spam and API abuse

## Testing Webhook Integration

### 1. Webhook Verification Test
```bash
curl -X GET "https://your-domain.replit.app/webhook/instagram?hub.mode=subscribe&hub.verify_token=your_token&hub.challenge=test_challenge"
```

### 2. Test Comment Event
```bash
curl -X POST "https://your-domain.replit.app/webhook/instagram" \
  -H "X-Hub-Signature-256: sha256=signature" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "instagram",
    "entry": [{
      "id": "account_id",
      "time": 1234567890,
      "changes": [{
        "field": "comments",
        "value": {
          "from": {"id": "user123", "username": "testuser"},
          "text": "Amazing post! Price kya hai?",
          "post_id": "post123"
        }
      }]
    }]
  }'
```

## Monitoring and Analytics

### Automation Logs
- Real-time event processing logs
- Response generation analytics
- Error tracking and debugging
- Performance metrics

### Dashboard Metrics
- Response success rate
- Average response time
- Language distribution
- Customer engagement improvements

## Advanced Configuration

### Custom Triggers
- Keyword-based rules for specific responses
- Time-based automation schedules
- Follower count thresholds
- Exclude keyword filters

### Multi-language Support
The AI system automatically handles:
- **Hindi**: "यह बहुत अच्छा है!"
- **Hinglish**: "Yeh product kitne ka hai?"
- **English**: "What's the price of this item?"
- **Internet Slang**: "This is lit! Price batao"

### Business Hours
- Configure active hours for responses
- Timezone-aware scheduling
- Weekend/holiday settings
- Auto-pause during maintenance

## Best Practices

### 1. Response Quality
- Use authentic brand voice consistently
- Maintain helpful and engaging tone
- Provide value in every interaction
- Include clear call-to-actions

### 2. Customer Experience
- Respond quickly to maintain engagement
- Personalize responses based on user behavior
- Escalate complex queries to human agents
- Monitor feedback and adjust accordingly

### 3. Compliance
- Follow Instagram's automation policies
- Respect user privacy and data protection
- Maintain transparency about automated responses
- Provide easy opt-out mechanisms

## Troubleshooting

### Common Issues
1. **Webhook not receiving events**: Check URL and SSL certificate
2. **Authentication failures**: Verify app secret and tokens
3. **Response delays**: Check rate limiting settings
4. **Language detection errors**: Review AI model configuration

### Debug Endpoints
- `GET /api/automation/logs/{workspaceId}` - View automation logs
- `GET /api/automation/rules/{workspaceId}` - Check active rules
- `POST /api/automation/test-webhook` - Manual webhook testing

## Integration Examples

### E-commerce Store
- Product inquiries → Price and availability responses
- Order status → Tracking information and support
- Complaints → Immediate acknowledgment and escalation

### Service Business
- Appointment requests → Availability and booking links
- Service inquiries → Package details and consultations
- Reviews → Appreciation and engagement

### Content Creator
- Content appreciation → Thank you and engagement
- Collaboration requests → Contact information sharing
- Fan questions → Personalized responses and community building

This comprehensive webhook system transforms static Instagram presence into dynamic, AI-powered customer engagement that operates 24/7 with authentic, contextual responses.